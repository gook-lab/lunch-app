import { describe, expect, it } from 'vitest';
import { MAX_ROLLS, boardSide, diceRolls, distanceTo, perimeterCell, placeCell, trackLength } from './dice';
import { seededRandom } from './random';

describe('주사위 — 눈 합이 곧 거리', () => {
  it('모든 출발·도착 칸에서 마지막 눈에 정확히 도착한다', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let from = 0; from < n; from += 1) {
        for (let to = 0; to < n; to += 1) {
          const d = distanceTo(from, to, n);
          const rolls = diceRolls(d, seededRandom(n * 1000 + from * 31 + to));
          expect(rolls.reduce((a, b) => a + b, 0)).toBe(d);
          expect((from + d) % n).toBe(to);
          expect(rolls.length).toBeLessThanOrEqual(MAX_ROLLS);
          for (const e of rolls) {
            expect(e).toBeGreaterThanOrEqual(1);
            expect(e).toBeLessThanOrEqual(6);
          }
        }
      }
    }
  });

  it('같은 칸이면 한 바퀴 돈다', () => {
    expect(distanceTo(3, 3, 8)).toBe(8);
  });
});

describe('주사위 — 말판', () => {
  it('둘레 칸이 후보 수 이상이고, 칸 자리가 겹치지 않는다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const side = boardSide(n);
      const perimeter = 4 * (side - 1);
      expect(perimeter).toBeGreaterThanOrEqual(n);
      const cells = new Set(Array.from({ length: perimeter }, (_, k) => JSON.stringify(perimeterCell(k, side))));
      expect(cells.size).toBe(perimeter);
    }
  });

  it('가게는 둘레에 겹치지 않게 흩어지고, 한 바퀴는 6번 굴림 안에 돈다', () => {
    for (let n = 1; n <= 30; n += 1) {
      const p = trackLength(n);
      const cells = Array.from({ length: n }, (_, k) => placeCell(k, n));
      expect(new Set(cells).size).toBe(n);
      cells.forEach((c) => expect(c).toBeLessThan(p));
      expect(p).toBeLessThanOrEqual(MAX_ROLLS * 6);
    }
    // 5곳이면 8칸 둘레에 0·1·3·4·6 — 네 변에 다 걸친다.
    expect(Array.from({ length: 5 }, (_, k) => placeCell(k, 5))).toEqual([0, 1, 3, 4, 6]);
  });
});
