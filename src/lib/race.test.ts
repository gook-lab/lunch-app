import { describe, it, expect } from 'vitest';
import { simulateRace, seedForWinner, buildPegs, BOARD_W, BOARD_H } from './race';

describe('simulateRace — 물리가 판을 벗어나지 않는다', () => {
  it('구슬이 항상 판 안에 있다', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const { frames } = simulateRace(6, seed);
      for (const frame of frames) {
        for (const m of frame) {
          expect(m.x).toBeGreaterThanOrEqual(0);
          expect(m.x).toBeLessThanOrEqual(BOARD_W);
          expect(m.y).toBeGreaterThanOrEqual(0);
          expect(m.y).toBeLessThanOrEqual(BOARD_H);
        }
      }
    }
  });

  it('같은 시드는 같은 경기를 만든다', () => {
    const a = simulateRace(5, 99);
    const b = simulateRace(5, 99);
    expect(a.order).toEqual(b.order);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
  });

  it('다른 시드는 대체로 다른 경기를 만든다', () => {
    const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => simulateRace(5, s).winner));
    expect(winners.size).toBeGreaterThan(1);
  });

  it('순위에 모든 구슬이 한 번씩 들어간다', () => {
    for (const count of [2, 3, 5, 8]) {
      const { order } = simulateRace(count, 17);
      expect(order).toHaveLength(count);
      expect(new Set(order).size).toBe(count);
      expect([...order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i),
      );
    }
  });

  it('구슬이 아래로 내려간다 — 마지막 프레임이 첫 프레임보다 낮다', () => {
    const { frames } = simulateRace(5, 3);
    const first = frames[0];
    const last = frames[frames.length - 1];
    for (let i = 0; i < first.length; i += 1) {
      expect(last[i].y).toBeGreaterThan(first[i].y);
    }
  });
});

describe('seedForWinner — 연출이 결과를 정하지 않는다', () => {
  it('모든 후보 수와 모든 목표에 대해 시드를 찾는다', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      for (let target = 0; target < count; target += 1) {
        const seed = seedForWinner(count, target);
        expect(seed, `count=${count} target=${target} 시드를 못 찾음`).not.toBeNull();
        expect(simulateRace(count, seed!).winner).toBe(target);
      }
    }
  });

  it('후보가 1곳이면 그 구슬이 이긴다', () => {
    const seed = seedForWinner(1, 0);
    expect(seed).not.toBeNull();
    expect(simulateRace(1, seed!).winner).toBe(0);
  });

  it('범위를 벗어난 목표는 null', () => {
    expect(seedForWinner(5, 5)).toBeNull();
    expect(seedForWinner(5, -1)).toBeNull();
    expect(seedForWinner(0, 0)).toBeNull();
  });
});

describe('buildPegs', () => {
  it('핀이 판 안에 있고 시드와 무관하게 항상 같다', () => {
    const a = buildPegs();
    const b = buildPegs();
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(10);
    for (const peg of a) {
      expect(peg.x).toBeGreaterThan(0);
      expect(peg.x).toBeLessThan(BOARD_W);
      expect(peg.y).toBeGreaterThan(0);
      expect(peg.y).toBeLessThan(BOARD_H);
    }
  });
});

describe('판이 특정 레인을 구조적으로 불리하게 만들지 않는다', () => {
  /**
   * 화면에 "어느 쪽으로 돌려도 확률은 같습니다" 라고 적어 두었다.
   * 그 약속은 어떤 구슬이든 이길 수 있어야 성립한다.
   *
   * 실제로 핀을 한쪽으로만 엇갈리게 깔았을 때는 오른쪽 끝 구슬이 600 시드 중
   * 한 번도 못 이겼다. 그러면 그 가게는 영원히 안 걸린다.
   * 출발 레인을 시드로 섞어서 고쳤고, 이 테스트가 그 회귀를 막는다.
   */
  const SEEDS = 150;

  it(
    '모든 구슬이 이길 수 있고, 한 구슬이 독차지하지 않는다',
    () => {
      for (const count of [2, 3, 4, 5, 6, 7, 8]) {
        const tally = new Array<number>(count).fill(0);
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          tally[simulateRace(count, seed).winner] += 1;
        }

        for (let i = 0; i < count; i += 1) {
          expect(
            tally[i],
            `count=${count} 구슬 ${i} 가 ${SEEDS} 시드 중 한 번도 못 이김 — ${tally.join(',')}`,
          ).toBeGreaterThan(0);
        }

        // 2곳일 때는 한쪽이 절반을 넘는 게 정상이다. 3곳 이상만 본다.
        if (count >= 3) {
          expect(Math.max(...tally), `count=${count} 편중 — ${tally.join(',')}`).toBeLessThan(
            SEEDS * 0.5,
          );
        }
      }
    },
    20_000,
  );
});
