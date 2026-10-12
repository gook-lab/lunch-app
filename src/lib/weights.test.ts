import { describe, expect, it } from 'vitest';
import { seededRandom } from './random';
import { MAX_BALLS_EACH, ballCountsFor, marblesFor, pickWeighted, winnerMarble } from './weights';

describe('pickWeighted — 공 개수가 곧 확률', () => {
  it('개수에 비례해 뽑힌다', () => {
    const w = [3, 1, 1, 5];
    const hits = [0, 0, 0, 0];
    const N = 40_000;
    const r = seededRandom(7);
    for (let k = 0; k < N; k += 1) hits[pickWeighted(w, r)] += 1;
    w.forEach((x, i) => expect(Math.abs(hits[i] / N - x / 10)).toBeLessThan(0.01));
  });

  it('모두 같으면 균등 추첨과 똑같다(같은 난수 → 같은 결과)', () => {
    for (let k = 0; k < 1000; k += 1) {
      const v = k / 1000;
      expect(pickWeighted([1, 1, 1, 1, 1], () => v)).toBe(Math.floor(v * 5));
      expect(pickWeighted([3, 3, 3], () => v)).toBe(Math.floor(v * 3));
    }
  });
});

describe('구슬과 가게', () => {
  it('안 정한 가게는 1개, 범위 밖은 1~5 로 자른다', () => {
    expect(ballCountsFor(['a', 'b', 'c'], { a: 3, c: 99 })).toEqual([3, 1, MAX_BALLS_EACH]);
    expect(ballCountsFor(['a'], { a: 0 })).toEqual([1]);
  });

  it('구슬마다 가게 번호가 붙고, 당첨 구슬은 늘 당첨 가게 것이다', () => {
    const marbles = marblesFor([2, 1, 3]);
    expect(marbles).toEqual([0, 0, 1, 2, 2, 2]);
    const r = seededRandom(3);
    const seen = new Set<number>();
    for (let k = 0; k < 200; k += 1) {
      const m = winnerMarble(marbles, 2, r);
      expect(marbles[m]).toBe(2);
      seen.add(m);
    }
    expect(seen).toEqual(new Set([3, 4, 5]));
  });
});
