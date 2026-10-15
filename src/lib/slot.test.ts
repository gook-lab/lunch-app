/**
 * 슬롯 일정 테스트.
 *
 * 장면이 무엇이든 마지막에 세 릴 가운데 줄이 모두 당첨이고(공정성), 리치·꽝·다시 돌기가 장면대로 나오며,
 * 릴은 앞으로만 돌고 프레임 사이에 튀지 않고, 한 판은 정해진 길이인지 본다.
 */
import { describe, expect, it } from 'vitest';
import { REELS, SCENE_WEIGHTS, reelAt, reelOrders, slotBeatAt, slotPlan, symbolAt, type SlotScene } from './slot';
import { seededRandom } from './random';

const TOTAL = 6200;

describe('슬롯 릴 순서', () => {
  it('릴마다 후보 전부를 한 번씩 — 첫 릴은 목록 순서, 나머지는 섞여 있고 후보 수마다 같다', () => {
    for (let n = 2; n <= 20; n += 1) {
      const o = reelOrders(n);
      expect(o).toHaveLength(REELS);
      for (const order of o) expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(o[0]).toEqual(Array.from({ length: n }, (_, i) => i));
      expect(reelOrders(n)).toEqual(o);
    }
  });
});

describe('슬롯 한 판', () => {
  const all = (fn: (count: number, winner: number, seed: number) => void) => {
    for (let count = 2; count <= 20; count += 1)
      for (const winner of [0, Math.floor(count / 2), count - 1])
        for (let seed = 0; seed < 40; seed += 1) fn(count, winner, seed * 613 + count);
  };

  it('어떤 장면이든 마지막엔 세 릴 모두 당첨 — 후보 2~20곳, 이어 도는 시작 위치', () => {
    all((count, winner, seed) => {
      const starts = [seed % count, (seed * 7) % 41, 3.4];
      const plan = slotPlan(count, winner, starts, TOTAL, seededRandom(seed))!;
      for (let k = 0; k < REELS; k += 1) {
        const end = reelAt(plan.segs[k], TOTAL + 100, starts[k]);
        expect(Number.isInteger(end)).toBe(true);
        expect(symbolAt(plan.orders[k], end)).toBe(winner);
        expect(symbolAt(plan.orders[k], reelAt(plan.segs[k], plan.landMs, starts[k]))).toBe(winner);
        // 판 시작엔 앞 판 자리에서 그대로 출발한다.
        expect(reelAt(plan.segs[k], 0, starts[k])).toBeCloseTo(starts[k]);
      }
      // 마지막에 선 세 릴은 당첨.
      const lastStops = plan.stops.slice(-1);
      expect(lastStops[0].sym).toBe(winner);
    });
  });

  it('장면마다 리치·꽝·다시 돌기가 맞게 나온다 — 꽝은 당첨 줄이 아니다', () => {
    all((count, winner, seed) => {
      const plan = slotPlan(count, winner, [0, 0, 0], TOTAL, seededRandom(seed))!;
      const beats = plan.beats.map((b) => b.beat);
      const reach0 = plan.beats.find((b) => b.beat === 'reach' && b.round === 0)!;
      // 둘째 릴이 서면 첫째와 같은 가게 — 리치.
      const [st0, st1] = plan.stops.filter((s) => s.reel < 2);
      expect(st0.sym).toBe(st1.sym);
      expect(reach0.sym).toBe(st0.sym);
      if (plan.scene === 'fakeReach') {
        expect(plan.reach).not.toBe(winner);
        expect(reach0.sym).toBe(plan.reach);
        // 셋째는 X 에서 한 칸 지나쳐 X 가 아닌 곳에 선다(꽝) → 셋 다 다시.
        const third = plan.stops.filter((s) => s.reel === 2);
        expect(third[0].sym).toBe(plan.reach);
        expect(third[1].sym).not.toBe(plan.reach);
        expect(third[2].sym).toBe(winner);
        expect(beats).toContain('miss');
        expect(beats).toContain('respin');
        expect(
          plan.stops.filter((s) => s.sym === winner && s.at > plan.beats.find((b) => b.beat === 'respin')!.at),
        ).toHaveLength(3);
      } else {
        expect(plan.reach).toBeNull();
        expect(reach0.sym).toBe(winner);
      }
      if (plan.scene === 'overshoot') {
        const third = plan.stops.filter((s) => s.reel === 2);
        // 당첨 칸에서 멈칫(소리만) → 한 칸 지나쳐 꽝 → 다시 돌아 당첨.
        expect(third.map((s) => s.sym === winner)).toEqual([true, false, true]);
        expect(beats).toEqual(expect.arrayContaining(['teeter', 'miss', 'respin']));
      }
      if (plan.scene === 'creep') {
        const third = plan.stops.filter((s) => s.reel === 2);
        expect(third[0].sym).not.toBe(winner);
        expect(beats).toEqual(expect.arrayContaining(['short', 'creep']));
        expect(beats).not.toContain('miss');
      }
      if (plan.scene === 'jackpot') expect(beats).not.toContain('miss');
    });
  });

  it('릴은 앞으로만 돌고(서는 순간 튕김 빼고) 프레임 사이에 튀지 않는다', () => {
    let back = 0;
    let fast = { d: 0, at: '' };
    for (let seed = 0; seed < 300; seed += 1) {
      const count = 2 + (seed % 19);
      const plan = slotPlan(count, seed % count, [1, 2, 3], TOTAL, seededRandom(seed))!;
      for (let k = 0; k < REELS; k += 1) {
        let prev = reelAt(plan.segs[k], 0, 0);
        for (let t = 16; t <= TOTAL; t += 16) {
          const r = reelAt(plan.segs[k], t, 0);
          back = Math.min(back, r - prev);
          if (r - prev > fast.d) fast = { d: r - prev, at: `${plan.scene} n=${count} reel=${k} t=${t}` };
          prev = r;
        }
      }
    }
    expect(back).toBeGreaterThan(-0.2);
    // 가장 빨리 돌 때도 한 프레임에 한 칸 남짓.
    expect(fast.d, fast.at).toBeLessThan(1.4);
  });

  it('장면은 차례대로, 한 판은 정해진 길이에 잭팟으로 끝난다', () => {
    let maxStop = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const plan = slotPlan(12, 5, [0, 0, 0], TOTAL, seededRandom(seed))!;
      const at = plan.beats.map((b) => b.at);
      expect(at).toEqual([...at].sort((a, b) => a - b));
      expect(plan.beats[0].beat).toBe('pull');
      expect(plan.beats.at(-1)!.beat).toBe('jackpot');
      expect(slotBeatAt(plan, plan.landMs).beat).toBe('jackpot');
      expect(plan.endMs).toBe(TOTAL);
      maxStop = Math.max(maxStop, plan.stops.at(-1)!.at);
    }
    expect(maxStop).toBeLessThan(TOTAL - 500);
  });

  it('장면 넷이 고루, 잭팟의 멈칫은 반쯤', () => {
    const seen = new Map<SlotScene, number>();
    let teeter = 0;
    const N = 4000;
    for (let seed = 0; seed < N; seed += 1) {
      const p = slotPlan(9, 2, [0, 0, 0], TOTAL, seededRandom(seed))!;
      seen.set(p.scene, (seen.get(p.scene) ?? 0) + 1);
      if (p.teeter) teeter += 1;
    }
    for (const [s, w] of SCENE_WEIGHTS) expect((seen.get(s) ?? 0) / N, s).toBeCloseTo(w, 1);
    expect(teeter / (seen.get('jackpot') ?? 1)).toBeCloseTo(0.5, 1);
  });

  it('한 곳뿐이거나 당첨이 범위 밖이면 일정이 없다', () => {
    expect(slotPlan(1, 0, [0, 0, 0], TOTAL)).toBeNull();
    expect(slotPlan(4, 4, [0, 0, 0], TOTAL)).toBeNull();
  });

  it('같은 시드면 같은 판', () => {
    expect(slotPlan(9, 4, [0, 1, 2], TOTAL, seededRandom(7))).toEqual(
      slotPlan(9, 4, [0, 1, 2], TOTAL, seededRandom(7)),
    );
  });
});
