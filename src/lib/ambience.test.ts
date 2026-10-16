// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { OVERRIDE_KEY, resolveAmbience, weatherFromCode, weekdayKST } from './ambience';

afterEach(() => localStorage.clear());

describe('게임 분위기', () => {
  it('WMO 코드를 다섯 날씨로 줄인다', () => {
    expect(weatherFromCode(0)).toBe('clear');
    expect(weatherFromCode(3)).toBe('cloudy');
    expect(weatherFromCode(45)).toBe('fog');
    expect(weatherFromCode(61)).toBe('rain');
    expect(weatherFromCode(73)).toBe('snow');
    expect(weatherFromCode(null)).toBe('clear');
  });

  it('요일은 KST 로 센다 — UTC 금요일 16시는 KST 토요일', () => {
    expect(weekdayKST(new Date('2026-10-16T16:00:00Z'))).toBe(6);
  });

  it('계절 테마를 끄면 달로 정한다', () => {
    localStorage.setItem('lunch-app:season', 'off');
    expect(resolveAmbience(null, new Date('2026-01-10T03:00:00Z')).season).toBe('winter');
  });

  it('개발용 덮어쓰기가 이기고, 이상한 값은 버린다', () => {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ season: 'spring', weather: 'hail', weekday: 5 }));
    const a = resolveAmbience(61, new Date('2026-10-16T03:00:00Z'));
    expect(a).toEqual({ season: 'spring', weekday: 5, weather: 'rain' });
  });
});
