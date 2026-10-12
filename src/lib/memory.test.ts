import { describe, expect, it } from 'vitest';
import { assignCard, autoFirst, autoSecond, isSettled, memoryPlaces, settle, type Faces } from './memory';
import { seededRandom } from './random';

/**
 * 한 판을 끝까지 둔다. pick 이 사용자의 선택(아무렇게나·짓궂게)을 흉내 낸다.
 * 돌려주는 값: 짝을 맞춰 빠진 가게들, 끝에 남은 판.
 */
function play(
  count: number,
  winner: number,
  seed: number,
  pick: (faces: Faces, matched: boolean[], first: number | null, r: () => number) => number,
) {
  const r = seededRandom(seed);
  const places = memoryPlaces(count, winner, r);
  let faces: Faces = Array(places.length * 2).fill(null);
  const matched: boolean[] = faces.map(() => false);
  const out: number[] = [];
  const flip = (i: number) => {
    if (faces[i] === null) faces = faces.map((f, k) => (k === i ? assignCard(faces, places, winner, r) : f));
  };
  let guard = 0;
  while (!isSettled(faces)) {
    if ((guard += 1) > 500) throw new Error('끝나지 않는 판');
    const a = pick(faces, matched, null, r);
    flip(a);
    const b = pick(faces, matched, a, r);
    flip(b);
    if (faces[a] === faces[b]) {
      matched[a] = matched[b] = true;
      out.push(faces[a] as number);
    }
  }
  return { places, out, final: settle(faces, winner), matched };
}

const randomPick = (faces: Faces, matched: boolean[], first: number | null, r: () => number) => {
  const live = faces.map((_, i) => i).filter((i) => !matched[i] && i !== first);
  return live[Math.floor(r() * live.length)];
};
/** 이미 본 카드만 고집하는 사람 — 당첨 짝을 일찍 맞춰 보려는 시도. */
const stubbornPick = (faces: Faces, matched: boolean[], first: number | null, r: () => number) => {
  const live = faces.map((_, i) => i).filter((i) => !matched[i] && i !== first);
  const seen = live.filter((i) => faces[i] !== null);
  const pool = seen.length > 0 && r() < 0.8 ? seen : live;
  return pool[Math.floor(r() * pool.length)];
};
const autoPick = (faces: Faces, matched: boolean[], first: number | null, r: () => number) =>
  first === null ? autoFirst(faces, matched, r) : autoSecond(faces, matched, first, r);

describe('memoryPlaces — 판에 깔 가게', () => {
  it('당첨을 꼭 넣고, 겹치지 않고, 최대 6곳', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const p = memoryPlaces(20, 7, seededRandom(seed));
      expect(p).toContain(7);
      expect(new Set(p).size).toBe(p.length);
      expect(p).toHaveLength(6);
    }
    expect(memoryPlaces(3, 1, seededRandom(1)).sort()).toEqual([0, 1, 2]);
    expect(memoryPlaces(1, 0, seededRandom(1))).toEqual([0]);
  });
});

describe('짝 맞추기 — 어떻게 뒤집어도 끝까지 남는 건 당첨', () => {
  for (const [name, pick] of [['아무렇게나', randomPick], ['본 카드만 고집', stubbornPick], ['자동 진행', autoPick]] as const) {
    it(`${name}: 당첨 짝은 빠지지 않고, 가게마다 정확히 두 장`, () => {
      for (let seed = 0; seed < 300; seed += 1) {
        const count = 2 + (seed % 19);
        const winner = seed % count;
        const { places, out, final } = play(count, winner, seed, pick);
        expect(out).not.toContain(winner);
        for (const p of places) expect(final.filter((f) => f === p)).toHaveLength(2);
      }
    });
  }

  it('한 곳뿐이면 시작부터 굳어 있다', () => {
    expect(isSettled([null, null])).toBe(true);
  });

  it('카드 자리마다 당첨이 아닌 가게가 고르게 나온다(첫 장 기준)', () => {
    // 6곳 중 당첨 0 → 첫 장은 나머지 5곳이 각각 약 1/5.
    const hits = new Map<number, number>();
    const N = 5000;
    for (let seed = 0; seed < N; seed += 1) {
      const r = seededRandom(seed);
      const f = assignCard(Array(12).fill(null), [0, 1, 2, 3, 4, 5], 0, r);
      hits.set(f, (hits.get(f) ?? 0) + 1);
    }
    expect(hits.has(0)).toBe(false);
    for (const p of [1, 2, 3, 4, 5]) expect(Math.abs((hits.get(p) ?? 0) / N - 0.2)).toBeLessThan(0.03);
  });
});
