/**
 * 경마·레이싱 날씨 — 눈·비·안개·바람 등이 경기를 영향한다.
 * 계절도 여기서 고르니, 디바이스 시각대(KST)로 자동 선택할 수 있다.
 *
 * 모든 값은 seeded random 으로 재생 가능하게 정한다.
 */

export type Season = 'auto' | 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'rain' | 'snow' | 'fog' | 'wind';

export const SEASONS: readonly Season[] = ['auto', 'spring', 'summer', 'autumn', 'winter'];
export const SEASON_LABEL: Record<Season, string> = {
  auto: '자동',
  spring: '봄',
  summer: '여름',
  autumn: '가을',
  winter: '겨울',
};

export const WEATHERS: readonly Weather[] = ['clear', 'rain', 'snow', 'fog', 'wind'];
export const WEATHER_LABEL: Record<Weather, string> = {
  clear: '맑음',
  rain: '비',
  snow: '눈',
  fog: '안개',
  wind: '바람',
};

/**
 * KST 현재 월에서 계절을 고른다.
 * 3~5: 봄, 6~8: 여름, 9~11: 가을, 12·1·2: 겨울.
 */
export function seasonByMonth(): Exclude<Season, 'auto'> {
  const month = new Date().getMonth() + 1; // 1~12
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

/**
 * 계절을 정한다 — auto면 현재 달로.
 */
export function resolveSeason(season: Season): Exclude<Season, 'auto'> {
  return season === 'auto' ? seasonByMonth() : season;
}

/**
 * seeded random으로 날씨를 고른다.
 * 계절이 겨울이면 눈이 더 자주, 어느 계절이든 맑음이 가장 많다.
 * 비 · 눈 · 안개 · 바람은 지금 여기서 고른다.
 */
export function pickWeather(
  random: () => number,
  season: Exclude<Season, 'auto'>,
): Weather {
  const roll = random();

  // 맑음 55%, 그 외 45%
  if (roll < 0.55) return 'clear';

  // 계절별 확률
  const remaining = roll - 0.55;
  if (season === 'winter') {
    // 겨울: 눈 35%, 비 6%, 안개 2%, 바람 2%
    if (remaining < 0.35) return 'snow';
    if (remaining < 0.41) return 'rain';
    if (remaining < 0.43) return 'fog';
    return 'wind';
  }

  // 기타 계절: 비 20%, 눈 10%, 안개 10%, 바람 5%
  if (remaining < 0.20) return 'rain';
  if (remaining < 0.30) return 'snow';
  if (remaining < 0.40) return 'fog';
  return 'wind';
}

/** 날씨에 따른 경주 옵션 수정 — 예: 비면 미끄러짐 더 자주. */
export interface WeatherModifier {
  /** 미끄러짐 확률 승수(1 = 그대로). */
  slipChance?: number;
  /** 휘청 확률 승수. */
  wobbleChance?: number;
}

export function weatherModifiers(weather: Weather): WeatherModifier {
  switch (weather) {
    case 'rain':
      // 비: 미끄러짐 2배
      return { slipChance: 2 };
    case 'snow':
      // 눈: 휘청 1.5배, 미끄러짐도 약간 증가
      return { wobbleChance: 1.5, slipChance: 1.2 };
    case 'fog':
    case 'wind':
      // 안개, 바람: 시각 효과만(경기 옵션에 영향 없음)
      return {};
    default:
      return {};
  }
}

/**
 * 날씨를 문자로 설명 — 경주 라인 메시지에 쓴다.
 */
export function weatherDescription(weather: Weather): string {
  switch (weather) {
    case 'rain':
      return '비가 와요! 미끄러운 트랙';
    case 'snow':
      return '눈이 와요! 얼음 같은 길';
    case 'fog':
      return '안개가 자욱해요';
    case 'wind':
      return '바람이 세요!';
    default:
      return '맑은 날씨';
  }
}
