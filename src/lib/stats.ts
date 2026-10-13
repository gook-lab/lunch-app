/**
 * 이번 달 점심 통계와 뱃지 — 표시 전용 (공정성 무관).
 *
 * 통계는 PlaceList 목록 탭의 "이번 달 점심" 섹션에 표시할 뿐이다.
 * 게임 규칙·후보 산출·당첨에 영향을 주지 않는다.
 */

import type { DayId } from './date';
import type { Place, Visit } from './candidates';

/**
 * 이번 달(today의 YYYYMM)에 해당하는 방문 기록.
 * 31일 창 안에서 그 가게의 첫 방문 여부를 판정할 때는
 * visits 전체 배열을 넘겨 받아야 한다(31일 기준 근사).
 */
export interface MonthlyStats {
  totalCount: number;
  topPlaces: { place: Place; count: number }[];
  categoryCount: Record<string, number>;
  newPlaceCount: number;
  badges: BadgeStatus[];
}

export interface BadgeStatus {
  id: BadgeId;
  icon: string;
  label: string;
  earned: boolean;
  current: number;
  target: number;
}

export type BadgeId = 'explorer' | 'balanced' | 'regular' | 'consecutive' | 'prolific';

/**
 * 뱃지 정의: 조건과 문구.
 */
const BADGE_DEFINITIONS: Record<BadgeId, { icon: string; label: string }> = {
  explorer: { icon: '🧭', label: '개척자' },
  balanced: { icon: '🌈', label: '골고루' },
  regular: { icon: '💛', label: '단골' },
  consecutive: { icon: '🔥', label: '꾸준함' },
  prolific: { icon: '🎲', label: '점심 열 번' },
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
 * 31일 창(today 포함 최근 31일) 안에서 그 가게의 첫 방문이 이번 달인 가게 수.
 * 기준: 31일 창 안에서 처음 나타나는 가게들 중 이번 달 방문이 있는 것.
 */
function getNewPlaceCount(
  allVisits: Visit[],
  thisMonthVisits: Visit[],
  today: DayId
): number {
  const MS_PER_DAY = 86_400_000;
  const windowStart = new Date(dayIdToUTC(today) - 30 * MS_PER_DAY);
  const y = windowStart.getUTCFullYear();
  const m = String(windowStart.getUTCMonth() + 1).padStart(2, '0');
  const d = String(windowStart.getUTCDate()).padStart(2, '0');
  const windowStartId = `${y}${m}${d}`;

  // 31일 창 안의 모든 가게
  // 날짜순으로 — 첫 방문을 고르므로 들어온 순서에 기대면 안 된다.
  const windowVisits = allVisits
    .filter((v) => v.id >= windowStartId && v.id <= today)
    .sort((a, b) => a.id.localeCompare(b.id));
  const firstAppearance = new Map<string, DayId>();
  for (const v of windowVisits) {
    if (!firstAppearance.has(v.placeId)) {
      firstAppearance.set(v.placeId, v.id);
    }
  }

  // 이번 달 방문이면서 31일 창 안에서 처음 나타나는 가게
  const thisMonthPlaces = new Set(thisMonthVisits.map((v) => v.placeId));
  let count = 0;
  for (const placeId of thisMonthPlaces) {
    if (firstAppearance.has(placeId)) {
      const first = firstAppearance.get(placeId)!;
      if (first.startsWith(getMonthId(today))) {
        count++;
      }
    }
  }

  return count;
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
  const newPlaceCount = getNewPlaceCount(visits, thisMonth, today);

  // 뱃지 판정
  const maxConsecutive = getMaxConsecutiveWeekdays(thisMonth);
  const uniqueCategories = Object.keys(categoryCount).length;

  // 단골: 같은 곳을 3번 이상 간 경우
  const hasRegular = topPlaces.some((tp) => tp.count >= 3);

  const badges: BadgeStatus[] = [];

  // 🧭 개척자: 새 가게 3곳 이상
  badges.push({
    id: 'explorer',
    ...BADGE_DEFINITIONS.explorer,
    earned: newPlaceCount >= 3,
    current: newPlaceCount,
    target: 3,
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

  return {
    totalCount,
    topPlaces,
    categoryCount,
    newPlaceCount,
    badges,
  };
}
