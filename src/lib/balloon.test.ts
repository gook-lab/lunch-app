/**
 * 풍선 터뜨리기 일정 테스트.
 *
 * 당첨이 아닌 풍선은 모두 정확히 한 번씩 터지고, 당첨은 끝까지 남고,
 * 마지막 풍선이 터지는 시각이 3500~6500ms 이고, 마지막 뜸이 가장 긴지 본다.
 */
import { describe, it, expect } from 'vitest';
import { balloonColumns, popOrder } from './balloon';
import { seededRandom } from './random';

describe('풍선 터뜨리기 일정', () => {
  it('모든 후보 수·당첨·시드에서: 당첨 외 전부 한 번씩, 당첨은 안 터짐, 시각 증가, 3.5~6.5초, 마지막 뜸이 가장 김', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (let k = 0; k < 30; k += 1) {
          const pops = popOrder(count, winner, () => k / 30);
          expect(pops).toHaveLength(count - 1);
          const popped = pops.map((p) => p.index);
          expect(popped).not.toContain(winner);
          expect(new Set(popped).size).toBe(count - 1);
          for (let i = 0; i < count; i += 1) if (i !== winner) expect(popped).toContain(i);

          for (let i = 1; i < pops.length; i += 1) expect(pops[i].delayMs).toBeGreaterThan(pops[i - 1].delayMs);
          const end = pops.at(-1)!.delayMs;
          expect(end).toBeGreaterThanOrEqual(3500);
          expect(end).toBeLessThanOrEqual(6500);

          // 간격(0 → 첫 풍선 포함). 가장 긴 간격은 마지막 둘 사이 하나뿐이다.
          const gaps = pops.map((p, i) => p.delayMs - (i === 0 ? 0 : pops[i - 1].delayMs));
          const longest = Math.max(...gaps);
          expect(gaps.at(-1)).toBe(longest);
          expect(gaps.filter((g) => g === longest)).toHaveLength(1);
        }
      }
    }
  });

  it('20곳이면 처음은 빠르고(150ms 안쪽) 마지막 뜸은 길다(600ms 넘게)', () => {
    for (let k = 0; k < 30; k += 1) {
      const pops = popOrder(20, 7, () => k / 30);
      expect(pops[0].delayMs).toBeLessThanOrEqual(150);
      expect(pops.at(-1)!.delayMs - pops.at(-2)!.delayMs).toBeGreaterThan(600);
    }
  });

  it('순서는 시드마다 섞인다', () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, s) => popOrder(10, 3, seededRandom(s)).map((p) => p.index).join(',')),
    );
    expect(orders.size).toBeGreaterThan(10);
  });

  it('같은 시드는 같은 순서', () => {
    expect(popOrder(12, 5, seededRandom(42))).toEqual(popOrder(12, 5, seededRandom(42)));
  });

  it('후보가 두 곳보다 적거나 당첨이 범위 밖이면 빈 배열', () => {
    expect(popOrder(0, 0)).toHaveLength(0);
    expect(popOrder(1, 0)).toHaveLength(0);
    expect(popOrder(5, 5)).toHaveLength(0);
    expect(popOrder(5, -1)).toHaveLength(0);
  });

  it('열 수: 20곳은 6열(4줄), 2곳은 2열', () => {
    expect(balloonColumns(20)).toBe(6);
    expect(balloonColumns(2)).toBe(2);
    expect(balloonColumns(5)).toBe(3);
  });
});
