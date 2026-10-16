/**
 * 계절 테마 — 봄(3~5월)·여름(6~8월)·가을(9~11월)·겨울(12~2월).
 * 사용자는 자동(기기 설정 따름)·각 계절·끄기를 고를 수 있다.
 * 고른 값은 이 브라우저에만 남는다.
 */
export type SeasonMode = 'auto' | 'spring' | 'summer' | 'autumn' | 'winter' | 'off';

const KEY = 'lunch-app:season';

/**
 * 주어진 날짜에서 계절을 판단한다. KST 기준.
 * @example seasonOf(new Date(2024, 2, 1)) => 'spring'  // 3월
 * @example seasonOf(new Date(2024, 11, 1)) => 'winter' // 12월
 */
export function seasonOf(date: Date): 'spring' | 'summer' | 'autumn' | 'winter' {
  // KST(UTC+9)로 변환해야 국경선에서 정확함.
  const kstDate = new Date(date.getTime() + 9 * 3600 * 1000);
  const month = kstDate.getUTCMonth() + 1;
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter';
}

export function savedSeason(): SeasonMode {
  try {
    const v = window.localStorage.getItem(KEY);
    const valid = ['auto', 'spring', 'summer', 'autumn', 'winter', 'off'];
    return valid.includes(v || '') ? (v as SeasonMode) : 'auto';
  } catch {
    return 'auto';
  }
}

/** 지금 실제로 쓰는 계절. */
export function resolvedSeason(mode: SeasonMode): 'spring' | 'summer' | 'autumn' | 'winter' | 'off' {
  if (mode === 'off') return 'off';
  if (mode === 'auto') return seasonOf(new Date());
  return mode;
}

export function applySeason(mode: SeasonMode): void {
  const root = document.documentElement;
  const season = resolvedSeason(mode);
  if (season === 'off') {
    root.removeAttribute('data-season');
  } else {
    root.setAttribute('data-season', season);
  }
}

export function saveSeason(mode: SeasonMode): void {
  try {
    if (mode === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode);
  } catch {
    // 사생활 보호 모드 — 이번 방문 동안만 적용된다.
  }
  applySeason(mode);
  // 게임 분위기(useAmbience)가 계절을 다시 읽는다.
  window.dispatchEvent(new Event('lunch-app:season'));
}

/** 첫 그리기 전에 한 번. 자동이면 날짜가 바뀔 때 따라간다. */
export function initSeason(): void {
  applySeason(savedSeason());
}
