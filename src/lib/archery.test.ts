/**
 * 활쏘기 일정·궤적 테스트.
 *
 * 마지막 화살만 당첨 과녁 정중앙에 꽂히고, 앞 두 발은 어떤 사건이든 정중앙에 꽂히지 않으며,
 * 시각이 늘어나기만 하고, 한 판이 7초 안에 끝나는지 본다. 사건은 당첨을 바꾸지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  archeryPlan,
  cameraAt,
  CLOSE_R,
  EVENT_WEIGHTS,
  flightPath,
  FLIGHT_STOPS,
  rangeColumns,
  rangeLayout,
  SHOTS,
  shotEnd,
  type ShotKind,
} from './archery';
import { seededRandom } from './random';

describe('활쏘기 사로 배치', () => {
  it('과녁은 사로 안에, 같은 줄 이웃과 이름표 폭(칸의 0.82)만큼 떨어져 있다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const l = rangeLayout(n, seededRandom(7 + n));
      expect(l.targets).toHaveLength(n);
      expect(l.cols).toBe(rangeColumns(n));
      for (const t of l.targets) {
        expect(t.x - l.size / 2 - t.slide).toBeGreaterThan(0);
        expect(t.x + l.size / 2 + t.slide).toBeLessThan(100);
        expect(t.y).toBeGreaterThan(5);
        expect(t.y).toBeLessThan(l.bow.y);
      }
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) {
          const a = l.targets[i];
          const b = l.targets[j];
          if (Math.abs(a.y - b.y) < 1) expect(Math.abs(a.x - b.x) - a.slide - b.slide).toBeGreaterThan(l.cellW * 0.82 - 0.01);
        }
    }
  });

  it('5·6곳은 4열 2줄(4+1·4+2) — 3열로 세 줄 높이가 되지 않게', () => {
    for (const n of [5, 6]) {
      const l = rangeLayout(n, seededRandom(n));
      expect(l.cols).toBe(4);
      expect(l.rows).toBe(2);
    }
  });

  it('15곳은 4열, 휴대폰(360px)에서도 과녁 지름 40px 넘게', () => {
    const l = rangeLayout(15, seededRandom(1));
    expect(l.cols).toBe(4);
    expect((l.size / 100) * 360).toBeGreaterThan(40);
  });
});

describe('활쏘기 화살 세 발', () => {
  const all = (fn: (count: number, winner: number, seed: number) => void) => {
    for (let count = 2; count <= 20; count += 1)
      for (const winner of [0, Math.floor(count / 2), count - 1])
        for (let seed = 0; seed < 40; seed += 1) fn(count, winner, seed * 977 + count);
  };

  it('마지막 화살만 당첨 정중앙 — 앞 두 발은 사건이 무엇이든 정중앙에 꽂히지 않는다', () => {
    all((count, winner, seed) => {
      const cols = rangeColumns(count);
      const plan = archeryPlan(count, winner, cols, seededRandom(seed))!;
      expect(plan.shots).toHaveLength(SHOTS);
      const last = plan.shots.at(-1)!;
      expect(['bullseye', 'split']).toContain(last.kind);
      expect(last.hit).toBe(winner);
      expect(last.aim).toBe(winner);
      expect([last.dx, last.dy]).toEqual([0, 0]);
      for (const s of plan.shots.slice(0, -1)) {
        expect(['plain', 'wind', 'ricochet', 'miss', 'close']).toContain(s.kind);
        if (s.hit === winner) {
          // 당첨 과녁에 꽂히는 건 아깝다(close)뿐이고, 그것도 정중앙에서 CLOSE_R 떨어져 있다.
          expect(s.kind).toBe('close');
          expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(CLOSE_R);
        } else if (s.hit !== null) {
          expect(Math.hypot(s.dx, s.dy)).toBeGreaterThan(0.25);
        }
        if (s.kind === 'ricochet' || s.kind === 'miss') expect(s.hit).toBeNull();
        if (s.kind === 'wind') expect(s.hit).not.toBe(s.aim);
        if (s.kind === 'plain') expect(s.aim).not.toBe(winner);
        expect(s.hit === null || (s.hit >= 0 && s.hit < count)).toBe(true);
      }
      // 같은 사건이 연달아 나오지 않는다.
      expect(plan.shots[0].kind).not.toBe(plan.shots[1].kind);
      // 로빈후드는 당첨 과녁에 아깝다 화살이 있을 때만.
      if (last.kind === 'split') expect(plan.shots.some((s) => s.kind === 'close' && s.hit === winner)).toBe(true);
    });
  });

  it('시각은 늘어나기만 하고, 한 판은 6.45~6.97초 — 7초를 넘지 않는다', () => {
    let min = Infinity;
    let max = 0;
    all((count, winner, seed) => {
      const plan = archeryPlan(count, winner, rangeColumns(count), seededRandom(seed))!;
      let t = 0;
      for (const s of plan.shots) {
        expect(s.drawMs).toBe(t);
        expect(s.releaseMs).toBeGreaterThan(s.drawMs);
        expect(s.flyMs).toBeGreaterThan(s.releaseMs);
        expect(s.impactMs).toBeGreaterThan(s.flyMs);
        expect(s.endMs).toBeGreaterThan(s.impactMs);
        t = s.endMs;
      }
      expect(plan.endMs).toBe(t);
      // 마지막 화살은 슬로모션 — 앞 발보다 오래 난다.
      const fly = plan.shots.map((s) => s.impactMs - s.flyMs);
      expect(fly[2]).toBeGreaterThan(Math.max(fly[0], fly[1]));
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
    });
    expect(min).toBeGreaterThanOrEqual(6450);
    expect(max).toBeLessThanOrEqual(6970);
  });

  it('사건이 고루 나온다 — 다섯 사건·새·로빈후드 모두, 로빈후드는 드물게', () => {
    const seen = new Map<ShotKind | 'bird', number>();
    let runs = 0;
    for (let seed = 0; seed < 4000; seed += 1) {
      const plan = archeryPlan(8, 3, 4, seededRandom(seed))!;
      runs += 1;
      for (const s of plan.shots) seen.set(s.kind, (seen.get(s.kind) ?? 0) + 1);
      if (plan.shots.some((s) => s.bird)) seen.set('bird', (seen.get('bird') ?? 0) + 1);
    }
    for (const [k] of EVENT_WEIGHTS) expect(seen.get(k), k).toBeGreaterThan(runs * 0.15);
    expect(seen.get('bird')! / runs).toBeCloseTo(0.3, 1);
    const split = (seen.get('split') ?? 0) / runs;
    expect(split).toBeGreaterThan(0.05);
    expect(split).toBeLessThan(0.15);
  });

  it('두 곳이어도 바람은 당첨을 겨눴다가 남은 한 곳으로 휜다', () => {
    let winds = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const plan = archeryPlan(2, 1, 2, seededRandom(seed))!;
      for (const s of plan.shots.slice(0, -1)) {
        if (s.hit !== null && s.hit !== 1) expect(s.hit).toBe(0);
        if (s.kind === 'wind') {
          winds += 1;
          expect([s.aim, s.hit]).toEqual([1, 0]);
        }
      }
    }
    expect(winds).toBeGreaterThan(0);
  });

  it('한 곳뿐이거나 당첨이 범위 밖이면 쏘지 않는다', () => {
    expect(archeryPlan(1, 0, 1)).toBeNull();
    expect(archeryPlan(5, 5, 3)).toBeNull();
    expect(archeryPlan(5, -1, 3)).toBeNull();
  });

  it('같은 시드면 같은 판', () => {
    expect(archeryPlan(9, 4, 4, seededRandom(42))).toEqual(archeryPlan(9, 4, 4, seededRandom(42)));
  });
});

describe('활쏘기 궤적·카메라', () => {
  it('궤적은 활에서 출발해 끝점에 닿는다 — 마지막 화살은 당첨 과녁 한가운데', () => {
    for (const n of [2, 7, 15]) {
      const layout = rangeLayout(n, seededRandom(n));
      for (let seed = 0; seed < 30; seed += 1) {
        const winner = seed % n;
        const plan = archeryPlan(n, winner, layout.cols, seededRandom(seed))!;
        for (const s of plan.shots) {
          const pts = flightPath(layout, s);
          expect(pts).toHaveLength(FLIGHT_STOPS);
          expect(pts[0].x).toBeCloseTo(layout.bow.x);
          expect(pts[0].y).toBeCloseTo(layout.bow.y);
          const e = shotEnd(layout, s);
          expect(pts.at(-1)!.x).toBeCloseTo(e.x);
          expect(pts.at(-1)!.y).toBeCloseTo(e.y);
          // 화살은 위(과녁 쪽)로 난다 — 방향이 ±90° 안.
          for (const p of pts) expect(Math.abs(p.angle)).toBeLessThan(90);
        }
        const last = flightPath(layout, plan.shots.at(-1)!).at(-1)!;
        expect(last.x).toBeCloseTo(layout.targets[winner].x);
        expect(last.y).toBeCloseTo(layout.targets[winner].y);
      }
    }
  });

  it('빗나간 화살은 사로 위쪽 밖으로 나간다', () => {
    const layout = rangeLayout(6, seededRandom(6));
    let misses = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = archeryPlan(6, 2, layout.cols, seededRandom(seed))!;
      for (const s of plan.shots)
        if (s.kind === 'miss') {
          misses += 1;
          expect(shotEnd(layout, s).y).toBeLessThan(0);
        }
    }
    expect(misses).toBeGreaterThan(0);
  });

  it('카메라는 가장자리 밖을 보이지 않는다', () => {
    for (const zoom of [1, 1.6, 2.2])
      for (const [x, y] of [[0, 0], [50, 50], [100, 100], [10, 95], [50, -8]]) {
        const { tx, ty } = cameraAt(x, y, zoom);
        // 보이는 범위: 왼쪽 위 = −t/zoom, 오른쪽 아래 = (100 − t)/zoom.
        expect(-tx / zoom).toBeGreaterThanOrEqual(-1e-9);
        expect((100 - tx) / zoom).toBeLessThanOrEqual(100 + 1e-9);
        expect(-ty / zoom).toBeGreaterThanOrEqual(-1e-9);
        expect((100 - ty) / zoom).toBeLessThanOrEqual(100 + 1e-9);
      }
    expect(cameraAt(50, 50, 1)).toEqual({ tx: 0, ty: 0 });
  });
});
