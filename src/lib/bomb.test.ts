/**
 * 폭탄 돌리기 타임라인 테스트.
 *
 * 폭탄이 정확히 당첨 자리에 도착하고, 최소 바퀴 수를 만족하고,
 * 총 연출 길이가 3500~6500ms 사이인지 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { bombHops } from './bomb';

describe('폭탄 돌리기 타임라인', () => {
  it('마지막 홉은 항상 당첨 자리', () => {
    for (const count of [2, 3, 5, 10, 20]) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (const start of [0, Math.floor(count / 3)]) {
          const hops = bombHops(count, start, winner);
          expect(hops.length).toBeGreaterThan(0);
          expect(hops[hops.length - 1].seat).toBe(winner);
        }
      }
    }
  });

  it('각 홉은 시계 방향으로 한 자리씩', () => {
    for (const count of [2, 3, 5, 10, 20]) {
      for (const winner of [0, count - 1]) {
        for (const start of [0, 1]) {
          const hops = bombHops(count, start, winner);
          for (let i = 1; i < hops.length; i += 1) {
            const prevSeat = hops[i - 1].seat;
            const currSeat = hops[i].seat;
            const expectedNext = (prevSeat + 1) % count;
            expect(currSeat).toBe(expectedNext);
          }
        }
      }
    }
  });

  it('모든 후보 수·출발·당첨·시드에서: 한 자리씩 시계 방향, 끝은 당첨, 길이 3.5~6.5초, 뜸은 마지막 한 번', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const start of [0, 1, count - 1]) {
        for (const winner of [0, Math.floor(count / 2), count - 1]) {
          for (let k = 0; k < 30; k += 1) {
            const hops = bombHops(count, start, winner, () => k / 30);
            expect(hops[0].seat).toBe(start);
            expect(hops.at(-1)!.seat).toBe(winner);
            for (let i = 1; i < hops.length; i += 1) expect(hops[i].seat).toBe((hops[i - 1].seat + 1) % count);
            const end = hops.at(-1)!.delayMs;
            expect(end).toBeGreaterThanOrEqual(3500);
            expect(end).toBeLessThanOrEqual(6500);
            // 가장 긴 간격은 마지막 한 칸(당첨 바로 앞 → 당첨)이다. 바퀴마다 같은 자리에서 멈추면 답이 보인다.
            const gaps = hops.slice(1).map((h, i) => h.delayMs - hops[i].delayMs);
            const longest = Math.max(...gaps);
            expect(gaps.at(-1)).toBe(longest);
            expect(gaps.filter((g) => g === longest)).toHaveLength(1);
          }
        }
      }
    }
  });

  it('최소 2바퀴 (count >= 3일 때)', () => {
    for (const count of [3, 5, 10, 20]) {
      for (const winner of [0, count - 1]) {
        for (const start of [0, 1]) {
          const hops = bombHops(count, start, winner);
          // 최소 바퀴 수 계산: startSeat에서 winnerIndex까지의 거리.
          const distance = ((winner - start) % count + count) % count || count;
          const minHops = Math.max(2 * count, distance + count);
          // 총 홉 수는 최소값 이상이어야 한다.
          expect(hops.length - 1).toBeGreaterThanOrEqual(minHops);
        }
      }
    }
  });

  it('여러 난수 시드에서 일관성 있게 작동', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => i / 30);
    for (const count of [2, 5, 10, 20]) {
      for (const winner of [0, count - 1]) {
        for (const seed of seeds) {
          const hops = bombHops(count, 0, winner, () => seed);
          expect(hops.length).toBeGreaterThan(0);
          expect(hops[hops.length - 1].seat).toBe(winner);
          // 최소 2*count 홉 확인
          expect(hops.length).toBeGreaterThanOrEqual(2 * count);
        }
      }
    }
  });

  it('홉의 타임스탬프는 단조 증가', () => {
    for (const count of [2, 3, 5, 10, 20]) {
      for (const winner of [0, count - 1]) {
        const hops = bombHops(count, 0, winner);
        for (let i = 1; i < hops.length; i += 1) {
          expect(hops[i].delayMs).toBeGreaterThanOrEqual(hops[i - 1].delayMs);
        }
      }
    }
  });

  it('count가 2보다 작으면 빈 배열', () => {
    expect(bombHops(0, 0, 0)).toHaveLength(0);
    expect(bombHops(1, 0, 0)).toHaveLength(0);
  });
});
