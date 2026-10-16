import { describe, it, expect } from 'vitest';
import { getWeatherLabel, getLunchHint } from './weather';
import type { WeatherData } from '../services/weather';

describe('getWeatherLabel', () => {
  it('맑은 날씨 (코드 0)', () => {
    const label = getWeatherLabel(0);
    expect(label.label).toBe('맑음');
    expect(label.emoji).toBe('☀️');
  });

  it('흐린 날씨 (코드 3)', () => {
    const label = getWeatherLabel(3);
    expect(label.label).toBe('흐림');
    expect(label.emoji).toBe('☁️');
  });

  it('비 (코드 61)', () => {
    const label = getWeatherLabel(61);
    expect(label.label).toBe('비');
    expect(label.emoji).toBe('🌧️');
  });

  it('눈 (코드 71)', () => {
    const label = getWeatherLabel(71);
    expect(label.label).toBe('눈');
    expect(label.emoji).toBe('❄️');
  });

  it('뇌우 (코드 95)', () => {
    const label = getWeatherLabel(95);
    expect(label.label).toBe('뇌우');
    expect(label.emoji).toBe('⛈️');
  });

  it('모르는 코드는 기본값', () => {
    const label = getWeatherLabel(999);
    expect(label.label).toBe('알 수 없음');
    expect(label.emoji).toBe('🌍');
  });
});

describe('getLunchHint', () => {
  it('현재 비가 오면 가까운 곳 추천 + 액션', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 20,
        apparent_temperature: 20,
        precipitation: 1,
        rain: 1,
        snowfall: 0,
        weather_code: 61,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('비가 와요');
    expect(hint?.action).toBe('setWalkFilter5');
  });

  it('현재 눈이 오면 가까운 곳 추천', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: -5,
        apparent_temperature: -5,
        precipitation: 0,
        rain: 0,
        snowfall: 1,
        weather_code: 71,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('눈이 와요');
    expect(hint?.action).toBe('setWalkFilter5');
  });

  it('점심시간(11-13시)에 강수 확률 50% 이상이면 가까운 곳 추천', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 20,
        apparent_temperature: 20,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 2,
        wind_speed_10m: 5,
      },
      hourly: {
        precipitation_probability: [0, 0, 30, 50, 70, 30, 0],
        temperature_2m: [15, 16, 18, 20, 19, 17, 16],
        weather_code: [2, 2, 2, 2, 2, 2, 2],
        time: ['2026-10-16T10:00', '2026-10-16T11:00', '2026-10-16T12:00', '2026-10-16T13:00', '2026-10-16T14:00', '2026-10-16T15:00', '2026-10-16T16:00'],
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('점심때 비 소식');
    expect(hint?.action).toBe('setWalkFilter5');
  });

  it('체감 온도 31도 이상이면 가까운 곳 추천', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 30,
        apparent_temperature: 31,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('더워요');
    expect(hint?.action).toBe('setWalkFilter5');
  });

  it('체감 온도 -5도 이하이면 가까운 곳 추천', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: -5,
        apparent_temperature: -6,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('추워요');
    expect(hint?.action).toBe('setWalkFilter5');
  });

  it('맑고 적당한 온도이면 긍정적인 메시지, 액션 없음', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 20,
        apparent_temperature: 20,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.message).toContain('걷기 좋은 날이에요');
    expect(hint?.action).toBeUndefined();
  });

  it('흐린 날씨이지만 강수 없고 온도 적당하면 힌트 없음', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 15,
        apparent_temperature: 15,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 3,
        wind_speed_10m: 5,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).toBeNull();
  });

  it('우박(코드 82)은 강수로 판정', () => {
    const data: WeatherData = {
      current: {
        temperature_2m: 10,
        apparent_temperature: 10,
        precipitation: 2,
        rain: 0,
        snowfall: 0,
        weather_code: 82,
        wind_speed_10m: 10,
      },
    };
    const hint = getLunchHint(data);
    expect(hint).not.toBeNull();
    expect(hint?.action).toBe('setWalkFilter5');
  });
});

describe('안개', () => {
  it('안개는 비로 치지 않는다', () => {
    const hint = getLunchHint({ current: { temperature_2m: 12, apparent_temperature: 11, precipitation: 0, rain: 0, snowfall: 0, weather_code: 45, wind_speed_10m: 2 } });
    expect(hint).toBeNull();
  });
});
