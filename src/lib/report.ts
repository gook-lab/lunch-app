/**
 * 이번 주 점심 리포트 — 주중(월~금) 결정 요약.
 *
 * 통계는 표시 전용(공정성 무관). places 맵에서 이름·카테고리를 가져온다.
 * 모드가 없는 예전 기록은 무시한다.
 */
import type { Place, Visit } from './candidates';
import { dayIdBefore, daysBetween, type DayId } from './date';
import type { Vote } from '../services/types';

export interface WeeklyReport {
  /** 이번 주 결정 건 수 */
  decisionCount: number;
  /** 가장 자주 고른 카테고리 (있으면) */
  topCategory: string | null;
  /** 가장 자주 쓴 게임 모드 (있으면) */
  topMode: string | null;
  /** 방문한 가게 목록 (날짜 라벨과 함께) */
  places: Array<{ place: Place; dayLabel: string; mode?: string }>;
}

/**
 * 주(Mon~Sun)의 월요일 날짜. 지정된 날짜가 속한 주의 월요일을 찾는다.
 * DayId 는 YYYYMMDD 형식(KST 기준).
 */
function getWeekStart(date: DayId): DayId {
  // YYYYMMDD를 Date로 변환. UTC로 해석하되, 실제로는 KST 날짜를 나타낸다.
  const y = parseInt(date.slice(0, 4), 10);
  const m = parseInt(date.slice(4, 6), 10) - 1; // Date 는 0-indexed month
  const d = parseInt(date.slice(6, 8), 10);
  const utcDate = new Date(Date.UTC(y, m, d));
  const dayOfWeek = utcDate.getUTCDay();
  // dayOfWeek: 0=일, 1=월, ..., 6=토. 월요일(1)부터 시작하려면 offset 계산
  const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // 일요일면 -6일, 월요일이면 0일
  const monday = new Date(utcDate);
  monday.setUTCDate(utcDate.getUTCDate() + offset);
  const y2 = monday.getUTCFullYear();
  const m2 = String(monday.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(monday.getUTCDate()).padStart(2, '0');
  return `${y2}${m2}${d2}`;
}

/**
 * 지난 캘린더 주의 업무일(Mon~Fri) 결정만 필터링.
 * today 가 속한 주의 월요일부터 금요일까지의 기록.
 */
function getWeeklyVisits(visits: Visit[], today: DayId): Visit[] {
  const weekStart = getWeekStart(today);
  // 날짜 문자열에 4를 더하면 달이 바뀌는 주(9/28~10/2)에 20260932 가 된다. 날 수로 잰다.
  return visits.filter((v) => {
    const d = daysBetween(weekStart, v.id);
    return d >= 0 && d <= 4;
  });
}

/**
 * 날짜를 한글 요일로. "월", "화", ..., "금", "토", "일".
 */
function dayLabel(date: DayId): string {
  const y = parseInt(date.slice(0, 4), 10);
  const m = parseInt(date.slice(4, 6), 10) - 1;
  const d = parseInt(date.slice(6, 8), 10);
  const utcDate = new Date(Date.UTC(y, m, d));
  const dayOfWeek = utcDate.getUTCDay();
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  return labels[dayOfWeek];
}

/** 두 번 이상이고 동점이 없는 1등. 없으면 null. */
function topOf(count: Map<string, number>): string | null {
  const [first, second] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  if (!first || first[1] < 2 || (second && second[1] === first[1])) return null;
  return first[0];
}

/**
 * 이번 주 점심 리포트 계산.
 */
export function weeklyReport(visits: Visit[], places: Place[], today: DayId): WeeklyReport {
  const weeklyVisits = getWeeklyVisits(visits, today);
  const byId = new Map(places.map((p) => [p.id, p]));

  // 카테고리별 빈도
  const categoryCount = new Map<string, number>();
  // 게임 모드별 빈도 (mode 가 있는 기록만)
  const modeCount = new Map<string, number>();
  // 날짜별 가게 목록
  const placesByDay = new Map<DayId, { placeId: string; mode?: string }[]>();

  for (const visit of weeklyVisits) {
    const place = byId.get(visit.placeId);
    if (!place) continue;

    // 카테고리 count
    const cat = place.category;
    categoryCount.set(cat, (categoryCount.get(cat) ?? 0) + 1);

    // 게임 모드 count (mode 가 있을 때만)
    if (visit.mode) {
      modeCount.set(visit.mode, (modeCount.get(visit.mode) ?? 0) + 1);
    }

    // 날짜별 가게
    if (!placesByDay.has(visit.id)) {
      placesByDay.set(visit.id, []);
    }
    placesByDay.get(visit.id)!.push({ placeId: visit.placeId, mode: visit.mode });
  }

  // "자주" 는 두 번 이상, 그리고 혼자 1등일 때만 말한다. 한 번씩이면 아무 메뉴나 "자주" 가 되어 버린다.
  const topCategory = topOf(categoryCount);
  const topMode = topOf(modeCount);

  // 방문 가게 리스트 (날짜 라벨과 함께)
  const placesResult: Array<{ place: Place; dayLabel: string; mode?: string }> = [];
  const sortedDates = Array.from(placesByDay.keys()).sort().reverse();
  for (const date of sortedDates) {
    const dayVists = placesByDay.get(date) || [];
    for (const visit of dayVists) {
      const place = byId.get(visit.placeId);
      if (place) {
        placesResult.push({
          place,
          dayLabel: dayLabel(date),
          mode: visit.mode,
        });
      }
    }
  }

  return {
    decisionCount: weeklyVisits.length,
    topCategory,
    topMode,
    places: placesResult,
  };
}

/** 이번 주 월요일부터 오늘(금요일까지)의 날짜들. 주말이면 그 주 월~금. */
export function weekDaysUpTo(today: DayId): DayId[] {
  const monday = getWeekStart(today);
  const last = Math.min(4, daysBetween(monday, today));
  return Array.from({ length: last + 1 }, (_, k) => dayIdBefore(monday, -k));
}

/** 이번 달 1일부터 오늘까지의 날짜들(주말 포함 — 점심을 정한 날만 세므로 상관없다). */
export function monthDaysUpTo(today: DayId): DayId[] {
  const first = `${today.slice(0, 6)}01` as DayId;
  return Array.from({ length: daysBetween(first, today) + 1 }, (_, k) => dayIdBefore(first, -k));
}

/**
 * 예측왕 — 이번 주 정해진 날마다 그날 표가 당첨 가게와 같으면 1번 맞힌 것으로 센다.
 * 같은 기기(uid)를 한 사람으로 보고, 이름은 가장 최근 표의 것을 쓴다. 맞힌 적 없는 사람은 뺀다.
 */
export function predictionKings(
  votesByDay: Partial<Record<DayId, Vote[]>>,
  visits: Visit[],
  today: DayId,
  span: 'week' | 'month' = 'week',
): { name: string; hits: number }[] {
  const by = new Map<string, { name: string; hits: number; last: DayId }>();
  const counted =
    span === 'week' ? getWeeklyVisits(visits, today) : visits.filter((v) => v.id.slice(0, 6) === today.slice(0, 6) && v.id <= today);
  for (const visit of counted) {
    for (const v of votesByDay[visit.id] ?? []) {
      if (v.placeId !== visit.placeId) continue;
      const prev = by.get(v.uid);
      const newer = !prev || visit.id >= prev.last;
      by.set(v.uid, { name: newer ? v.name : prev.name, hits: (prev?.hits ?? 0) + 1, last: newer ? visit.id : prev.last });
    }
  }
  return [...by.values()]
    .map(({ name, hits }) => ({ name, hits }))
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name, 'ko'));
}
