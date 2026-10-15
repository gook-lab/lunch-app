/**
 * 풍선 터뜨리기 일정 테스트.
 *
 * 당첨이 아닌 풍선은 모두 정확히 한 번씩 터지고, 당첨은 끝까지 남아 떠오르고, 살아난 풍선이 당첨이 아니면
 * 나중에 결국 터지고, 마지막 대결은 당첨과 상대 둘이며 상대가 터지는지 본다. 한 판은 4.5~7.2초.
 * 사건(살아남기·연쇄·버티기)은 당첨을 바꾸지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { balloonColumns, balloonFrame, balloonPlan, chainRate, finalFrame, NEAR_BURST_RATE, SAVE_RATE, WIND_SHARE } from './balloon';
import { seededRandom } from './random';

describe('풍선 터뜨리기 일정', () => {
  it('2~20곳 · 여러 당첨 · 여러 시드: 당첨 외 전부 한 번씩 터지고 당첨은 남아 떠오른다, 4.5~7.2초', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (let seed = 1; seed <= 40; seed += 1) {
          const plan = balloonPlan(count, winner, seededRandom(seed * 31 + count));
          const pops = plan.beats.filter((b) => b.kind === 'pop' || b.kind === 'chain' || b.kind === 'burst').map((b) => b.index!);
          expect(pops).not.toContain(winner);
          expect(pops).toHaveLength(count - 1);
          expect(new Set(pops).size).toBe(count - 1);

          // 시각은 줄어들지 않고, 끝은 떠오르기 뒤.
          for (let k = 1; k < plan.beats.length; k += 1) expect(plan.beats[k].atMs).toBeGreaterThanOrEqual(plan.beats[k - 1].atMs);
          expect(plan.beats[0]).toEqual({ atMs: 0, kind: 'intro' });
          expect(plan.beats.at(-1)).toMatchObject({ kind: 'float', index: winner });
          expect(plan.endMs).toBeGreaterThanOrEqual(4500);
          expect(plan.endMs).toBeLessThanOrEqual(7200);

          // 대결은 당첨과 상대, 마지막으로 터지는 건 상대.
          expect(plan.duel![0]).toBe(winner);
          expect(plan.beats.filter((b) => b.kind === 'burst').map((b) => b.index)).toEqual([plan.duel![1]]);
          const duelAt = plan.beats.findIndex((b) => b.kind === 'duel');
          // 대결 전에는 둘 말고 다 터져 있다.
          const before = new Set(plan.beats.slice(0, duelAt).filter((b) => b.kind === 'pop' || b.kind === 'chain').map((b) => b.index));
          expect(before.size).toBe(count - 2);
          // 펌프는 대결하는 둘에게만, 마지막 펌프는 상대.
          const pumps = plan.beats.filter((b) => b.kind === 'pump');
          for (const p of pumps) expect(plan.duel).toContain(p.index);
          expect(pumps.at(-1)!.index).toBe(plan.duel![1]);
          // 버티기(가짜 위기)는 당첨 쪽이다.
          for (const s of plan.beats.filter((b) => b.kind === 'strain')) expect(s.index).toBe(winner);

          // 살아난 풍선: 살아나기 전엔 안 터지고, 당첨이 아니면 나중에 터진다.
          if (plan.save) {
            const saveAt = plan.beats.findIndex((b) => b.kind === 'save');
            expect(plan.beats[saveAt].index).toBe(plan.save.index);
            const popAt = plan.beats.findIndex((b) => (b.kind === 'pop' || b.kind === 'chain' || b.kind === 'burst') && b.index === plan.save!.index);
            if (plan.save.index === winner) expect(popAt).toBe(-1);
            else expect(popAt).toBeGreaterThan(saveAt);
          }

          // 마지막 장면: 당첨만 남는다.
          const last = balloonFrame(plan, plan.beats.length - 1);
          expect(last.popped.size).toBe(count - 1);
          expect(last.popped.has(winner)).toBe(false);
          expect(last.float).toBe(true);
        }
      }
    }
  });

  it('사건 비율: 살아남기 · 바람 · 연쇄 · 버티기가 정한 비율 언저리', () => {
    let saves = 0;
    let wind = 0;
    let near = 0;
    let chainsSeen = 0;
    let saveWinner = 0;
    const N = 800;
    for (let s = 1; s <= N; s += 1) {
      const count = 12;
      const winner = s % count;
      const p = balloonPlan(count, winner, seededRandom(s));
      if (p.save) {
        saves += 1;
        if (p.save.cause === 'wind') wind += 1;
        if (p.save.index === winner) saveWinner += 1;
      }
      if (p.nearBurst) near += 1;
      if (p.chains > 0) chainsSeen += 1;
    }
    expect(Math.abs(saves / N - SAVE_RATE)).toBeLessThan(0.05);
    expect(Math.abs(wind / saves - WIND_SHARE)).toBeLessThan(0.07);
    expect(Math.abs(near / N - NEAR_BURST_RATE)).toBeLessThan(0.06);
    expect(chainsSeen / N).toBeGreaterThan(0.6);
    // 살아나는 풍선은 누구든 같은 확률 — 당첨 쪽으로 쏠리면 결과가 미리 보인다.
    expect(saveWinner / saves).toBeLessThan(0.16);
    expect(chainRate(20)).toBeLessThanOrEqual(0.6);
  });

  it('20곳이면 연쇄가 자주 나고 다트는 갈수록 빨라진다', () => {
    for (let s = 1; s <= 30; s += 1) {
      const p = balloonPlan(20, 7, seededRandom(s));
      const aims = p.beats.filter((b) => b.kind === 'aim' && !b.cause);
      expect(aims[0].flyMs!).toBeGreaterThan(aims.at(-1)!.flyMs!);
    }
  });

  it('순서는 시드마다 섞이고, 같은 시드는 같은 일정', () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, s) =>
        balloonPlan(10, 3, seededRandom(s))
          .beats.filter((b) => b.kind === 'pop' || b.kind === 'chain')
          .map((b) => b.index)
          .join(','),
      ),
    );
    expect(orders.size).toBeGreaterThan(10);
    expect(balloonPlan(12, 5, seededRandom(42))).toEqual(balloonPlan(12, 5, seededRandom(42)));
  });

  it('후보가 두 곳보다 적거나 당첨이 범위 밖이면 빈 일정', () => {
    expect(balloonPlan(0, 0).beats).toHaveLength(0);
    expect(balloonPlan(1, 0).beats).toHaveLength(0);
    expect(balloonPlan(5, 5).beats).toHaveLength(0);
    expect(balloonPlan(5, -1).beats).toHaveLength(0);
  });

  it('끝 장면(finalFrame)은 당첨만 남는다', () => {
    const f = finalFrame(6, 2);
    expect([...f.popped].sort()).toEqual([0, 1, 3, 4, 5]);
    expect(f.float).toBe(true);
  });

  it('열 수: 20곳은 6열(4줄), 2곳은 2열', () => {
    expect(balloonColumns(20)).toBe(6);
    expect(balloonColumns(2)).toBe(2);
    expect(balloonColumns(5)).toBe(3);
  });
});
