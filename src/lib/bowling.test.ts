/**
 * 볼링 각본 테스트.
 *
 * 각본은 물리 계산이 아니라 "당첨 핀만 남는다" 를 먼저 정하고 짠 것이라, 약속을 직접 잰다:
 * 끝 장면엔 당첨 핀만 서 있다 · 당첨 핀은 어느 순간에도 쓰러지지 않는다 · 7.2초 안 ·
 * 같은 판은 같은 각본 · 사건(거터·스플릿·와르르·휘청·킥백·휘어 나감·정리 바)이 고루 나온다.
 */
import { describe, expect, it } from 'vitest';
import {
  LANE_X0,
  LANE_X1,
  MAX_END_MS,
  PIN_H,
  ROW_GAP,
  bowlingNameMax,
  bowlingPlan,
  deckLayout,
  deckRows,
  eventAt,
  frameAt,
  standingAt,
  type BowlingPlan,
} from './bowling';
import { seededRandom } from './random';

const planOf = (count: number, winner: number, seed: number) => bowlingPlan(count, winner, seededRandom(seed))!;

/** 후보 2~20곳 × 당첨 셋 × 시드 여럿. */
function* allPlans(seeds = 8): Generator<BowlingPlan> {
  for (let count = 2; count <= 20; count += 1)
    for (const winner of new Set([0, Math.floor(count / 2), count - 1]))
      for (let s = 0; s < seeds; s += 1) yield planOf(count, winner, count * 1000 + winner * 31 + s);
}

describe('볼링 핀 배치', () => {
  it('15곳은 1-2-3-4-5 삼각형, 모자라면 마지막 줄이 덜 찬다, 두 곳은 나란히', () => {
    expect(deckRows(15)).toEqual([1, 2, 3, 4, 5]);
    expect(deckRows(10)).toEqual([1, 2, 3, 4]);
    expect(deckRows(7)).toEqual([1, 2, 3, 1]);
    expect(deckRows(2)).toEqual([2]);
    expect(deckRows(3)).toEqual([1, 2]);
    expect(deckRows(20)).toEqual([1, 2, 3, 4, 5, 5]);
    for (let n = 1; n <= 20; n += 1) expect(deckRows(n).reduce((a, b) => a + b, 0)).toBe(n);
  });

  it('핀은 레인 안, 겹치지 않고, 이름표가 줄 안 핀 사이에 들어간다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const L = deckLayout(n);
      expect(L.pins).toHaveLength(n);
      for (const p of L.pins) {
        expect(p.x).toBeGreaterThan(LANE_X0 + 3);
        expect(p.x).toBeLessThan(LANE_X1 - 3);
        // 맨 뒷줄 이름표(핀 위 약 5단위)도 화면 위 끝 안.
        expect(p.y - PIN_H - 5).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(L.view - 20);
      }
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) {
          const a = L.pins[i];
          const b = L.pins[j];
          if (a.row === b.row) expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(L.spacing - 1e-9);
          else expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(ROW_GAP);
        }
      // 이름표 폭(11px 한 자 + 여백 8px)이 360px 상자에서 줄 안 핀 사이 0.94 를 넘지 않는다.
      expect(bowlingNameMax(L) * 11 + 8).toBeLessThanOrEqual(L.spacing * 3.6 * 0.94 + 1e-9);
      expect(bowlingNameMax(L, true) * 13 + 8).toBeLessThanOrEqual(L.spacing * 6.4 * 0.94 + 1e-9);
    }
    expect(bowlingNameMax(deckLayout(15))).toBe(4);
    expect(bowlingNameMax(deckLayout(2))).toBeGreaterThanOrEqual(6);
  });
});

describe('볼링 각본 — 당첨 핀만 끝까지 버틴다', () => {
  it('후보 2~20곳, 여러 당첨·시드: 끝 장면엔 당첨 핀만 서 있고 나머지는 모두 쓰러졌다', () => {
    let n = 0;
    for (const plan of allPlans()) {
      n += 1;
      const end = frameAt(plan, plan.endMs);
      end.pins.forEach((p, i) => {
        if (i === plan.winner) {
          expect(p.down).toBe(false);
          expect(p.gone).toBe(false);
          expect(Math.abs(p.rot)).toBeLessThan(1e-9);
        } else expect(p.down).toBe(true);
      });
      expect(plan.fates[plan.winner].fall).toBeNull();
      expect(standingAt(plan, plan.endMs)).toBe(1);
      expect(eventAt(plan, plan.endMs)?.kind).toBe('final');
    }
    expect(n).toBeGreaterThan(400);
  });

  it('당첨 핀은 어느 순간에도 쓰러지지 않는다(휘청여도 기울기 15도 안)', () => {
    for (const plan of allPlans(3)) {
      for (let t = 0; t <= plan.endMs; t += 20) {
        const w = frameAt(plan, t).pins[plan.winner];
        expect(w.down).toBe(false);
        expect(Math.abs(w.rot)).toBeLessThan(15);
      }
    }
  }, 30_000);

  it('마지막 공에 미끼가 하나만 남으면 휘청이다 쓰러지고, 상태 줄이 "버틸까?" 를 보인다', () => {
    let seen = 0;
    for (const plan of allPlans()) {
      const final = plan.rolls[plan.rolls.length - 1];
      if (final.knocked.length !== 1) continue;
      seen += 1;
      const ev = plan.events.find((e) => e.roll === final.index && (e.kind === 'teeter' || e.kind === 'duel') && e.falls);
      expect(ev).toBeDefined();
      expect(eventAt(plan, ev!.t + 20)).toBe(ev);
      // 휘청이는 동안 그 핀은 아직 서 있다.
      expect(frameAt(plan, ev!.t + 20).pins[ev!.pin!].down).toBe(false);
    }
    expect(seen).toBeGreaterThan(50);
  });

  it('마지막 공 전에 당첨 말고도 선 핀이 있다 — 마지막 공이 할 일이 있다', () => {
    for (const plan of allPlans()) {
      const final = plan.rolls[plan.rolls.length - 1];
      expect(final.final).toBe(true);
      expect(standingAt(plan, final.t0)).toBeGreaterThanOrEqual(2);
      // 마지막 아닌 공들도 당첨 핀은 건드리지 않는다.
      for (const r of plan.rolls) expect(r.knocked).not.toContain(plan.winner);
    }
  });

  it('핀은 한 번만 쓰러지고, 앞 공에 쓰러진 핀은 다음 공 전에 치워진다', () => {
    for (const plan of allPlans(4)) {
      const fell = plan.rolls.flatMap((r) => r.knocked);
      expect(new Set(fell).size).toBe(fell.length);
      for (const r of plan.rolls.slice(1)) {
        const f = frameAt(plan, r.t0);
        plan.rolls
          .filter((q) => q.index < r.index)
          .flatMap((q) => q.knocked)
          .forEach((i) => expect(f.pins[i].gone).toBe(true));
      }
    }
  });

  it('전체 길이 4.5~7.2초, 같은 판은 같은 각본', () => {
    let min = Infinity;
    let max = 0;
    for (const plan of allPlans()) {
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
      expect(plan.finalMs).toBeLessThan(plan.endMs);
      // 사건은 시간 순.
      for (let i = 1; i < plan.events.length; i += 1)
        expect(plan.events[i].t).toBeGreaterThanOrEqual(plan.events[i - 1].t);
    }
    expect(min).toBeGreaterThanOrEqual(4500);
    expect(max).toBeLessThanOrEqual(MAX_END_MS);
    expect(JSON.stringify(planOf(12, 5, 77))).toBe(JSON.stringify(planOf(12, 5, 77)));
    expect(JSON.stringify(planOf(12, 5, 77))).not.toBe(JSON.stringify(planOf(12, 5, 78)));
  });

  it('한 곳뿐이거나 당첨이 범위 밖이면 null', () => {
    expect(bowlingPlan(1, 0)).toBeNull();
    expect(bowlingPlan(5, 5)).toBeNull();
    expect(bowlingPlan(5, -1)).toBeNull();
  });
});

describe('볼링 사건', () => {
  it('사건이 고루 나오고, 미끼가 거의 버틸 뻔한 속임수가 자주 나온다', () => {
    const rate: Record<string, number> = {};
    let total = 0;
    for (const plan of allPlans(10)) {
      total += 1;
      const kinds = new Set<string>(plan.events.map((e) => e.kind));
      if (plan.rolls.length === 3) kinds.add('three');
      // 속임수: 당첨 아닌 핀이 휘청이다 쓰러지거나(버틸까?) 당첨과 둘만 남아 같이 휘청(누가 버틸까).
      if (plan.events.some((e) => (e.kind === 'teeter' && e.falls) || e.kind === 'duel')) kinds.add('fakeout');
      if (plan.events.some((e) => e.kind === 'teeter' && e.pin === plan.winner)) kinds.add('winnerTeeter');
      for (const k of kinds) rate[k] = (rate[k] ?? 0) + 1;
    }
    const r = (k: string) => (rate[k] ?? 0) / total;
    for (const k of ['gutter', 'split', 'strike', 'kick', 'swerve', 'hook', 'sweep', 'duel', 'winnerTeeter', 'three'])
      expect(r(k), k).toBeGreaterThan(0.05);
    expect(r('fakeout')).toBeGreaterThan(0.5);
    expect(r('cut')).toBe(1);
    expect(r('slow')).toBe(1);
  });

  it('두 곳: 첫 공은 거터 아니면 스치기, 마지막 공에 미끼가 쓰러진다', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s += 1) {
      const plan = planOf(2, s % 2, s);
      expect(plan.rolls).toHaveLength(2);
      seen.add(plan.rolls[0].kind);
      expect(plan.rolls[0].knocked).toHaveLength(0);
      expect(plan.rolls[1].knocked).toEqual([1 - (s % 2)]);
    }
    expect(seen).toEqual(new Set(['gutter', 'brush']));
  });

  it('스플릿·와르르(마지막 아님)는 당첨과 미끼 하나만 남긴다', () => {
    let seen = 0;
    for (const plan of allPlans(6)) {
      for (const r of plan.rolls) {
        if (r.final || (r.kind !== 'split' && r.kind !== 'strike')) continue;
        seen += 1;
        expect(standingAt(plan, r.end)).toBe(2);
      }
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('카메라: 처음·끝은 핀 쪽, 공을 놓을 땐 볼러 쪽, 끝 장면은 당첨 핀으로 다가간다', () => {
    const plan = planOf(15, 9, 4242);
    const L = plan.layout;
    expect(frameAt(plan, 0).cam.y).toBeCloseTo(L.view / 2);
    const r0 = plan.rolls[0];
    expect(frameAt(plan, r0.release).cam.y).toBeCloseTo(L.length - L.view / 2);
    // 공을 따라 올라간다(가운데가 점점 위로).
    const mid = frameAt(plan, (r0.release + r0.impact) / 2);
    expect(mid.ball).not.toBeNull();
    expect(mid.cam.y).toBeLessThan(L.length - L.view / 2);
    const end = frameAt(plan, plan.endMs);
    expect(end.cam.z).toBeGreaterThan(1.3);
    expect(end.stage).toBe('final');
  });
});
