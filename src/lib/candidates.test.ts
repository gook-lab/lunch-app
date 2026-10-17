import { describe, it, expect } from 'vitest';
import {
  lastVisitedCategory,
  placeStatus,
  selectCandidates,
  MIN_CANDIDATES,
  type Place,
  type Visit,
  type Filters,
} from './candidates';
import { dayIdBefore } from './date';

const TODAY = '20260916';

function place(id: string, over: Partial<Place> = {}): Place {
  return {
    id,
    name: `가게${id}`,
    category: '한식',
    lat: 37.5,
    lng: 126.9,
    walkMin: 6,
    kakaoPlaceId: `kakao-${id}`,
    active: true,
    createdBy: 'uid-seed',
    ...over,
  };
}

/** n일 전에 placeId 를 갔다. */
function visit(placeId: string, daysAgo: number): Visit {
  return { id: dayIdBefore(TODAY, daysAgo), placeId };
}

const pool = (n: number, over: (i: number) => Partial<Place> = () => ({})) =>
  Array.from({ length: n }, (_, i) => place(String(i + 1), over(i)));

const filters = (over: Partial<Filters> = {}): Filters => ({
  maxWalkMin: 10,
  categories: [],
  excludeRecent: true,
  ...over,
});

describe('selectCandidates — 필터 순서', () => {
  it('U1 — 도보 필터가 걸린다', () => {
    const places = [
      place('1', { walkMin: 6 }),
      place('2', { walkMin: 9 }),
      place('3', { walkMin: 14 }),
      place('4', { walkMin: 20 }),
      place('5', { walkMin: 3 }),
      place('6', { walkMin: 8 }),
    ];
    const r = selectCandidates(places, [], filters({ maxWalkMin: 10 }), TODAY);
    expect(r.candidates.map((p) => p.id)).toEqual(['1', '2', '5', '6']);
    expect(r.afterWalkCount).toBe(4);
  });

  it('U2 — active=false 는 먼저 빠진다', () => {
    const places = pool(12, (i) => ({ active: i >= 2 }));
    const r = selectCandidates(places, [], filters(), TODAY);
    expect(r.activeCount).toBe(10);
    expect(r.candidates).toHaveLength(10);
  });

  it('U11 — 제외 칩을 끄면 7일 창을 무시한다', () => {
    const places = pool(6);
    const visits = places.slice(0, 5).map((p) => visit(p.id, 1));
    const r = selectCandidates(places, visits, filters({ excludeRecent: false }), TODAY);
    expect(r.candidates).toHaveLength(6);
    expect(r.recentlyVisitedCount).toBe(5);
    expect(r.releasedCount).toBe(0);
  });
});

describe('selectCandidates — 7일 창 경계', () => {
  it('U3 — 7일째는 아직 제외', () => {
    const places = pool(6);
    const r = selectCandidates(places, [visit('1', 7)], filters(), TODAY);
    expect(r.recentlyVisitedCount).toBe(1);
    expect(r.candidates.map((p) => p.id)).not.toContain('1');
  });

  it('U4 — 8일째는 다시 후보', () => {
    const places = pool(6);
    const r = selectCandidates(places, [visit('1', 8)], filters(), TODAY);
    expect(r.recentlyVisitedCount).toBe(0);
    expect(r.candidates.map((p) => p.id)).toContain('1');
  });

  it('U5 — 같은 곳을 여러 번 갔으면 마지막 방문일로 본다', () => {
    // 3일 전과 6일 전에 1번 가게, 6일 전에 2번 가게.
    const places = pool(7);
    const visits = [visit('1', 6), visit('1', 3), visit('2', 6)];
    // 후보가 5곳(3~7번)이라 보정이 안 일어난다 — 1·2번 모두 제외 상태.
    const r = selectCandidates(places, visits, filters(), TODAY);
    expect(r.releasedCount).toBe(0);
    expect(r.candidates.map((p) => p.id)).toEqual(['3', '4', '5', '6', '7']);

    // 후보를 하나 줄이면 오래된 쪽(2번, 6일 전)이 먼저 풀려야 한다.
    const smaller = places.slice(0, 6);
    const r2 = selectCandidates(smaller, visits, filters(), TODAY);
    expect(r2.releasedCount).toBe(1);
    expect(r2.candidates.map((p) => p.id)).toContain('2');
    expect(r2.candidates.map((p) => p.id)).not.toContain('1');
  });

  it('U14 — 월 경계에서도 문자열이 아니라 날짜로 센다', () => {
    const october = '20261003';
    const places = pool(6);
    // 20260926 은 10/3 기준 7일 전 — 창 안.
    const r = selectCandidates(places, [{ id: '20260926', placeId: '1' }], filters(), october);
    expect(r.recentlyVisitedCount).toBe(1);
    // 20260925 는 8일 전 — 창 밖.
    const r2 = selectCandidates(places, [{ id: '20260925', placeId: '1' }], filters(), october);
    expect(r2.recentlyVisitedCount).toBe(0);
  });
});

describe('selectCandidates — 최소 5곳 보정', () => {
  it('U6 — 오래된 방문부터 풀어 5곳을 채운다', () => {
    // 10곳 중 7곳이 최근 방문. 남는 건 3곳이라 2곳을 풀어야 한다.
    const places = pool(10);
    const visits = Array.from({ length: 7 }, (_, i) => visit(String(i + 1), i + 1));
    const r = selectCandidates(places, visits, filters(), TODAY);
    expect(r.candidates).toHaveLength(MIN_CANDIDATES);
    expect(r.releasedCount).toBe(2);
    // 가장 오래된 방문은 7번(7일 전), 그 다음이 6번(6일 전).
    const ids = r.candidates.map((p) => p.id);
    expect(ids).toEqual(expect.arrayContaining(['8', '9', '10', '7', '6']));
    expect(ids).not.toContain('1');
  });

  it('U7 — 보정 사유를 화면이 조립할 수 있다', () => {
    const places = pool(10);
    const visits = Array.from({ length: 7 }, (_, i) => visit(String(i + 1), i + 1));
    const r = selectCandidates(places, visits, filters(), TODAY);
    // "10곳 중 7곳은 최근에 갔어요 — 그중 2곳을 다시 넣었어요"
    expect(r.afterCategoryCount).toBe(10);
    expect(r.recentlyVisitedCount).toBe(7);
    expect(r.releasedCount).toBe(2);
  });

  it('U8 — 보정해도 5곳이 안 되면 있는 만큼 돌린다', () => {
    const places = pool(3);
    const visits = [visit('1', 2)];
    const r = selectCandidates(places, visits, filters(), TODAY);
    expect(r.candidates).toHaveLength(3);
    expect(r.shortOfMinimum).toBe(true);
    expect(r.emptyReason).toBeNull();
  });

  it('U12 — 풀이 20곳을 넘으면 보정이 발동하지 않는다', () => {
    const places = pool(22);
    const visits = Array.from({ length: 7 }, (_, i) => visit(String(i + 1), i + 1));
    const r = selectCandidates(places, visits, filters(), TODAY);
    expect(r.releasedCount).toBe(0);
    expect(r.candidates).toHaveLength(15);
  });

  it('U13 — 단계별 카운트가 실제와 일치한다', () => {
    // 12곳 → 도보에서 3곳 탈락 → 카테고리에서 2곳 탈락 → 남은 7곳 중 5곳 최근 방문.
    const places = [
      ...Array.from({ length: 7 }, (_, i) => place(String(i + 1), { walkMin: 6, category: '한식' })),
      place('8', { walkMin: 6, category: '면' }),
      place('9', { walkMin: 6, category: '면' }),
      place('10', { walkMin: 18, category: '한식' }),
      place('11', { walkMin: 19, category: '한식' }),
      place('12', { walkMin: 20, category: '한식' }),
    ];
    const visits = [1, 2, 3, 4, 5].map((n) => visit(String(n), n));
    const r = selectCandidates(
      places,
      visits,
      filters({ maxWalkMin: 10, categories: ['한식'] }),
      TODAY,
    );

    expect(r.activeCount).toBe(12);
    expect(r.afterWalkCount).toBe(9); // 18·19·20분 3곳 탈락
    expect(r.afterCategoryCount).toBe(7); // '면' 2곳 탈락
    expect(r.recentlyVisitedCount).toBe(5); // 7곳 중 5곳이 최근 방문 — 12도 7도 아니다
    expect(r.releasedCount).toBe(3); // 남은 2곳 + 3곳 = 5곳
    expect(r.candidates).toHaveLength(MIN_CANDIDATES);
  });
});

describe('selectCandidates — 후보 0곳', () => {
  it('U9 — 도보가 원인이면 넓혔을 때의 수를 같이 준다', () => {
    const places = pool(6, () => ({ walkMin: 12 }));
    const r = selectCandidates(places, [], filters({ maxWalkMin: 5 }), TODAY);
    expect(r.candidates).toHaveLength(0);
    expect(r.emptyReason).toEqual({ kind: 'walk', widerWalkMin: 10, countAtWiderWalk: 0 });

    const mixed = [place('1', { walkMin: 8 }), place('2', { walkMin: 9 })];
    const r2 = selectCandidates(mixed, [], filters({ maxWalkMin: 5 }), TODAY);
    expect(r2.emptyReason).toEqual({ kind: 'walk', widerWalkMin: 10, countAtWiderWalk: 2 });
  });

  it('U10 — 카테고리가 원인이면 풀었을 때의 수를 준다', () => {
    const places = pool(6, () => ({ category: '한식' }));
    const r = selectCandidates(places, [], filters({ categories: ['면'] }), TODAY);
    expect(r.candidates).toHaveLength(0);
    expect(r.emptyReason).toEqual({ kind: 'category', countWithoutCategory: 6 });
  });

  it('가게가 없거나 전부 꺼져 있으면 그렇게 말한다', () => {
    expect(selectCandidates([], [], filters(), TODAY).emptyReason).toEqual({ kind: 'no-places' });

    const allOff = pool(4, () => ({ active: false }));
    expect(selectCandidates(allOff, [], filters(), TODAY).emptyReason).toEqual({
      kind: 'all-inactive',
      total: 4,
    });
  });
});

describe('placeStatus — 로드맵이 점을 그릴 때 쓰는 처지', () => {
  const filters: Filters = { maxWalkMin: 10, categories: [], excludeRecent: true };

  it('꺼진 가게는 off — 범위 안이어도 off 가 먼저다', () => {
    const near = place('a', { walkMin: 3, active: false });
    const result = selectCandidates([near], [], filters, TODAY);
    expect(placeStatus(near, filters, result)).toBe('off');
  });

  it('도보 상한을 넘으면 out', () => {
    const far = place('a', { walkMin: 30 });
    const result = selectCandidates([far], [], filters, TODAY);
    expect(placeStatus(far, filters, result)).toBe('out');
  });

  it('고른 카테고리가 아니면 out', () => {
    const p = place('a', { category: '한식', walkMin: 3 });
    const withCat: Filters = { ...filters, categories: ['면'] };
    const result = selectCandidates([p], [], withCat, TODAY);
    expect(placeStatus(p, withCat, result)).toBe('out');
  });

  it('전부 최근이면 다 풀려서 released 로 읽힌다', () => {
    const a = place('a', { walkMin: 3 });
    const b = place('b', { walkMin: 4 });
    const c = place('c', { walkMin: 5 });
    const visits = [visit('a', 1), visit('b', 2), visit('c', 3)];
    const result = selectCandidates([a, b, c], visits, filters, TODAY);

    // 신선한 곳이 0 이라 MIN_CANDIDATES 를 채우려고 있는 대로 다 꺼낸다.
    expect(result.releasedCount).toBe(3);
    for (const p of [a, b, c]) {
      expect(placeStatus(p, filters, result)).toBe('released');
    }
  });

  it('안 간 곳은 candidate, 보정이 안 걸리면 최근 방문은 recent', () => {
    const fresh = [1, 2, 3, 4, 5].map((n) => place(`f${n}`, { walkMin: 3 }));
    const visited = place('v', { walkMin: 4 });
    const result = selectCandidates([...fresh, visited], [visit('v', 1)], filters, TODAY);

    expect(result.releasedCount).toBe(0);
    expect(placeStatus(fresh[0], filters, result)).toBe('candidate');
    expect(placeStatus(visited, filters, result)).toBe('recent');
  });

  it('released 는 candidates 에도 있지만 released 로 읽힌다', () => {
    const a = place('a', { walkMin: 3 });
    const result = selectCandidates([a], [visit('a', 1)], filters, TODAY);
    expect(result.candidates.some((p) => p.id === 'a')).toBe(true);
    expect(placeStatus(a, filters, result)).toBe('released');
  });

  it('excludeRecent 를 끄면 최근 방문도 candidate 다', () => {
    const off: Filters = { ...filters, excludeRecent: false };
    const a = place('a', { walkMin: 3 });
    const result = selectCandidates([a], [visit('a', 1)], off, TODAY);
    expect(placeStatus(a, off, result)).toBe('candidate');
  });
});

describe('지난번 메뉴 빼기', () => {
  // 한식 6곳 + 면 6곳. 어제 한식집(1)에 갔다. 최근 제외는 꺼서 이 칩만 본다.
  const places = [...pool(6), ...Array.from({ length: 6 }, (_, i) => place(`m${i}`, { category: '면' }))];
  const yesterday = [visit('1', 1)];

  it('오늘 전 마지막 방문의 메뉴를 찾는다 — 오늘 기록은 보지 않는다', () => {
    expect(lastVisitedCategory(places, [visit('1', 3), visit('m0', 1)], TODAY)).toBe('면');
    expect(lastVisitedCategory(places, [visit('1', 2), { id: TODAY, placeId: 'm0' }], TODAY)).toBe('한식');
    expect(lastVisitedCategory(places, [], TODAY)).toBeNull();
    expect(lastVisitedCategory(places, [visit('없는가게', 1)], TODAY)).toBeNull();
  });

  it('기본은 꺼짐 — 켜지 않으면 지난번 메뉴도 후보다', () => {
    const r = selectCandidates(places, yesterday, filters({ excludeRecent: false }), TODAY);
    expect(r.candidates).toHaveLength(12);
    expect(r.lastCategory).toEqual({ category: '한식', applied: false });
  });

  it('켜면 지난번 메뉴가 빠지고 "N곳 중" 도 그만큼 줄어든다', () => {
    const f = filters({ excludeRecent: false, avoidLastCategory: true });
    const r = selectCandidates(places, yesterday, f, TODAY);
    expect(r.candidates.map((p) => p.category)).toEqual(Array(6).fill('면'));
    expect(r.afterCategoryCount).toBe(6);
    expect(r.lastCategory).toEqual({ category: '한식', applied: true });
    expect(placeStatus(places[0], f, r)).toBe('out');
  });

  it(`빼면 ${MIN_CANDIDATES}곳 미만이 되는 날은 빼지 않는다`, () => {
    const few = [...pool(6), ...Array.from({ length: 4 }, (_, i) => place(`m${i}`, { category: '면' }))];
    const f = filters({ excludeRecent: false, avoidLastCategory: true });
    const r = selectCandidates(few, yesterday, f, TODAY);
    expect(r.candidates).toHaveLength(10);
    expect(r.lastCategory).toEqual({ category: '한식', applied: false });
    expect(placeStatus(few[0], f, r)).toBe('candidate');
  });

  it('최근 1주 제외와 같이 걸 수 있다', () => {
    const r = selectCandidates(places, [visit('1', 1), visit('m0', 3)], filters({ avoidLastCategory: true }), TODAY);
    expect(r.lastCategory?.applied).toBe(true);
    expect(r.candidates.map((p) => p.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });
});
