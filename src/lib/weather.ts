/**
 * 날씨 정보 유틸리티.
 *
 * WMO 기상 현상 코드 → 한글 레이블 + 이모지.
 * 점심 선택에 유용한 힌트 (비/눈이 오거나 매우 덥거나 추우면 보행 시간을 줄이라는 조언).
 */

import type { WeatherData } from '../services/weather';

/**
 * WMO 기상 현상 코드 (0–99).
 * 참고: https://www.open-meteo.com/en/docs
 *
 * 0: Clear sky
 * 1–3: Mainly clear, partly cloudy
 * 45–48: Foggy, depositing rime fog
 * 51–55: Drizzle
 * 61–63: Rain
 * 71–75: Snow
 * 77: Snow grains
 * 80–82: Rain showers
 * 85–86: Snow showers
 * 95–99: Thunderstorm
 */
interface WeatherLabel {
  label: string;
  emoji: string;
}

const WMO_CODES: Record<number, WeatherLabel> = {
  0: { label: '맑음', emoji: '☀️' },
  1: { label: '구름 조금', emoji: '🌤' },
  2: { label: '구름', emoji: '⛅' },
  3: { label: '흐림', emoji: '☁️' },
  45: { label: '안개', emoji: '🌫️' },
  48: { label: '안개', emoji: '🌫️' },
  51: { label: '이슬비', emoji: '🌦️' },
  53: { label: '이슬비', emoji: '🌦️' },
  55: { label: '이슬비', emoji: '🌦️' },
  61: { label: '비', emoji: '🌧️' },
  63: { label: '비', emoji: '🌧️' },
  65: { label: '빗소나기', emoji: '🌧️' },
  71: { label: '눈', emoji: '❄️' },
  73: { label: '눈', emoji: '❄️' },
  75: { label: '눈', emoji: '❄️' },
  77: { label: '눈', emoji: '❄️' },
  80: { label: '빗소나기', emoji: '🌧️' },
  81: { label: '빗소나기', emoji: '🌧️' },
  82: { label: '폭우', emoji: '⛈️' },
  85: { label: '눈소나기', emoji: '❄️' },
  86: { label: '눈소나기', emoji: '❄️' },
  95: { label: '뇌우', emoji: '⛈️' },
  96: { label: '뇌우', emoji: '⛈️' },
  99: { label: '뇌우', emoji: '⛈️' },
};

export function getWeatherLabel(code: number): WeatherLabel {
  return WMO_CODES[code] ?? { label: '알 수 없음', emoji: '🌍' };
}

export interface LunchHint {
  message: string;
  action?: 'setWalkFilter5'; // 5분 이하로 필터 설정하기
}

/**
 * 현재 날씨와 시간대별 강수 예측을 보고,
 * 점심 가게 선택에 유용한 조언을 만든다.
 *
 * - 현재 또는 11–13시에 비/눈 또는 강수 확률 ≥ 50% → 가까운 곳 추천
 * - 체감 온도 ≥ 31°C (매우 더움) → 가까운 곳 추천
 * - 체감 온도 ≤ -5°C (매우 추움) → 가까운 곳 추천
 * - 그 외 → 긍정적인 메시지
 */
export function getLunchHint(data: WeatherData): LunchHint | null {
  const current = data.current;
  const hourly = data.hourly;

  // 현재 강수 중
  const isRainingNow = current.precipitation > 0 || current.rain > 0 || current.snowfall > 0;

  // 11–13시 강수 확률이 50% 이상인지 확인
  let precipChance50InMealTime = false;
  if (hourly && hourly.time) {
    for (let i = 0; i < hourly.time.length; i++) {
      const hour = new Date(hourly.time[i]).getHours();
      if (hour >= 11 && hour <= 13) {
        if ((hourly.precipitation_probability[i] ?? 0) >= 50) {
          precipChance50InMealTime = true;
          break;
        }
      }
    }
  }

  // 비 또는 눈 코드 판별
  const isWetWeather = [45, 48, 51, 53, 55, 61, 63, 65, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99].includes(
    current.weather_code,
  );

  if (isRainingNow || isWetWeather || precipChance50InMealTime) {
    const hint: LunchHint = {
      message: '비가 와요 · 가까운 곳(도보 5분 안)을 추천해요',
      action: 'setWalkFilter5',
    };
    return hint;
  }

  // 체감 온도 ≥ 31°C (매우 더움)
  if (current.apparent_temperature >= 31) {
    const hint: LunchHint = {
      message: '날씨가 더워요 · 가까운 곳을 추천해요',
      action: 'setWalkFilter5',
    };
    return hint;
  }

  // 체감 온도 ≤ -5°C (매우 추움)
  if (current.apparent_temperature <= -5) {
    const hint: LunchHint = {
      message: '날씨가 추워요 · 가까운 곳을 추천해요',
      action: 'setWalkFilter5',
    };
    return hint;
  }

  // 날씨가 좋으면 긍정적인 메시지
  if ([0, 1, 2].includes(current.weather_code)) {
    return {
      message: '걷기 좋은 날이에요',
    };
  }

  // 그 외 경우
  return null;
}
