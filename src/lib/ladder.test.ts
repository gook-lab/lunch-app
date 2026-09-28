import { describe, it, expect } from 'vitest';
import { buildLadder, walkLadder, ladderMapping, startForTarget, ladderPath } from './ladder';

/** 재현 가능한 난수. 테스트가 운에 기대지 않게 한다. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('buildLadder', () => {
  it('같은 층에 이웃한 가로줄을 놓지 않는다', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const ladder = buildLadder(6, 10, seeded(seed));
      const byRow = new Map<number, number[]>();
      for (const r of ladder.rungs) {
        byRow.set(r.row, [...(byRow.get(r.row) ?? []), r.col]);
      }
      for (const cols of byRow.values()) {
        const sorted = [...cols].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i] - sorted[i - 1]).toBeGreaterThan(1);
        }
      }
    }
  });

  it('가로줄이 범위를 벗어나지 않는다', () => {
    const ladder = buildLadder(5, 8, seeded(7));
    for (const r of ladder.rungs) {
      expect(r.col).toBeGreaterThanOrEqual(0);
      expect(r.col).toBeLessThan(4);
      expect(r.row).toBeLessThan(8);
    }
  });
});

describe('ladderMapping — 경로는 순열이다', () => {
  it('어떤 사다리에서도 도착 칸이 겹치지 않는다', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      for (const columns of [2, 3, 5, 8]) {
        const ladder = buildLadder(columns, 12, seeded(seed));
        const mapping = ladderMapping(ladder);
        expect(new Set(mapping).size).toBe(columns);
        expect([...mapping].sort((a, b) => a - b)).toEqual(
          Array.from({ length: columns }, (_, i) => i),
        );
      }
    }
  });
});

describe('startForTarget — 연출이 결과를 바꾸지 않는다', () => {
  it('목표 칸으로 가는 출발점을 항상 찾는다', () => {
    for (let seed = 1; seed <= 100; seed += 1) {
      const columns = 5;
      const ladder = buildLadder(columns, 14, seeded(seed));
      for (let target = 0; target < columns; target += 1) {
        const start = startForTarget(ladder, target);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(walkLadder(ladder, start)).toBe(target);
      }
    }
  });

  it('후보가 1곳뿐이면 출발점도 도착점도 0', () => {
    const ladder = buildLadder(1, 10, seeded(3));
    expect(ladder.rungs).toHaveLength(0);
    expect(startForTarget(ladder, 0)).toBe(0);
  });
});

describe('ladderPath', () => {
  it('출발점에서 시작해 도착 칸에서 끝난다', () => {
    const ladder = buildLadder(5, 10, seeded(11));
    const start = startForTarget(ladder, 3);
    const path = ladderPath(ladder, start);
    expect(path[0]).toEqual({ row: 0, col: start });
    expect(path[path.length - 1]).toEqual({ row: 10, col: 3 });
  });

  it('아래로만 가고, 옆으로 갈 때는 같은 높이에서 한 칸씩만 간다', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const ladder = buildLadder(6, 12, seeded(seed));
      const path = ladderPath(ladder, 0);
      for (let i = 1; i < path.length; i += 1) {
        const prev = path[i - 1];
        const cur = path[i];
        expect(cur.row).toBeGreaterThanOrEqual(prev.row);
        if (cur.col !== prev.col) {
          // 옆으로 가는 구간은 반드시 수평이고 한 칸이다
          expect(cur.row).toBe(prev.row);
          expect(Math.abs(cur.col - prev.col)).toBe(1);
        }
      }
    }
  });

  it('가로줄이 없으면 점 두 개로 곧게 내려간다', () => {
    const ladder = { columns: 3, rows: 8, rungs: [] };
    expect(ladderPath(ladder, 1)).toEqual([
      { row: 0, col: 1 },
      { row: 8, col: 1 },
    ]);
  });

  it('경로의 도착 칸은 walkLadder 와 같다', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const ladder = buildLadder(5, 11, seeded(seed));
      for (let start = 0; start < 5; start += 1) {
        const path = ladderPath(ladder, start);
        expect(path[path.length - 1].col).toBe(walkLadder(ladder, start));
      }
    }
  });
});
