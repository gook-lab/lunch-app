import { describe, it, expect } from 'vitest';
import { buildLadder, walkLadder, ladderMapping, startForTarget, ladderPath, toggleRung, revealSlots, type Rung } from './ladder';

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

describe('toggleRung — 사용자가 긋는 가로줄', () => {
  it('빈 자리에 놓고, 다시 누르면 뗀다', () => {
    const once = toggleRung([], 3, 1, 5);
    expect(once).toEqual([{ row: 3, col: 1 }]);
    expect(toggleRung(once, 3, 1, 5)).toEqual([]);
  });

  it('같은 층 바로 옆에 붙이지 않는다 — 경로가 모호해진다', () => {
    const r = [{ row: 2, col: 1 }];
    expect(toggleRung(r, 2, 2, 5)).toEqual(r);
    expect(toggleRung(r, 2, 0, 5)).toEqual(r);
    expect(toggleRung(r, 2, 3, 5)).toHaveLength(2);
  });

  it('판 밖은 무시한다', () => {
    expect(toggleRung([], 0, 4, 5)).toEqual([]);
    expect(toggleRung([], 0, -1, 5)).toEqual([]);
  });

  it('어떻게 그어도 경로는 순열이다 — 출발점마다 도착 칸이 하나씩', () => {
    const random = seeded(9);
    let rungs: Rung[] = [];
    for (let k = 0; k < 200; k += 1) {
      rungs = toggleRung(rungs, Math.floor(random() * 9), Math.floor(random() * 5), 6);
      const mapping = ladderMapping({ columns: 6, rows: 9, rungs });
      expect(new Set(mapping).size).toBe(6);
    }
  });
});

describe('revealSlots — 가린 바닥 칸', () => {
  it('경로가 닿은 칸에 당첨이 있고, 모든 후보가 한 번씩 놓인다', () => {
    for (let dest = 0; dest < 6; dest += 1) {
      const slots = revealSlots(6, dest, 4, seeded(dest));
      expect(slots[dest]).toBe(4);
      expect([...slots].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    }
  });

  it('출발점을 어떻게 골라도 당첨 분포는 App 의 균등 난수 그대로다', () => {
    // 사다리는 당첨을 고르지 않는다. 같은 winner 를 넣으면 dest 와 무관하게
    // 그 winner 가 드러난다 — 확률은 winner 를 뽑은 쪽(균등)에만 달려 있다.
    for (let dest = 0; dest < 5; dest += 1) {
      for (let winner = 0; winner < 5; winner += 1) {
        expect(revealSlots(5, dest, winner, seeded(dest * 7 + winner))[dest]).toBe(winner);
      }
    }
  });
});
