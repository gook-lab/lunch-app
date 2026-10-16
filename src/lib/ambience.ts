/**
 * 게임 분위기 — 계절·요일·날씨. 게임은 이 값으로 배경·옷차림·등장 생물을 바꾼다.
 *
 * 연출 전용이다. 당첨·후보·확률에는 절대 닿지 않는다(GameProps 주석의 공정성 계약).
 * - 계절: 설정의 계절 테마. 끄기면 달로 정한다(게임 그림은 계절이 있어야 한다).
 * - 요일: KST. 0=일 … 6=토. 금요일엔 들뜬 장식 같은 것을 넣을 수 있다.
 * - 날씨: 회사 좌표의 실제 날씨(Open-Meteo). 못 받으면 'clear'.
 * 개발·스크린샷용으로 localStorage 'lunch-app:ambience' 에 JSON 을 넣으면 그 값이 이긴다.
 *   예: {"season":"winter","weather":"snow","weekday":5}
 */
import { savedSeason, seasonOf } from './season';

export type AmbienceSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type AmbienceWeather = 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog';

export interface Ambience {
  season: AmbienceSeason;
  weekday: number;
  weather: AmbienceWeather;
}

export const AMBIENCE_SEASONS: readonly AmbienceSeason[] = ['spring', 'summer', 'autumn', 'winter'];
export const AMBIENCE_WEATHERS: readonly AmbienceWeather[] = ['clear', 'cloudy', 'rain', 'snow', 'fog'];
export const OVERRIDE_KEY = 'lunch-app:ambience';

/** WMO 날씨 코드 → 분위기 날씨. */
export function weatherFromCode(code: number | null | undefined): AmbienceWeather {
  if (code == null) return 'clear';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 3) return 'cloudy';
  return 'clear';
}

export function weekdayKST(now: Date = new Date()): number {
  return new Date(now.getTime() + 9 * 3600 * 1000).getUTCDay();
}

export function seasonForGames(now: Date = new Date()): AmbienceSeason {
  const mode = savedSeason();
  if (mode === 'auto' || mode === 'off') return seasonOf(now);
  return mode;
}

function readOverride(): Partial<Ambience> {
  try {
    const raw = window.localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Partial<Ambience>;
    const out: Partial<Ambience> = {};
    if (v.season && AMBIENCE_SEASONS.includes(v.season)) out.season = v.season;
    if (v.weather && AMBIENCE_WEATHERS.includes(v.weather)) out.weather = v.weather;
    if (typeof v.weekday === 'number' && v.weekday >= 0 && v.weekday <= 6) out.weekday = v.weekday;
    return out;
  } catch {
    return {};
  }
}

export function resolveAmbience(weatherCode: number | null, now: Date = new Date()): Ambience {
  return {
    season: seasonForGames(now),
    weekday: weekdayKST(now),
    weather: weatherFromCode(weatherCode),
    ...readOverride(),
  };
}

export const SEASON_NAME: Record<AmbienceSeason, string> = {
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};
export const WEATHER_NAME: Record<AmbienceWeather, string> = {
  clear: '맑음',
  cloudy: '흐림',
  rain: '비',
  snow: '눈',
  fog: '안개',
};
export const WEEKDAY_NAME = ['일', '월', '화', '수', '목', '금', '토'] as const;
