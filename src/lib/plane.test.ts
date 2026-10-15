/**
 * 종이비행기 일정·자세 테스트.
 *
 * 테이블에 내려앉는 건 당첨 하나뿐이고 나머지는 모두 그 전에 바닥에 떨어지는지,
 * 사건이 당첨을 바꾸지 못하는지, 길이가 7초 안인지, 사건이 판마다 섞여 나오는지 본다. 후보는 2~20곳.
 */
import { describe, it, expect } from 'vitest';
import {
  CELEBRATE_MS,
  crumples,
  FLOOR,
  LAND_Y,
  LOOP_MS,
  planeLayout,
  planeMarks,
  planePlan,
  planePose,
  planeSamples,
  sceneX,
  sceneY,
  TABLE_EDGE_X,
  TABLE_L,
  type Fate,
  type PlanePlan,
} from './plane';
import { seededRandom } from './random';

/** 2~20곳 × 당첨 셋 × 시드 여럿. */
function* plans(seeds = 12): Generator<{ count: number; winner: number; plan: PlanePlan }> {
  for (let count = 2; count <= 20; count += 1) {
    for (const winner of [0, Math.floor(count / 2), count - 1]) {
      for (let s = 0; s < seeds; s += 1) {
        const plan = planePlan(count, winner, seededRandom(count * 7919 + winner * 101 + s))!;
        yield { count, winner, plan };
      }
    }
  }
}

describe('종이비행기 일정', () => {
  it('후보가 둘 미만이거나 당첨이 범위 밖이면 일정이 없다', () => {
    expect(planePlan(1, 0)).toBeNull();
    expect(planePlan(0, 0)).toBeNull();
    expect(planePlan(5, -1)).toBeNull();
    expect(planePlan(5, 5)).toBeNull();
  });

  it('같은 시드면 같은 경기다', () => {
    expect(planePlan(9, 4, seededRandom(42))).toEqual(planePlan(9, 4, seededRandom(42)));
  });

  it('당첨만 테이블에 내려앉고, 나머지는 모두 착륙 전에 떨어진다 — 길이는 5.7~6.3초', () => {
    for (const { count, winner, plan } of plans()) {
      expect(plan.tracks).toHaveLength(count);
      const wins = plan.tracks.map((t, i) => (t.fate === 'win' ? i : -1)).filter((i) => i >= 0);
      expect(wins).toEqual([winner]);
      expect(plan.landMs).toBeGreaterThanOrEqual(5000);
      expect(plan.landMs).toBeLessThanOrEqual(5600);
      expect(plan.endMs).toBe(plan.landMs + CELEBRATE_MS);
      expect(plan.endMs).toBeLessThanOrEqual(7000);
      plan.tracks.forEach((t, i) => {
        expect(t.launchMs).toBeGreaterThanOrEqual(0);
        expect(t.launchMs).toBeLessThan(600);
        if (i === winner) {
          expect(t.arriveMs).toBe(plan.landMs);
          return;
        }
        expect(t.downMs).toBeGreaterThanOrEqual(1100);
        expect(t.restMs).toBeGreaterThan(t.downMs);
        // 당첨이 내려앉기 전에 바닥에 닿아 있다.
        expect(t.restMs).toBeLessThanOrEqual(plan.landMs);
      });
    }
  });

  it('마지막 장면: 당첨은 테이블 위, 나머지는 테이블 앞 바닥', () => {
    for (const { winner, plan } of plans(6)) {
      plan.tracks.forEach((_, i) => {
        const end = planePose(plan, i, plan.endMs);
        expect(planePose(plan, i, Infinity)).toEqual(end);
        if (i === winner) {
          expect(end).toMatchObject({ x: 100, phase: 'landed' });
          expect(end.y).toBeCloseTo(LAND_Y, 5);
        } else {
          expect(end.phase).toBe('down');
          expect(end.y).toBeCloseTo(FLOOR, 5);
          expect(end.x).toBeLessThan(TABLE_EDGE_X);
        }
      });
    }
  });

  it('사건이 당첨을 바꾸지 못한다 — 당첨은 날다가 바닥에 닿지 않고, 탈락은 테이블을 넘지 않는다', () => {
    for (const { winner, plan } of plans(3)) {
      for (let t = 0; t <= plan.endMs; t += 60) {
        plan.tracks.forEach((tr, i) => {
          const p = planePose(plan, i, t);
          expect(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.r)).toBe(true);
          if (i === winner) {
            expect(['desk', 'fly', 'landed']).toContain(p.phase);
            expect(p.y).toBeLessThan(FLOOR);
            if (t < plan.landMs) expect(p.x).toBeLessThan(100 + 1e-9);
          } else {
            // 테이블 모서리에 튕기는 비행기만 모서리에 닿는다. 그 밖엔 늘 테이블 앞이다.
            expect(p.x).toBeLessThanOrEqual(tr.fate === 'bounce' ? TABLE_EDGE_X + 0.5 : TABLE_EDGE_X - 2);
            expect(p.y).toBeLessThanOrEqual(FLOOR + 1e-9);
            if (t >= tr.restMs) expect(p.phase).toBe('down');
          }
        });
      }
    }
  }, 20_000);

  it('떨어지는 방식: 테이블 모서리는 마지막 탈락, 돌풍·비둘기는 하나, 유리창 둘·곤두박질 셋까지', () => {
    for (const { winner, plan } of plans(6)) {
      const losers = plan.tracks.filter((_, i) => i !== winner);
      const n = (f: Fate) => losers.filter((t) => t.fate === f).length;
      expect(n('bounce')).toBeLessThanOrEqual(1);
      expect(n('gust')).toBeLessThanOrEqual(1);
      expect(n('pigeon')).toBeLessThanOrEqual(1);
      expect(n('window')).toBeLessThanOrEqual(2);
      expect(n('spiral')).toBeLessThanOrEqual(3);
      const lastDown = Math.max(...losers.map((t) => t.downMs));
      for (const t of losers) {
        if (t.fate === 'bounce') expect(t.downMs).toBe(lastDown);
        // 비둘기·유리창은 나타날 틈이 있다.
        if (t.fate === 'pigeon' || t.fate === 'window') expect(t.downMs).toBeGreaterThanOrEqual(1300);
      }
      if (n('gust')) {
        const victim = losers.find((t) => t.fate === 'gust')!;
        expect(plan.gust).not.toBeNull();
        expect(victim.downMs).toBeGreaterThan(plan.gust!.ms);
        expect(victim.downMs).toBeLessThan(plan.gust!.ms + plan.gust!.durMs);
      }
      const bounce = losers.find((t) => t.fate === 'bounce');
      if (bounce) {
        // 앞서 날다 테이블 모서리에 닿는다.
        const i = plan.tracks.indexOf(bounce);
        expect(planePose(plan, i, bounce.downMs - 1).x).toBeGreaterThan(TABLE_EDGE_X - 3);
      }
    }
  });

  it('공중제비·에어컨 바람·기사회생은 날고 있는 비행기에만, 기사회생은 당첨만', () => {
    for (const { winner, plan } of plans(6)) {
      for (const f of plan.flourishes) {
        const t = plan.tracks[f.plane];
        expect(t.launchMs).toBeLessThan(f.ms);
        if (f.kind === 'comeback') expect(f.plane).toBe(winner);
        if (f.kind === 'updraft') expect(f.plane).not.toBe(winner);
        if (f.plane !== winner) expect(t.downMs).toBeGreaterThan(f.ms + f.durMs);
        else expect(f.ms + f.durMs).toBeLessThan(plan.landMs - 400);
        for (let k = 0; k <= 10; k += 1) expect(planePose(plan, f.plane, f.ms + (f.durMs * k) / 10).phase).toBe('fly');
      }
      // 같은 비행기에 두 장면이 겹치지 않는다.
      for (const a of plan.flourishes)
        for (const b of plan.flourishes)
          if (a !== b && a.plane === b.plane) expect(a.ms + a.durMs <= b.ms || b.ms + b.durMs <= a.ms).toBe(true);
    }
  });

  it('공중제비는 한 바퀴 돈다(기울기 −360°)', () => {
    for (let s = 0; s < 60; s += 1) {
      const plan = planePlan(6, 2, seededRandom(s))!;
      const loop = plan.flourishes.find((f) => f.kind === 'loop');
      if (!loop) continue;
      const a = planePose(plan, loop.plane, loop.ms);
      const top = planePose(plan, loop.plane, loop.ms + LOOP_MS / 2);
      const b = planePose(plan, loop.plane, loop.ms + LOOP_MS);
      expect(top.y).toBeLessThan(Math.min(a.y, b.y));
      expect(b.r - a.r).toBeLessThan(-300);
      return;
    }
    throw new Error('공중제비가 한 번도 안 나왔다');
  });

  it('기사회생: 당첨이 바닥 가까이 떨어졌다가 다시 떠오른다', () => {
    for (let s = 0; s < 60; s += 1) {
      const plan = planePlan(4, 1, seededRandom(s))!;
      const f = plan.flourishes.find((x) => x.kind === 'comeback');
      if (!f) continue;
      const low = planePose(plan, 1, f.ms + f.durMs * 0.47);
      const after = planePose(plan, 1, f.ms + f.durMs);
      expect(low.y).toBeGreaterThan(FLOOR - 0.1);
      expect(after.y).toBeLessThan(low.y - 0.2);
      return;
    }
    throw new Error('기사회생이 한 번도 안 나왔다');
  });

  it('사건은 판마다 섞여 나온다 — 확률 근처로', () => {
    const N = 600;
    const seen: Record<string, number> = {};
    const add = (k: string) => (seen[k] = (seen[k] ?? 0) + 1);
    for (let s = 0; s < N; s += 1) {
      const count = 2 + (s % 14);
      const plan = planePlan(count, s % count, seededRandom(1_000 + s))!;
      if (plan.gust) add('wind');
      for (const k of new Set(plan.flourishes.map((f) => f.kind))) add(k);
      for (const f of new Set(plan.tracks.map((t) => t.fate))) add(f);
    }
    const rate = (k: string) => (seen[k] ?? 0) / N;
    expect(rate('wind')).toBeGreaterThan(0.4);
    expect(rate('wind')).toBeLessThan(0.7);
    expect(rate('loop')).toBeGreaterThan(0.55);
    expect(rate('loop')).toBeLessThan(0.8);
    expect(rate('comeback')).toBeGreaterThan(0.33);
    expect(rate('comeback')).toBeLessThan(0.57);
    expect(rate('updraft')).toBeGreaterThan(0.2);
    expect(rate('updraft')).toBeLessThan(0.5);
    expect(rate('bounce')).toBeGreaterThan(0.38);
    expect(rate('bounce')).toBeLessThan(0.62);
    expect(rate('pigeon')).toBeGreaterThan(0.3);
    expect(rate('pigeon')).toBeLessThan(0.6);
    for (const k of ['window', 'spiral', 'glide']) expect(rate(k), k).toBeGreaterThan(0.2);
  });

  it('장면 순서는 시각 순이고 착륙·끝으로 마친다, 구겨지는 탈락만 rest 뒤 구겨진다', () => {
    for (const { winner, plan } of plans(3)) {
      const marks = planeMarks(plan);
      for (let k = 1; k < marks.length; k += 1) expect(marks[k].ms).toBeGreaterThanOrEqual(marks[k - 1].ms);
      expect(marks[0]).toEqual({ ms: 0, kind: 'launch', plane: -1 });
      expect(marks.at(-1)).toEqual({ ms: plan.endMs, kind: 'end', plane: -1 });
      expect(marks.filter((m) => m.kind === 'land')).toEqual([{ ms: plan.landMs, kind: 'land', plane: winner }]);
      expect(marks.filter((m) => m.kind === 'rest')).toHaveLength(plan.tracks.length - 1);
      for (const m of marks) expect(m.ms).toBeGreaterThanOrEqual(0);
    }
    expect(crumples('glide')).toBe(false);
    expect(crumples('window')).toBe(true);
    expect(crumples('win')).toBe(false);
  });

  it('키프레임 표본은 0 에서 1 까지 늘어나고 끝은 마지막 장면이다', () => {
    const plan = planePlan(5, 3, seededRandom(9))!;
    for (let i = 0; i < 5; i += 1) {
      const s = planeSamples(plan, i);
      expect(s[0].offset).toBe(0);
      expect(s.at(-1)!.offset).toBe(1);
      for (let k = 1; k < s.length; k += 1) expect(s[k].offset).toBeGreaterThan(s[k - 1].offset);
      expect(s.at(-1)!.pose).toEqual(planePose(plan, i, Infinity));
    }
  });
});

describe('종이비행기 판 모양', () => {
  it('후보가 많을수록 레인이 얇아지고(6% 까지) 판은 세로로 길어진다', () => {
    let prev = Infinity;
    for (let n = 1; n <= 20; n += 1) {
      const l = planeLayout(n);
      expect(l.lane).toBeGreaterThanOrEqual(0.06);
      expect(l.lane).toBeLessThanOrEqual(0.25);
      expect(l.aspect).toBeLessThan(prev);
      prev = l.aspect;
      // 첫 레인 위로 공중제비 한 바퀴(지름 2·loopR)가 하늘 띠 안에 든다(조금 넘는 건 들림·바람 몫).
      expect(sceneY(l, 0, -2 * l.loopR)).toBeGreaterThan(-1);
      // 마지막 레인 바닥은 장면 안.
      expect(sceneY(l, n - 1, 0.5)).toBeLessThan(100);
    }
  });

  it('비행 구간은 이름표 책상과 테이블 사이다', () => {
    expect(sceneX(0)).toBeGreaterThan(20);
    expect(sceneX(100)).toBeLessThan(100);
    expect(sceneX(TABLE_EDGE_X)).toBeCloseTo(TABLE_L, 5);
  });
});
