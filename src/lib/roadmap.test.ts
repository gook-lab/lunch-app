import { describe, it, expect } from 'vitest';
import { selectCandidates, WALK_STEPS, type Filters, type Place } from './candidates';
import { CATEGORIES } from './category';
import { VIEW, buildRoadmap, degreeOf, labelBox, radiusForWalk } from './roadmap';

const TODAY = '20260916';
const WEDGE = 360 / CATEGORIES.length;

function place(id: string, category: string, walkMin: number, over: Partial<Place> = {}): Place {
  return {
    id,
    name: `샘플 ${category} ${id}`,
    category,
    lat: 37.5,
    lng: 126.9,
    walkMin,
    kakaoPlaceId: `kakao-${id}`,
    active: true,
    createdBy: 'uid',
    ...over,
  };
}

const FILTERS: Filters = { maxWalkMin: 10, categories: [], excludeRecent: true };

/** 카테고리마다 두 곳씩. */
const PLACES: Place[] = CATEGORIES.flatMap((c, i) => [
  place(`${i}a`, c, 4),
  place(`${i}b`, c, 12),
]);

function model(places: readonly Place[] = PLACES, filters: Filters = FILTERS) {
  return buildRoadmap(places, filters, selectCandidates(places, [], filters, TODAY));
}

describe('buildRoadmap — 기하', () => {
  it('점이 전부 viewBox 안에 있다', () => {
    for (const dot of model().dots) {
      expect(dot.x).toBeGreaterThanOrEqual(0);
      expect(dot.x).toBeLessThanOrEqual(VIEW);
      expect(dot.y).toBeGreaterThanOrEqual(0);
      expect(dot.y).toBeLessThanOrEqual(VIEW);
    }
  });

  it('점이 자기 카테고리 조각 안에 있다', () => {
    // 이게 깨지면 한식집이 중식 조각에 얹혀 화면이 거짓말을 한다.
    for (const dot of model().dots) {
      const i = CATEGORIES.indexOf(dot.place.category as (typeof CATEGORIES)[number]);
      const deg = degreeOf(dot.x, dot.y);
      expect(deg, `${dot.place.name} deg=${deg} i=${i}`).toBeGreaterThan(i * WEDGE);
      expect(deg).toBeLessThan((i + 1) * WEDGE);
    }
  });

  it('가까운 곳이 사무실에 더 가깝게 놓인다', () => {
    const near = place('n', '한식', 3);
    const far = place('f', '한식', 13);
    const dots = model([near, far]).dots;
    const d = (id: string) => {
      const dot = dots.find((x) => x.place.id === id)!;
      return Math.hypot(dot.x - VIEW / 2, dot.y - VIEW / 2);
    };
    expect(d('n')).toBeLessThan(d('f'));
  });

  it('아주 가까운 곳도 사무실 표시를 덮지 않는다', () => {
    // 1분과 3분이 같은 반지름이 되는 건 감수한다. 각도가 달라 점은 안 겹치고,
    // 대신 사무실 네모와 "사무실" 글자가 가려지지 않는다.
    expect(radiusForWalk(1)).toBeGreaterThanOrEqual(30);
    expect(radiusForWalk(1)).toBeLessThan(50);
  });

  it('도보 상한을 한참 넘는 곳도 화면 안에 붙는다', () => {
    // 60분짜리를 안 자르면 반지름 600 이 되어 viewBox 밖으로 사라진다.
    const r15 = radiusForWalk(15);
    const r60 = radiusForWalk(60);
    expect(r60).toBeGreaterThan(r15);
    expect(r60).toBeLessThan(VIEW / 2);

    const dots = model([place('x', '한식', 60)]).dots;
    expect(dots[0].x).toBeLessThanOrEqual(VIEW);
    expect(dots[0].y).toBeLessThanOrEqual(VIEW);
  });

  it('같은 카테고리·같은 도보시간이어도 점이 겹치지 않는다', () => {
    const same = [place('a', '한식', 5), place('b', '한식', 5), place('c', '한식', 5)];
    const dots = model(same).dots;
    const keys = new Set(dots.map((d) => `${d.x.toFixed(3)},${d.y.toFixed(3)}`));
    expect(keys.size).toBe(3);
  });
});

describe('buildRoadmap — 필터를 반영한다', () => {
  it('링이 도보 단계마다 하나씩, 고른 것만 on', () => {
    const m = model(PLACES, { ...FILTERS, maxWalkMin: 15 });
    expect(m.rings).toHaveLength(WALK_STEPS.length);
    expect(m.rings.filter((r) => r.on).map((r) => r.walkMin)).toEqual([15]);
    expect(m.discR).toBe(150);
  });

  it('조각이 카테고리마다 하나씩', () => {
    const m = model();
    expect(m.wedges.map((w) => w.category)).toEqual([...CATEGORIES]);
    expect(m.spokes).toHaveLength(CATEGORIES.length);
  });

  it('아무것도 안 고르면 조각이 흐려지지 않는다', () => {
    expect(model().wedges.every((w) => !w.dimmed)).toBe(true);
  });

  it('하나를 고르면 나머지가 흐려지고 고른 것만 칠해진다', () => {
    const m = model(PLACES, { ...FILTERS, categories: ['면'] });
    const picked = m.wedges.find((w) => w.category === '면')!;
    expect(picked.on).toBe(true);
    expect(picked.dimmed).toBe(false);
    expect(picked.fillPath).not.toBeNull();
    for (const other of m.wedges.filter((w) => w.category !== '면')) {
      expect(other.dimmed).toBe(true);
      expect(other.fillPath).toBeNull();
    }
  });

  it('처지가 placeStatus 와 같고, 범위 밖·꺼짐은 이름을 숨긴다', () => {
    const m = model([place('near', '한식', 3), place('far', '한식', 30), place('off', '면', 3, { active: false })]);
    const byId = new Map(m.dots.map((d) => [d.place.id, d]));
    expect(byId.get('near')!.status).toBe('candidate');
    expect(byId.get('far')!.status).toBe('out');
    expect(byId.get('off')!.status).toBe('off');
    expect(byId.get('near')!.labelled).toBe(true);
    expect(byId.get('far')!.labelled).toBe(false);
    expect(byId.get('off')!.labelled).toBe(false);
  });

  it('모든 가게가 정확히 한 번 그려진다 — 칩에 없는 카테고리도', () => {
    // 지도에서 자유 입력한 "일식" 이 로드맵에서 사라지면 목록과 어긋난다.
    const odd = [...PLACES, place('sushi', '일식', 6), place('chicken', '치킨', 7)];
    const dots = model(odd).dots;
    expect(dots).toHaveLength(odd.length);
    expect(new Set(dots.map((d) => d.place.id)).size).toBe(odd.length);
  });

  it('이름에서 "샘플 " 을 뗀다', () => {
    const dots = model([place('a', '한식', 4)]).dots;
    expect(dots[0].place.name.startsWith('샘플 ')).toBe(true);
    expect(dots[0].label.startsWith('샘플 ')).toBe(false);
  });
});

describe('buildRoadmap — 라벨 충돌 회피', () => {
  const overlapping = (dots: ReturnType<typeof model>['dots']) => {
    const shown = dots.filter((d) => d.labelled).map(labelBox);
    let n = 0;
    for (let a = 0; a < shown.length; a += 1)
      for (let b = a + 1; b < shown.length; b += 1) {
        const A = shown[a];
        const B = shown[b];
        if (A.x1 < B.x2 && B.x1 < A.x2 && A.y1 < B.y2 && B.y1 < A.y2) n += 1;
      }
    return n;
  };

  it('카테고리마다 두 곳이면 범위 안은 하나도 숨기지 않는다', () => {
    // 4분짜리 여섯이 가운데에 모이면 아래 라벨끼리 닿아 몇은 위로 간다.
    // 그래도 숨겨지는 건 없어야 한다.
    const dots = model().dots.filter((d) => d.status !== 'out');
    expect(dots.every((d) => d.labelled)).toBe(true);
    expect(overlapping(dots)).toBe(0);
  });

  it('한 조각에 다섯 곳이 몰려도 보이는 라벨끼리는 겹치지 않는다', () => {
    const crowd = [4, 5, 5, 6, 7].map((w, i) => place(`k${i}`, CATEGORIES[0], w, { name: `샘플 김치찌개 ${i}` }));
    const dots = model([...PLACES, ...crowd]).dots;
    expect(overlapping(dots)).toBe(0);
    // 전부 숨기는 식으로 때우지 않는다 — 그 조각에서 가장 가까운 곳은 보인다.
    const wedge = dots.filter((d) => d.place.category === CATEGORIES[0] && d.status !== 'out');
    expect(wedge[0].labelled).toBe(true);
    expect(wedge.filter((d) => d.labelled).length).toBeGreaterThanOrEqual(2);
    expect(dots.some((d) => d.labelAbove)).toBe(true);
  });

  it('위로 올린 라벨은 top 이 점보다 위다', () => {
    const crowd = [4, 5, 5, 6, 7].map((w, i) => place(`k${i}`, CATEGORIES[0], w));
    const dots = model([...PLACES, ...crowd]).dots;
    for (const d of dots.filter((x) => x.labelAbove)) {
      expect(parseFloat(d.top)).toBeLessThan(d.y / 4);
    }
  });
});
