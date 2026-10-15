/**
 * 돌림판 일정 테스트.
 *
 * 결말이 무엇이든 마지막 각도에서 바늘 밑 칸은 당첨이고(공정성), 멈칫하는 동안엔 이웃 칸이 바늘 밑에 있으며,
 * 판은 정해진 길이에 끝나고 각도가 튀지 않는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { ENDING_WEIGHTS, sliceAt, sliceFrac, wheelAngleAt, wheelBeatAt, wheelPlan, type WheelEnding } from './wheel';
import { seededRandom } from './random';

const TOTAL = 5600;

describe('돌림판 일정', () => {
  it('어떤 결말이든 멈춘 칸은 당첨 — 후보 2~20곳, 시드 여럿, 이어 도는 시작 각도', () => {
    for (let count = 2; count <= 20; count += 1)
      for (let winner = 0; winner < count; winner += 1)
        for (let seed = 0; seed < 24; seed += 1) {
          const start = (seed * 137.3) % 2000;
          const plan = wheelPlan(count, winner, start, TOTAL, seededRandom(seed * 31 + count))!;
          expect(sliceAt(plan.final, count)).toBe(winner);
          expect(sliceAt(wheelAngleAt(plan, plan.landMs), count)).toBe(winner);
          expect(sliceAt(wheelAngleAt(plan, TOTAL + 500), count)).toBe(winner);
          expect(wheelAngleAt(plan, 0)).toBe(start);
          // 칸 경계에 걸쳐 서지 않는다 — 바늘이 어느 칸인지 눈으로 읽힌다.
          const f = sliceFrac(plan.final, count);
          expect(f).toBeGreaterThan(0.1);
          expect(f).toBeLessThan(0.9);
          // 4바퀴 남짓은 돈다(당첨 칸 안에서 멈추는 자리만큼 덜 돌 수 있다).
          expect(plan.final - start).toBeGreaterThan(4 * 360 - 180);
        }
  });

  it('멈칫하는 동안 바늘 밑은 이웃 칸(당첨 아님)이고, 결말 움직임이 당첨 칸으로 넘긴다', () => {
    for (let count = 2; count <= 20; count += 1)
      for (let seed = 0; seed < 40; seed += 1) {
        const winner = seed % count;
        const plan = wheelPlan(count, winner, seed * 11, TOTAL, seededRandom(seed + 900))!;
        if (plan.ending === 'plain') {
          expect(plan.tease).toBeNull();
          continue;
        }
        const hold = plan.beats.find((b) => b.beat === 'hold')!.at;
        const move = plan.beats.find((b) => b.beat === 'move')!.at;
        expect(plan.tease).not.toBe(winner);
        for (let t = hold; t <= move; t += 20) expect(sliceAt(wheelAngleAt(plan, t), count)).toBe(plan.tease);
        // 역회전은 앞으로 지나친 칸(winner-1), 나머지는 다다르기 전 칸(winner+1).
        const want = plan.ending === 'reverse' ? (winner - 1 + count) % count : (winner + 1) % count;
        expect(plan.tease).toBe(want);
        // 역회전은 정말 거꾸로 돈다.
        if (plan.ending === 'reverse') expect(wheelAngleAt(plan, plan.landMs)).toBeLessThan(wheelAngleAt(plan, move));
        else expect(wheelAngleAt(plan, plan.landMs)).toBeGreaterThan(wheelAngleAt(plan, move));
      }
  });

  it('끼릭끼릭은 뒤로 감고, 휘리릭부터는 앞으로 — 각도가 프레임 사이에 튀지 않는다', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const count = 2 + (seed % 19);
      const plan = wheelPlan(count, seed % count, 100, TOTAL, seededRandom(seed))!;
      const launch = plan.beats.find((b) => b.beat === 'launch')!.at;
      expect(wheelAngleAt(plan, launch)).toBeLessThan(100);
      let prev = wheelAngleAt(plan, 0);
      for (let t = 16; t <= TOTAL; t += 16) {
        const a = wheelAngleAt(plan, t);
        // 가장 빠를 때도 한 프레임(16ms)에 45도를 넘지 않는다.
        expect(Math.abs(a - prev)).toBeLessThan(45);
        prev = a;
      }
    }
  });

  it('장면은 차례대로, 당첨은 끝나기 전에 보이고 한 판은 정해진 길이', () => {
    for (let seed = 0; seed < 300; seed += 1) {
      const plan = wheelPlan(9, 4, 0, TOTAL, seededRandom(seed))!;
      const at = plan.beats.map((b) => b.at);
      expect(at).toEqual([...at].sort((x, y) => x - y));
      expect(plan.beats[0].beat).toBe('windup');
      expect(plan.beats.at(-1)!.beat).toBe('landed');
      expect(plan.landMs).toBeLessThan(plan.endMs);
      expect(plan.endMs).toBe(TOTAL);
      expect(wheelBeatAt(plan, plan.landMs)).toBe('landed');
      expect(plan.clicks).toBeGreaterThanOrEqual(2);
      expect(plan.clicks).toBeLessThanOrEqual(4);
    }
  });

  it('결말 넷이 고루 나온다', () => {
    const seen = new Map<WheelEnding, number>();
    const N = 4000;
    for (let seed = 0; seed < N; seed += 1) {
      const e = wheelPlan(8, 3, 0, TOTAL, seededRandom(seed))!.ending;
      seen.set(e, (seen.get(e) ?? 0) + 1);
    }
    for (const [e, w] of ENDING_WEIGHTS) expect((seen.get(e) ?? 0) / N, e).toBeCloseTo(w, 1);
  });

  it('한 곳뿐이거나 당첨이 범위 밖이면 일정이 없다', () => {
    expect(wheelPlan(1, 0, 0, TOTAL)).toBeNull();
    expect(wheelPlan(5, 5, 0, TOTAL)).toBeNull();
    expect(wheelPlan(5, -1, 0, TOTAL)).toBeNull();
  });

  it('같은 시드면 같은 판', () => {
    expect(wheelPlan(9, 4, 30, TOTAL, seededRandom(42))).toEqual(wheelPlan(9, 4, 30, TOTAL, seededRandom(42)));
  });
});
