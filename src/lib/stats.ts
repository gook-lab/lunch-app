/**
 * 이번 달 점심 통계와 뱃지 — 표시 전용 (공정성 무관).
 *
 * 통계는 PlaceList 목록 탭의 "이번 달 점심" 섹션에 표시할 뿐이다.
 * 게임 규칙·후보 산출·당첨에 영향을 주지 않는다.
 */

import type { DayId } from './date';
import type { Place, Visit } from './candidates';

export interface MonthlyStats {
  totalCount: number;
  topPlaces: { place: Place; count: number }[];
  categoryCount: Record<string, number>;
  /** 어떤 게임으로 몇 번 뽑았는지. 게임이 기록된 방문만 센다(10/14 부터). 많은 순. */
  topGames: { mode: string; count: number }[];
  /** 이번 달 서로 다른 가게 수. */
  distinctPlaceCount: number;
  badges: BadgeStatus[];
}

export interface BadgeStatus {
  id: BadgeId;
  icon: string;
  label: string;
  /** 무엇을 세는지. 이름만으로는 몰라 title·화면낭독기 문구에 쓴다("이번 달 서로 다른 가게"). */
  hint: string;
  /** 세는 단위(곳·번·종·일). */
  unit: string;
  earned: boolean;
  current: number;
  target: number;
}

export type BadgeId = 'variety' | 'balanced' | 'regular' | 'consecutive' | 'prolific';

/**
 * 뱃지 정의: 조건과 문구.
 */
const BADGE_DEFINITIONS: Record<BadgeId, { icon: string; label: string; hint: string; unit: string }> = {
  variety: { icon: '🧭', label: '이곳저곳', hint: '이번 달 서로 다른 가게', unit: '곳' },
  balanced: { icon: '🌈', label: '골고루', hint: '이번 달 먹은 메뉴 종류', unit: '종' },
  regular: { icon: '💛', label: '단골', hint: '한 가게에 간 횟수', unit: '번' },
  consecutive: { icon: '🔥', label: '꾸준함', hint: '평일 연달아 정한 날', unit: '일' },
  prolific: { icon: '🎲', label: '점심 열 번', hint: '이번 달 정한 점심', unit: '번' },
};

/**
 * DayId를 UTC 자정 기준 Date로 변환.
 * (date.ts 의 dayIdToUTC 를 복제하지 않기 위해 내부 헬퍼)
 */
function dayIdToUTC(dayId: DayId): number {
  const y = Number(dayId.slice(0, 4));
  const m = Number(dayId.slice(4, 6));
  const d = Number(dayId.slice(6, 8));
  return Date.UTC(y, m - 1, d);
}

/**
 * 해당 DayId가 주말(토, 일)인가.
 */
function isWeekend(dayId: DayId): boolean {
  const date = new Date(dayIdToUTC(dayId));
  const day = date.getUTCDay();
  return day === 0 || day === 6; // 0 = 일, 6 = 토
}

/**
 * today의 YYYYMM을 구한다.
 */
function getMonthId(today: DayId): string {
  return today.slice(0, 6);
}

/**
 * 주어진 방문 배열에서 이번 달만 필터링.
 */
function filterThisMonth(visits: Visit[], today: DayId): Visit[] {
  const monthId = getMonthId(today);
  return visits.filter((v) => v.id.startsWith(monthId));
}

/**
 * 가장 많이 간 곳 상위 3개.
 * 동률일 때는 최근 방문 우선.
 */
function getTopPlaces(
  visits: Visit[],
  places: Place[]
): { place: Place; count: number }[] {
  const counts = new Map<string, number>();
  const lastVisit = new Map<string, DayId>();

  for (const v of visits) {
    counts.set(v.placeId, (counts.get(v.placeId) ?? 0) + 1);
    const current = lastVisit.get(v.placeId) ?? '';
    if (v.id > current) {
      lastVisit.set(v.placeId, v.id);
    }
  }

  const byId = new Map(places.map((p) => [p.id, p]));
  const entries = Array.from(counts.entries())
    .map(([placeId, count]) => ({
      placeId,
      count,
      lastVisit: lastVisit.get(placeId) ?? '',
    }))
    .filter((e) => byId.has(e.placeId));

  // 내림차순 정렬: 횟수 많은 순, 같으면 최근 방문 우선
  entries.sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return b.lastVisit.localeCompare(a.lastVisit);
  });

  return entries
    .slice(0, 3)
    .map((e) => ({
      place: byId.get(e.placeId)!,
      count: e.count,
    }));
}

/**
 * 카테고리별 방문 횟수.
 */
function getCategoryCount(
  visits: Visit[],
  places: Place[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  const byId = new Map(places.map((p) => [p.id, p]));

  for (const v of visits) {
    const place = byId.get(v.placeId);
    if (place) {
      counts[place.category] = (counts[place.category] ?? 0) + 1;
    }
  }

  return counts;
}

/**
 * 이번 달 서로 다른 가게 수.
 *
 * 예전 "개척자" 는 31일 창에서 처음 나타난 가게를 "새 가게" 로 셌다. 방문 기록을 31일만
 * 읽으니 월말엔 이번 달 간 곳이 전부 창 안에서 처음이라 모두 새 가게가 됐다(10/15 리뷰).
 * 정말 처음인지 알려면 전체 기록이 필요하다 — 그 대신 이번 달 기록만으로 정확한 값을 센다.
 */
function getDistinctPlaceCount(thisMonthVisits: Visit[]): number {
  return new Set(thisMonthVisits.map((v) => v.placeId)).size;
}

/**
 * 기록 있는 평일이 몇 일 이어졌나(최대값). 주말은 건너뛴다 — 금요일과 다음 주
 * 월요일이 이어진다. 회사 점심이라 주말에 기록이 없는 게 정상이다.
 */
function getMaxConsecutiveWeekdays(visits: Visit[]): number {
  if (visits.length === 0) return 0;

  // 방문 날짜를 오름차순으로 정렬
  const sorted = [...visits].sort((a, b) => a.id.localeCompare(b.id));
  const visitSet = new Set(sorted.map((v) => v.id));

  let maxStreak = 0;
  let currentStreak = 0;
  let currentDate = new Date(dayIdToUTC(sorted[0].id));
  const lastDate = new Date(dayIdToUTC(sorted[sorted.length - 1].id));

  // 첫 방문부터 마지막 방문까지 모든 날을 순회
  while (currentDate.getTime() <= lastDate.getTime()) {
    const y = currentDate.getUTCFullYear();
    const m = String(currentDate.getUTCMonth() + 1).padStart(2, '0');
    const d = String(currentDate.getUTCDate()).padStart(2, '0');
    const dayId = `${y}${m}${d}` as DayId;

    // 주말은 세지도 끊지도 않는다.
    if (isWeekend(dayId)) {
      // 건너뜀
    } else if (visitSet.has(dayId)) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }

    currentDate = new Date(currentDate.getTime() + 86_400_000);
  }

  return maxStreak;
}

/**
 * 이번 달 통계와 뱃지 상태를 계산한다.
 */
export function calculateStats(
  visits: Visit[],
  places: Place[],
  today: DayId
): MonthlyStats {
  const thisMonth = filterThisMonth(visits, today);
  const totalCount = thisMonth.length;
  const topPlaces = getTopPlaces(thisMonth, places);
  const categoryCount = getCategoryCount(thisMonth, places);
  const distinctPlaceCount = getDistinctPlaceCount(thisMonth);

  // 뱃지 판정
  const maxConsecutive = getMaxConsecutiveWeekdays(thisMonth);
  const uniqueCategories = Object.keys(categoryCount).length;

  // 단골: 같은 곳을 3번 이상 간 경우
  const hasRegular = topPlaces.some((tp) => tp.count >= 3);

  const badges: BadgeStatus[] = [];

  // 🧭 이곳저곳: 이번 달 서로 다른 가게 5곳 이상
  badges.push({
    id: 'variety',
    ...BADGE_DEFINITIONS.variety,
    earned: distinctPlaceCount >= 5,
    current: distinctPlaceCount,
    target: 5,
  });

  // 🌈 골고루: 카테고리 4종 이상
  badges.push({
    id: 'balanced',
    ...BADGE_DEFINITIONS.balanced,
    earned: uniqueCategories >= 4,
    current: uniqueCategories,
    target: 4,
  });

  // 💛 단골: 같은 곳 3번 이상
  const maxCount = topPlaces.length > 0 ? topPlaces[0].count : 0;
  badges.push({
    id: 'regular',
    ...BADGE_DEFINITIONS.regular,
    earned: hasRegular,
    current: maxCount,
    target: 3,
  });

  // 🔥 꾸준함: 평일 연속 5일
  badges.push({
    id: 'consecutive',
    ...BADGE_DEFINITIONS.consecutive,
    earned: maxConsecutive >= 5,
    current: maxConsecutive,
    target: 5,
  });

  // 🎲 점심 열 번: 이번 달 10번 이상
  badges.push({
    id: 'prolific',
    ...BADGE_DEFINITIONS.prolific,
    earned: totalCount >= 10,
    current: totalCount,
    target: 10,
  });

  const gameCount = new Map<string, number>();
  for (const v of thisMonth) if (v.mode) gameCount.set(v.mode, (gameCount.get(v.mode) ?? 0) + 1);
  const topGames = [...gameCount]
    .map(([mode, count]) => ({ mode, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    totalCount,
    topPlaces,
    categoryCount,
    topGames,
    distinctPlaceCount,
    badges,
  };
}
