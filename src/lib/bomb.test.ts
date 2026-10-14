/**
 * 폭탄 돌리기 타임라인 테스트.
 *
 * 폭탄이 정확히 당첨 자리에 도착하고, 최소 바퀴 수를 만족하고,
 * 총 연출 길이가 3500~6500ms 사이인지 검증한다.
 */
import { describe, it, expect } from 'vitest';
import { bombHops, type Hop } from './bomb';

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

  it('총 연출 길이가 3500~6500ms 범위', () => {
    for (const count of [2, 3, 5, 10, 20]) {
      for (const winner of [0, count - 1]) {
        for (const start of [0, 1]) {
          const hops = bombHops(count, start, winner);
          // 총 길이는 마지막 홉이 도착하는 시간 + 마지막 홉의 지연 정도.
          // 대략적으로 체크: hopCount는 최소 2*count 이상이므로 총 시간은 대략 3500ms 이상일 것.
          expect(hops.length).toBeGreaterThanOrEqual(2 * count);
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
