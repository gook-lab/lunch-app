/**
 * 승부차기 일정·궤적 테스트.
 *
 * 마지막 슛만 당첨 구역 골망에 들어가고, 앞 두 슛은 어떤 사건이든 골이 아니며, 시각이 늘어나기만 하고,
 * 한 판이 7.2초 안에 끝나는지 본다. 사건은 당첨을 바꾸지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  ballPath,
  BALL_STOPS,
  cameraAt,
  EVENT_WEIGHTS,
  FINAL_WEIGHTS,
  goalRows,
  isFinal,
  keeperHome,
  keeperMove,
  penaltyPlan,
  pitchLayout,
  SHOTS,
  zoneAt,
  type ShotKind,
} from './penalty';
import { seededRandom } from './random';

describe('승부차기 골문 구역', () => {
  it('구역은 골문 안을 빈틈없이 나누고 서로 겹치지 않는다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const l = pitchLayout(n);
      expect(l.zones).toHaveLength(n);
      expect(l.rows).toBe(goalRows(n));
      const g = l.goal;
      for (let r = 0; r < l.rows; r += 1) {
        const row = l.zones.filter((z) => z.row === r);
        expect(row.length).toBeGreaterThanOrEqual(n === 1 ? 1 : 2);
        // 줄 폭을 꽉 채운다.
        const sum = row.reduce((s, z) => s + z.w, 0);
        expect(sum).toBeCloseTo(g.right - g.left, 5);
      }
      for (const z of l.zones) {
        expect(z.x - z.w / 2).toBeGreaterThanOrEqual(g.left - 1e-9);
        expect(z.x + z.w / 2).toBeLessThanOrEqual(g.right + 1e-9);
        expect(z.y - z.h / 2).toBeGreaterThanOrEqual(g.top - 1e-9);
        expect(z.y + z.h / 2).toBeLessThanOrEqual(g.bottom + 1e-9);
        expect(zoneAt(l, z.x, z.y)).toBe(l.zones.indexOf(z));
      }
      expect(l.spot.y).toBeGreaterThan(g.bottom);
      expect(l.spot.y).toBeLessThan(100);
      expect(l.stands).toBeLessThan(g.top);
    }
  });

  it('15곳은 3줄 5칸 — 휴대폰(360px)에서도 구역 폭 55px 넘게, 높이 40px 넘게', () => {
    const l = pitchLayout(15);
    expect(l.rows).toBe(3);
    expect(l.maxCols).toBe(5);
    const z = l.zones[0];
    expect((z.w / 100) * 360).toBeGreaterThan(55);
    expect((z.h / 100) * (360 / l.aspect)).toBeGreaterThan(40);
  });

  it('경기장 가로세로 비는 0.85~1.2 — 크게 보기에서도 한 화면에 들어온다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const a = pitchLayout(n).aspect;
      expect(a).toBeGreaterThan(0.85);
      expect(a).toBeLessThan(1.2);
    }
  });
});

describe('승부차기 슛 세 번', () => {
  const all = (fn: (count: number, winner: number, seed: number) => void) => {
    for (let count = 2; count <= 20; count += 1)
      for (const winner of [0, Math.floor(count / 2), count - 1])
        for (let seed = 0; seed < 40; seed += 1) fn(count, winner, seed * 977 + count);
  };

  it('마지막 슛만 당첨 구역 골망에 — 앞 두 슛은 사건이 무엇이든 골이 아니다', () => {
    all((count, winner, seed) => {
      const l = pitchLayout(count);
      const plan = penaltyPlan(count, winner, seededRandom(seed))!;
      expect(plan.shots).toHaveLength(SHOTS);
      const last = plan.shots[SHOTS - 1];
      expect(isFinal(last)).toBe(true);
      expect(last.aim).toBe(winner);
      expect(zoneAt(l, last.x, last.y)).toBe(winner);
      for (const s of plan.shots.slice(0, -1)) {
        expect(isFinal(s)).toBe(false);
        expect(s.aim).toBeGreaterThanOrEqual(0);
        expect(s.aim).toBeLessThan(count);
        // 노린 구역이 당첨인 건 선방뿐(막혀서 골이 아니다).
        if (s.aim === winner) expect(s.kind).toBe('save');
        if (s.kind === 'post') {
          expect(s.post).not.toBe(0);
          expect(s.x).toBe(s.post < 0 ? l.goal.left : l.goal.right);
          expect(zoneAt(l, s.x, s.y)).toBeNull();
        }
        if (s.kind === 'over') expect(s.y).toBeLessThan(l.goal.top);
        if (s.kind === 'bar') expect(s.y).toBe(l.goal.top);
        if (s.kind === 'over' || s.kind === 'bar') expect(l.zones[s.aim].row).toBe(0);
        // 선방·캐치는 골키퍼가 공 닿는 순간 그 자리에 있다.
        if (s.kind === 'save' || s.kind === 'catch') {
          expect(s.dive.reach).toBe(1);
          expect(s.dive.x).toBe(s.x);
          expect(s.dive.y).toBe(s.y);
          expect(s.dive.delayMs + s.dive.durMs).toBe(s.impactMs - s.flyMs);
        }
      }
      // 같은 사건은 연달아 나오지 않는다.
      expect(plan.shots[0].kind).not.toBe(plan.shots[1].kind);
    });
  });

  it('마지막 슛 — 골은 반대로 다이빙, 늦은 다이빙은 같은 쪽이지만 공이 지나간 뒤에 닿는다', () => {
    all((count, winner, seed) => {
      const plan = penaltyPlan(count, winner, seededRandom(seed))!;
      const s = plan.shots[SHOTS - 1];
      const l = pitchLayout(count);
      const home = keeperHome(l);
      if (s.kind === 'late') {
        expect(Math.sign(s.dive.x - home.x)).toBe(Math.sign(s.x - home.x));
        expect(s.dive.reach).toBeLessThan(1);
        expect(s.dive.delayMs + s.dive.durMs).toBeGreaterThan(s.impactMs - s.flyMs);
      } else if (Math.abs(s.x - 50) >= 6) {
        expect(Math.sign(s.dive.x - home.x)).toBe(-Math.sign(s.x - home.x));
      }
    });
  });

  it('시각은 늘어나기만 하고, 한 판은 5~7.2초', () => {
    let min = Infinity;
    let max = 0;
    all((count, winner, seed) => {
      const plan = penaltyPlan(count, winner, seededRandom(seed))!;
      let prev = 0;
      for (const s of plan.shots) {
        for (const t of [s.stareMs, s.runMs, s.kickMs, s.flyMs, s.impactMs, s.endMs]) {
          expect(t).toBeGreaterThanOrEqual(prev);
          prev = t;
        }
      }
      expect(plan.endMs).toBe(plan.shots[SHOTS - 1].endMs);
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
    });
    expect(min).toBeGreaterThanOrEqual(5000);
    expect(max).toBeLessThanOrEqual(7200);
  });

  it('같은 시드는 같은 판 — 다른 시드는 사건이 섞여 나온다', () => {
    expect(penaltyPlan(9, 4, seededRandom(77))).toEqual(penaltyPlan(9, 4, seededRandom(77)));
    const seen = new Map<ShotKind, number>();
    const N = 4000;
    for (let seed = 0; seed < N; seed += 1) {
      const count = 2 + (seed % 19);
      const plan = penaltyPlan(count, seed % count, seededRandom(seed))!;
      for (const s of plan.shots) seen.set(s.kind, (seen.get(s.kind) ?? 0) + 1);
    }
    for (const [k] of EVENT_WEIGHTS) expect(seen.get(k) ?? 0, k).toBeGreaterThan(N * 0.12);
    for (const [k] of FINAL_WEIGHTS) expect(seen.get(k) ?? 0, k).toBeGreaterThan(N * 0.06);
    // 파넨카는 드물다.
    expect(seen.get('panenka')!).toBeLessThan(N * 0.2);
  });

  it('아깝다 — 대부분의 판에서 당첨이 아닌 구역이 골대·크로스바·선방으로 거의 들어갈 뻔한다', () => {
    let fake = 0;
    const N = 1000;
    for (let seed = 0; seed < N; seed += 1) {
      const plan = penaltyPlan(10, 3, seededRandom(seed))!;
      if (plan.shots.slice(0, -1).some((s) => s.aim !== 3 && (s.kind === 'post' || s.kind === 'bar' || s.kind === 'save'))) fake += 1;
    }
    expect(fake / N).toBeGreaterThan(0.6);
  });

  it('한 곳뿐이거나 당첨이 범위 밖이면 null', () => {
    expect(penaltyPlan(1, 0, seededRandom(1))).toBeNull();
    expect(penaltyPlan(4, 4, seededRandom(1))).toBeNull();
    expect(penaltyPlan(4, -1, seededRandom(1))).toBeNull();
  });
});

describe('승부차기 궤적·골키퍼·카메라', () => {
  it('공은 스폿에서 출발해 닿는 점에서 끝나고, 멀어질수록 작아진다', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const count = 2 + (seed % 19);
      const l = pitchLayout(count);
      const plan = penaltyPlan(count, seed % count, seededRandom(seed))!;
      for (const s of plan.shots) {
        const p = ballPath(l, s);
        expect(p).toHaveLength(BALL_STOPS);
        expect(p[0].x).toBeCloseTo(l.spot.x, 6);
        expect(p[0].y).toBeCloseTo(l.spot.y, 6);
        expect(p.at(-1)!.x).toBeCloseTo(s.x, 6);
        expect(p.at(-1)!.y).toBeCloseTo(s.y, 6);
        for (let k = 1; k < p.length; k += 1) expect(p[k].s).toBeLessThan(p[k - 1].s);
      }
    }
  });

  it('파넨카는 높이 떴다가 떨어진다', () => {
    let seed = 0;
    let plan = penaltyPlan(6, 2, seededRandom(seed))!;
    while (plan.shots[2].kind !== 'panenka') plan = penaltyPlan(6, 2, seededRandom(++seed))!;
    const p = ballPath(pitchLayout(6), plan.shots[2]);
    expect(Math.min(...p.map((q) => q.y))).toBeLessThan(plan.shots[2].y);
  });

  it('골키퍼는 다이빙 쪽으로 몸을 기울이고, 서 있을 땐 그대로', () => {
    const l = pitchLayout(8);
    const plan = penaltyPlan(8, 0, seededRandom(5))!;
    for (const s of plan.shots) {
      const m = keeperMove(l, s);
      if (Math.abs(m.dx) > 1) expect(Math.sign(m.rot)).toBe(Math.sign(m.dx));
      expect(Math.abs(m.rot)).toBeLessThanOrEqual(88);
    }
  });

  it('카메라는 가장자리 밖을 보이지 않는다', () => {
    for (const [x, y] of [[0, 0], [100, 100], [50, 50], [3, 97]]) {
      const { tx, ty } = cameraAt(x, y, 1.6);
      expect(tx).toBeLessThanOrEqual(0);
      expect(ty).toBeLessThanOrEqual(0);
      expect(tx + 160).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(ty + 160).toBeGreaterThanOrEqual(100 - 1e-9);
    }
  });
});
