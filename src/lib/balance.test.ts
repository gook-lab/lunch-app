/**
 * 장기 공정성.
 *
 * 단위 테스트(U1~U14)는 하루치 선정이 규칙대로인지 본다. 여기서는 그 규칙을
 * 몇백 일 돌렸을 때 특정 가게가 굶지 않는지 본다 — "최근 2주 제외" 와
 * "5곳이 안 되면 오래된 방문부터 푼다" 가 겹치면서 생길 수 있는 편향이다.
 *
 * 당첨은 App 과 같은 방식으로 뽑는다: 후보 중 균등 난수. 게임 모드는
 * 관여하지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { selectCandidates, MIN_CANDIDATES, type Place, type Visit, type Filters } from './candidates';
import { dayIdBefore } from './date';

const BASE = '20270101';

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

const filters = (over: Partial<Filters> = {}): Filters => ({
  maxWalkMin: 10,
  categories: [],
  excludeRecent: true,
  ...over,
});

/** 하루에 한 번씩 days 일을 돌리고 가게별 당첨 횟수를 센다. */
function simulate(places: Place[], days: number, f = filters()) {
  const visits: Visit[] = [];
  const tally = new Map(places.map((p) => [p.id, 0]));
  let emptyDays = 0;
  let short = 0;

  for (let k = 0; k < days; k += 1) {
    const today = dayIdBefore(BASE, days - 1 - k);
    const r = selectCandidates(places, visits, f, today);
    if (r.candidates.length === 0) {
      emptyDays += 1;
      continue;
    }
    if (r.candidates.length < MIN_CANDIDATES) short += 1;
    const pick = r.candidates[Math.floor(Math.random() * r.candidates.length)];
    tally.set(pick.id, (tally.get(pick.id) ?? 0) + 1);
    visits.push({ id: today, placeId: pick.id });
  }
  return { tally, emptyDays, short, visits };
}

describe('장기 공정성 — 몇백 일 돌려도 굶는 가게가 없다', () => {
  for (const n of [6, 9, 12, 20]) {
    it(`가게 ${n}곳 · 300일`, () => {
      const places = Array.from({ length: n }, (_, i) => place(String(i + 1)));
      const { tally, emptyDays } = simulate(places, 300);
      const counts = [...tally.values()];
      const total = counts.reduce((a, b) => a + b, 0);
      const mean = total / n;

      expect(emptyDays).toBe(0);
      expect(total).toBe(300);
      // 한 곳도 빠짐없이 돌아간다.
      expect(Math.min(...counts)).toBeGreaterThan(0);
      // 편차가 평균의 2배 안. 완전 균등이면 25번, 여기서는 그 근처여야 한다.
      expect(Math.max(...counts)).toBeLessThan(mean * 2);
      expect(Math.min(...counts)).toBeGreaterThan(mean * 0.4);
    });
  }

  it('도보 밖 가게는 후보가 아니다 — 나머지끼리는 균등하다', () => {
    // 12곳 중 3곳이 12분 거리. 10분 필터에서는 영영 안 걸리는 게 맞다.
    const places = [
      ...Array.from({ length: 9 }, (_, i) => place(String(i + 1))),
      ...Array.from({ length: 3 }, (_, i) => place(String(10 + i), { walkMin: 12 })),
    ];
    const { tally } = simulate(places, 300);
    for (const id of ['10', '11', '12']) expect(tally.get(id)).toBe(0);

    const inRange = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((id) => tally.get(id)!);
    const mean = 300 / 9;
    expect(Math.min(...inRange)).toBeGreaterThan(mean * 0.4);
    expect(Math.max(...inRange)).toBeLessThan(mean * 2);
  });

  it('가게가 후보 최소치보다 적으면 있는 만큼 계속 돌아간다', () => {
    const places = Array.from({ length: 3 }, (_, i) => place(String(i + 1)));
    const { tally, emptyDays, short } = simulate(places, 120);
    expect(emptyDays).toBe(0);
    expect(short).toBe(120); // 3곳뿐이라 매일 5곳에 못 미친다
    for (const c of tally.values()) expect(c).toBeGreaterThan(0);
  });

  it('제외 칩을 끄면 편차가 커진다 — 제외가 하는 일이 이것이다', () => {
    // 제외가 없으면 순수 균등 난수라 300일에도 편차가 남는다. 제외가 켜져
    // 있을 때 편차가 더 작아지는 게 이 규칙의 존재 이유다.
    const places = Array.from({ length: 12 }, (_, i) => place(String(i + 1)));
    const spread = (f: Filters) => {
      const c = [...simulate(places, 300, f).tally.values()];
      return Math.max(...c) - Math.min(...c);
    };
    // 여러 번 돌려 평균을 본다 — 난수라 한 판으로는 못 판단한다.
    let on = 0;
    let off = 0;
    for (let k = 0; k < 12; k += 1) {
      on += spread(filters());
      off += spread(filters({ excludeRecent: false }));
    }
    expect(on / 12).toBeLessThan(off / 12);
  });
})
