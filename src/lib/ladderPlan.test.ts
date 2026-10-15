import { describe, expect, it } from 'vitest';
import { buildLadder, ladderPath, ladderPlan, pathMetrics, revealSlots, rivalAt, runnerAt, walkLadder } from './ladder';
import { seededRandom } from './random';

const GEOM = (n: number) => ({ colGap: n <= 1 ? 0 : 284 / (n - 1), rowGap: 212 / 9 });
const DURATION = 6400;

describe('사다리 연출 일정 — 사건은 길도 당첨도 바꾸지 않는다', () => {
  it('후보 2~20곳·시드 여럿: 내 주자는 제 길 끝(도착 칸)에 닿고, 그 칸에 당첨이 열린다', () => {
    for (let n = 2; n <= 20; n += 1) {
      for (let seed = 1; seed <= 50; seed += 1) {
        const ladder = buildLadder(n, 9, seededRandom(seed * 31 + n));
        const start = seed % n;
        const winner = (seed * 7) % n;
        const plan = ladderPlan(ladder, start, GEOM(n), DURATION, seededRandom(seed));
        // 진행도는 줄곧 앞으로만, 도착 시각에 1.
        let prev = -1;
        for (let ms = 0; ms <= plan.endMs; ms += 25) {
          const { p } = runnerAt(plan, ms);
          expect(p).toBeGreaterThanOrEqual(prev - 1e-9);
          prev = p;
        }
        expect(runnerAt(plan, plan.arriveMs).p).toBe(1);
        expect(runnerAt(plan, plan.arriveMs - 1).p).toBeLessThan(1);
        const dest = walkLadder(ladder, start);
        expect(ladderPath(ladder, start).at(-1)?.col).toBe(dest);
        const slots = revealSlots(n, dest, winner, seededRandom(seed + 1));
        expect(slots[dest]).toBe(winner);
        // 다른 주자들은 각자 다른 칸에 닿는다(순열) — 당첨 칸에 닿는 건 내 주자뿐.
        const ends = plan.rivals.map((r) => walkLadder(ladder, r.start));
        expect(new Set([...ends, dest]).size).toBe(n);
        for (const r of plan.rivals) {
          expect(rivalAt(plan, r, plan.arriveMs)).toBe(1);
          expect(r.finishMs).toBeLessThan(plan.arriveMs);
        }
      }
    }
  });

  it('시간 순서: 출발 → 도착 → 커튼 → 열림 → 끝, 멈칫은 달리는 동안에만', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const n = 2 + (seed % 14);
      const ladder = buildLadder(n, 9, seededRandom(seed));
      const plan = ladderPlan(ladder, seed % n, GEOM(n), DURATION, seededRandom(seed * 3));
      expect(plan.goMs).toBeLessThan(plan.arriveMs);
      expect(plan.arriveMs).toBeLessThan(plan.curtainMs);
      expect(plan.curtainMs).toBeLessThan(plan.liftMs);
      expect(plan.liftMs).toBeLessThan(plan.endMs);
      expect(plan.endMs).toBe(DURATION);
      expect(plan.moveMs).toBeGreaterThan(2400);
      for (const b of plan.beats) {
        expect(b.startMs).toBeGreaterThan(plan.goMs);
        expect(b.startMs + b.ms).toBeLessThan(plan.arriveMs);
        const mid = runnerAt(plan, b.startMs + b.ms / 2);
        expect(mid.beat).toBe(b);
        expect(mid.p).toBeCloseTo(b.at, 9);
      }
    }
  });

  it('가짜 가로줄은 진짜 가로줄이 없는 자리, 내 주자가 곧게 지나는 층에 깜빡인다', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const n = 3 + (seed % 10);
      const ladder = buildLadder(n, 9, seededRandom(seed));
      const start = seed % n;
      const plan = ladderPlan(ladder, start, GEOM(n), DURATION, seededRandom(seed * 7));
      const { straights } = pathMetrics(ladder, start, GEOM(n));
      for (const b of plan.beats.filter((x) => x.kind === 'fake')) {
        expect(ladder.rungs.some((r) => r.row === b.row && r.col === b.col)).toBe(false);
        expect(straights.some((s) => s.row === b.row && Math.abs(s.at - b.at) < 1e-9)).toBe(true);
      }
    }
  });

  it('사건은 판마다 다르다 — 가짜 길·두리번·먼저 가는 주자·나란히 들어오는 주자가 자주, 그러나 늘은 아니게', () => {
    const seen = { fake: 0, look: 0, leader: 0, neck: 0 };
    const runs = 400;
    for (let seed = 1; seed <= runs; seed += 1) {
      const n = 2 + (seed % 14);
      const ladder = buildLadder(n, 9, seededRandom(seed * 5));
      const plan = ladderPlan(ladder, seed % n, GEOM(n), DURATION, seededRandom(seed));
      if (plan.beats.some((b) => b.kind === 'fake')) seen.fake += 1;
      if (plan.beats.some((b) => b.kind === 'look')) seen.look += 1;
      if (plan.leader !== null) seen.leader += 1;
      if (plan.neck !== null) seen.neck += 1;
    }
    for (const [k, v] of Object.entries(seen)) {
      expect(v, k).toBeGreaterThan(runs * 0.2);
      expect(v, k).toBeLessThan(runs * 0.95);
    }
  });

  it('같은 판 번호는 같은 연출이다', () => {
    const ladder = buildLadder(7, 9, seededRandom(4));
    const a = ladderPlan(ladder, 2, GEOM(7), DURATION, seededRandom(99));
    const b = ladderPlan(ladder, 2, GEOM(7), DURATION, seededRandom(99));
    expect(a).toEqual(b);
  });
});
