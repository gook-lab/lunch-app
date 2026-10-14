/**
 * 후보 산출 — 이 앱의 진짜 로직 (엔지니어링 리뷰 D5).
 *
 * 돌림판 애니메이션은 표시일 뿐이고, "오늘 뭐가 후보인가" 를 정하는 것은 여기다.
 * 순수 함수로 두는 이유는 하나 — 7일 제외와 최소 5곳 보정이 섞인 부분이 가장
 * 틀리기 쉬운데, 화면 안에 있으면 브라우저를 열어야만 확인할 수 있기 때문이다.
 *
 * 반환은 단계별 카운트다. totalCount 하나로는 화면에 띄울 문구를 만들 수 없다.
 * 12곳 중 도보에서 3곳, 카테고리에서 2곳이 빠지고 남은 7곳 중 5곳이 최근 방문이면
 * "12곳 중 7곳은 최근에 갔습니다" 의 7 은 실제(5)와 다르다. 이 문구가 이 앱의
 * 유일한 공정성 장치라 숫자가 틀리면 기능의 명분이 사라진다.
 */

import { daysBetween, type DayId } from './date';

export interface Place {
  id: string;
  name: string;
  /** 메뉴(대분류). 읽을 때 저장값을 classify 로 나눈 결과다 — lib/category.ts. */
  category: string;
  /** 세부(중분류). 모르면 없음. 저장할 때는 sub ?? category 를 쓴다. */
  sub?: string | null;
  lat: number;
  lng: number;
  /** 저장 필드. lat/lng 를 고치면 같이 재계산해서 쓴다. */
  walkMin: number;
  /** 중복 등록 방지 키. */
  kakaoPlaceId: string;
  active: boolean;
  /** 익명 로그인 uid. 사람을 특정하지 못한다. */
  createdBy: string;

  /*
   * 아래는 전부 선택 필드다. 지도에서 핀을 꽂아 넣은 가게만 채워지고,
   * 기존 문서에는 없다. 없어도 동작해야 한다 — 후보 산출은 이 값을
   * 하나도 보지 않는다. 사람이 고르는 데 쓰는 정보다.
   */
  price?: PriceBand;
  /** 1~5. 0 이나 소수는 없다. */
  rating?: Rating;
  /** 한줄평. 40자. */
  review?: string;
  /** 메모. 120자. */
  memo?: string;
}

/** 가격대. 세 칸뿐이다 — 더 쪼개면 아무도 안 고른다. */
export const PRICE_BANDS = ['~1만', '1~1.5만', '1.5만~'] as const;
export type PriceBand = (typeof PRICE_BANDS)[number];

export type Rating = 1 | 2 | 3 | 4 | 5;

export interface Visit {
  /** 'YYYYMMDD' (KST). 하루 한 건. */
  id: DayId;
  placeId: string;
}

export interface Filters {
  /** 도보 상한(분). */
  maxWalkMin: number;
  /** 켜진 카테고리 칩. 비어 있으면 카테고리로 거르지 않는다. */
  categories: string[];
  /** 켜진 세부 칩. 메뉴 하나를 골랐을 때만 생긴다. 비어 있으면 메뉴로만 거른다. */
  subs?: string[];
  /** 최근 방문 제외 칩. 끌 수 있다. */
  excludeRecent: boolean;
}

/** 카테고리 조건에 맞는가. 세부를 골랐으면 세부로, 아니면 메뉴로 본다. */
export function matchesCategory(
  place: Pick<Place, 'category' | 'sub'>,
  filters: Pick<Filters, 'categories' | 'subs'>,
): boolean {
  if (filters.subs && filters.subs.length > 0) return filters.subs.includes(place.sub ?? '');
  return filters.categories.length === 0 || filters.categories.includes(place.category);
}

export type EmptyReason =
  | { kind: 'no-places' }
  | { kind: 'all-inactive'; total: number }
  | { kind: 'walk'; widerWalkMin: number; countAtWiderWalk: number }
  | { kind: 'category'; countWithoutCategory: number };

export interface CandidateResult {
  candidates: Place[];
  /**
   * 최근 7일 안에 간 곳 목록. 카운트만으로는 로드맵에서 점 하나하나를
   * 어떤 상태로 그릴지 알 수 없다 — 그래서 목록도 같이 준다.
   */
  recent: Place[];
  /** 최소 5곳을 채우려고 다시 꺼낸 곳 목록. candidates 안에 들어 있다. */
  released: Place[];
  /** active === true 인 가게 수. */
  activeCount: number;
  /** 도보 필터까지 통과한 수. */
  afterWalkCount: number;
  /** 카테고리 칩까지 통과한 수. 화면 문구의 "N곳 중". */
  afterCategoryCount: number;
  /** 그 N곳 중 최근 7일 안에 간 곳 수. 화면 문구의 "M곳은 최근에 갔습니다". */
  recentlyVisitedCount: number;
  /** 최소 5곳을 채우려고 제외에서 다시 꺼낸 수. 몰래 풀지 않고 밝힌다. */
  releasedCount: number;
  /** 전부 풀어도 5곳이 안 되는 상태. 있는 만큼 돌린다. */
  shortOfMinimum: boolean;
  /**
   * "최근 1주 제외" 가 실제로 적용됐는가. 끄면 recent 는 그대로 세되
   * 아무도 빠지지 않는다 — 문구가 "빠졌습니다" 라고 말하면 거짓이다.
   */
  excludedRecent: boolean;
  emptyReason: EmptyReason | null;
}

/** 방문 제외 창. UI 로 길이를 바꾸지 못한다. */
export const RECENT_WINDOW_DAYS = 7;
/**
 * 방문 기록을 읽어 오는 기간. 제외 창(7일)보다 길게 읽어 목록 탭 "최근 다녀온 곳"·
 * 한 달 기록·뱃지와 "다시 넣음" 순서(오래된 곳부터)가 1주 너머도 보이게 한다. 하루 한
 * 문서라 31일이면 31문서다. 2026-10-13 사용자: 근처 밥집이 적어 2주 제외를 1주로 줄였다.
 */
export const VISIT_HISTORY_DAYS = 31;

/** 이 아래로 떨어지면 오래된 방문부터 풀어서 채운다. */
export const MIN_CANDIDATES = 5;

/**
 * 풀이 이 수를 넘으면 위 보정은 사실상 발동하지 않는다.
 * 설계의 2주차 목표이기도 하다 — 로직에는 쓰지 않고 화면 안내에만 쓴다.
 */
export const HEALTHY_POOL_SIZE = 20;

/** 도보 칩 단계. 후보 0곳일 때 "넓히면 N곳" 을 제안하는 데 쓴다. */
export const WALK_STEPS = [5, 10, 15] as const;

/** placeId -> 창 안에서 가장 마지막 방문일. 창 밖 방문은 담지 않는다. */
function lastVisitWithinWindow(
  visits: readonly Visit[],
  today: DayId,
): Map<string, DayId> {
  const last = new Map<string, DayId>();
  for (const visit of visits) {
    const age = daysBetween(visit.id, today);
    // 미래 날짜(기기 시계가 빠른 경우)는 창 밖으로 보지 않고 최신으로 취급한다.
    if (age > RECENT_WINDOW_DAYS) continue;
    const current = last.get(visit.placeId);
    if (current === undefined || visit.id > current) {
      last.set(visit.placeId, visit.id);
    }
  }
  return last;
}

function emptyReasonFor(
  places: readonly Place[],
  active: readonly Place[],
  afterWalk: readonly Place[],
  filters: Filters,
): EmptyReason {
  if (places.length === 0) return { kind: 'no-places' };
  if (active.length === 0) return { kind: 'all-inactive', total: places.length };

  if (afterWalk.length === 0) {
    const wider = WALK_STEPS.find((step) => step > filters.maxWalkMin);
    const widerWalkMin = wider ?? filters.maxWalkMin;
    return {
      kind: 'walk',
      widerWalkMin,
      countAtWiderWalk: active.filter((p) => p.walkMin <= widerWalkMin).length,
    };
  }

  // 도보까지는 통과했는데 비었다면 원인은 카테고리뿐이다.
  return { kind: 'category', countWithoutCategory: afterWalk.length };
}

/**
 * 필터 순서는 (1) active → (2) 도보 → (3) 카테고리 → (4) 최근 방문 제외.
 * (4) 를 걸어 5곳 미만이 되면 마지막 방문일이 오래된 순으로 하나씩 푼다.
 */
export function selectCandidates(
  places: readonly Place[],
  visits: readonly Visit[],
  filters: Filters,
  today: DayId,
): CandidateResult {
  const active = places.filter((p) => p.active);
  const afterWalk = active.filter((p) => p.walkMin <= filters.maxWalkMin);
  const afterCategory = afterWalk.filter((p) => matchesCategory(p, filters));

  const base = {
    excludedRecent: filters.excludeRecent,
    activeCount: active.length,
    afterWalkCount: afterWalk.length,
    afterCategoryCount: afterCategory.length,
  };

  if (afterCategory.length === 0) {
    return {
      ...base,
      candidates: [],
      recent: [],
      released: [],
      recentlyVisitedCount: 0,
      releasedCount: 0,
      shortOfMinimum: true,
      emptyReason: emptyReasonFor(places, active, afterWalk, filters),
    };
  }

  const lastVisit = lastVisitWithinWindow(visits, today);
  const recent = afterCategory.filter((p) => lastVisit.has(p.id));

  if (!filters.excludeRecent) {
    return {
      ...base,
      candidates: [...afterCategory],
      recent,
      released: [],
      recentlyVisitedCount: recent.length,
      releasedCount: 0,
      shortOfMinimum: afterCategory.length < MIN_CANDIDATES,
      emptyReason: null,
    };
  }

  const fresh = afterCategory.filter((p) => !lastVisit.has(p.id));
  const shortfall = MIN_CANDIDATES - fresh.length;

  if (shortfall <= 0) {
    return {
      ...base,
      candidates: fresh,
      recent,
      released: [],
      recentlyVisitedCount: recent.length,
      releasedCount: 0,
      shortOfMinimum: false,
      emptyReason: null,
    };
  }

  // 마지막 방문일이 오래된 순으로 푼다. 같은 날이면 id 로 안정 정렬.
  const released = [...recent]
    .sort((a, b) => {
      const av = lastVisit.get(a.id)!;
      const bv = lastVisit.get(b.id)!;
      return av === bv ? a.id.localeCompare(b.id) : av.localeCompare(bv);
    })
    .slice(0, shortfall);

  return {
    ...base,
    candidates: [...fresh, ...released],
    recent,
    released,
    recentlyVisitedCount: recent.length,
    releasedCount: released.length,
    shortOfMinimum: fresh.length + released.length < MIN_CANDIDATES,
    emptyReason: null,
  };
}

/**
 * 가게 하나가 지금 필터에서 어떤 처지인지.
 *
 * 로드맵이 점을 다르게 그리려면 "후보다/아니다" 보다 한 단계 자세한 값이
 * 필요하다. 특히 released 와 cand 를 구분해야 한다 — 다시 꺼낸 곳을 그냥
 * 후보로 그리면 화면이 "최근 1주 제외" 를 지킨 것처럼 보이지만 실제로는
 * 풀어준 것이고, 그 사실을 감추면 이 앱의 유일한 공정성 장치가 무의미해진다.
 */
export type PlaceStatus =
  /** 후보 */
  | 'candidate'
  /** 최근에 갔지만 5곳을 채우려고 다시 넣음 */
  | 'released'
  /** 최근 1주 안에 가서 빠짐 */
  | 'recent'
  /** 도보·카테고리 범위 밖 */
  | 'out'
  /** active 가 꺼짐 */
  | 'off';

export function placeStatus(
  place: Place,
  filters: Filters,
  result: CandidateResult,
): PlaceStatus {
  if (!place.active) return 'off';
  if (place.walkMin > filters.maxWalkMin) return 'out';
  if (!matchesCategory(place, filters)) return 'out';
  // released 를 먼저 본다. released 는 candidates 안에도 들어 있다.
  if (result.released.some((p) => p.id === place.id)) return 'released';
  if (result.candidates.some((p) => p.id === place.id)) return 'candidate';
  return 'recent';
}
