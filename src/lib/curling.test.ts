/**
 * 컬링 각본 테스트.
 *
 * 각본은 물리 계산이 아니라 끝 장면에서 거꾸로 짠 것이라, 약속을 직접 잰다:
 * 끝에 당첨이 버튼에 엄격히 가장 가깝다 · 어느 순간에도 스톤이 겹치지 않는다 · 7.2초 안 ·
 * 같은 판은 같은 각본 · 사건(테이크아웃·더블·연쇄·밀어 올리기·걸치기·측정·닦아요)이 고루 나온다.
 */
import { describe, it, expect } from 'vitest';
import {
  BUTTON,
  HOUSE_R,
  MAX_END_MS,
  R,
  SHEET_L,
  checkPlan,
  curlingNameMax,
  curlingPlan,
  dist,
  ease,
  eventAt,
  frameAt,
  idleLayout,
  sweepersAt,
  tagHalfWidth,
  type CurlingPlan,
} from './curling';
import { seededRandom } from './random';

const plans = (count: number, n: number, seed0 = 0): CurlingPlan[] =>
  Array.from({ length: n }, (_, s) => curlingPlan(count, (s * 7) % count, seededRandom(seed0 + s * 13 + count))!);

const closestPlace = (plan: CurlingPlan, t: number) => {
  const f = frameAt(plan, t);
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < plan.count; i += 1) {
    const d = dist(f.pos[i], BUTTON);
    if (d < bd) [best, bd] = [i, d];
  }
  return { best, bd, f };
};

describe('컬링 각본 — 당첨은 언제나 버튼에 가장 가깝다', () => {
  it('후보 2~20곳, 여러 당첨·시드: 끝 장면에서 당첨이 엄격히 가장 가깝고 우리 스톤은 멀다', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (let s = 0; s < 8; s += 1) {
          const plan = curlingPlan(count, winner, seededRandom(count * 1000 + winner * 31 + s))!;
          expect(plan).not.toBeNull();
          expect(plan.winner).toBe(winner);
          const end = frameAt(plan, plan.endMs);
          const dW = dist(end.pos[winner], BUTTON);
          // 버튼 둘레(하우스 안쪽 깊이).
          expect(dW).toBeLessThan(10);
          for (let i = 0; i < count; i += 1)
            if (i !== winner) expect(dist(end.pos[i], BUTTON)).toBeGreaterThan(dW + 0.39);
          for (let id = count; id < count + plan.throws; id += 1)
            expect(dist(end.pos[id], BUTTON)).toBeGreaterThan(dW + 6.9);
          // 화면 안에 멈춘다.
          for (const p of end.pos.slice(0, count)) {
            expect(p.x).toBeGreaterThanOrEqual(R);
            expect(p.x).toBeLessThanOrEqual(100 - R);
            expect(p.y).toBeGreaterThanOrEqual(R);
            expect(p.y).toBeLessThanOrEqual(SHEET_L - R);
          }
          expect(checkPlan(plan, false)).toBe(true);
        }
      }
    }
  }, 30_000);

  it('어느 순간에도 스톤끼리 겹치지 않는다(부딪치는 순간만 딱 맞닿는다)', () => {
    let worst = Infinity;
    for (const count of [2, 3, 6, 10, 15, 20]) {
      for (const plan of plans(count, 12)) {
        const n = count + plan.throws;
        for (let t = 0; t <= plan.endMs; t += 10) {
          const f = frameAt(plan, t);
          for (let i = 0; i < n; i += 1) {
            if (!f.shown[i]) continue;
            for (let j = i + 1; j < n; j += 1) if (f.shown[j]) worst = Math.min(worst, dist(f.pos[i], f.pos[j]));
          }
        }
      }
    }
    expect(worst).toBeGreaterThan(2 * R - 0.2);
  }, 30_000);

  it('처음·끝 장면에서 이름표끼리 겹치지 않고 시트 밖으로 잘리지 않는다(15곳까지)', () => {
    for (const count of [2, 5, 8, 12, 15]) {
      const half = tagHalfWidth(count);
      for (const plan of plans(count, 25)) {
        for (const t of [0, plan.endMs]) {
          const pos = frameAt(plan, t).pos.slice(0, count);
          for (let i = 0; i < count; i += 1) {
            expect(pos[i].x - half).toBeGreaterThan(0);
            expect(pos[i].x + half).toBeLessThan(100);
            for (let j = i + 1; j < count; j += 1) {
              const clash = Math.abs(pos[i].x - pos[j].x) < 2 * half && Math.abs(pos[i].y - pos[j].y) < 10;
              expect(clash, `count=${count} t=${t} ${i}-${j}`).toBe(false);
            }
          }
        }
      }
    }
  }, 30_000);

  it('길이는 4~7.2초, 투구는 2~3번, 시각이 차례대로다', () => {
    let min = Infinity;
    let max = 0;
    for (const count of [2, 4, 9, 15, 20]) {
      for (const plan of plans(count, 60)) {
        min = Math.min(min, plan.endMs);
        max = Math.max(max, plan.endMs);
        expect(plan.endMs).toBeLessThanOrEqual(MAX_END_MS);
        expect(plan.endMs).toBeGreaterThanOrEqual(4000);
        expect(plan.throws).toBeGreaterThanOrEqual(2);
        expect(plan.throws).toBeLessThanOrEqual(3);
        expect(plan.revealMs).toBeGreaterThan(plan.settleMs);
        expect(plan.endMs).toBeGreaterThan(plan.revealMs);
        for (const m of plan.moves) {
          expect(m.t1).toBeGreaterThanOrEqual(m.t0);
          expect(m.t1).toBeLessThanOrEqual(plan.settleMs);
        }
        for (let k = 1; k < plan.events.length; k += 1)
          expect(plan.events[k].t).toBeGreaterThanOrEqual(plan.events[k - 1].t);
        expect(plan.events.at(-1)).toMatchObject({ kind: 'reveal', id: plan.winner, t: plan.revealMs });
        // 투구는 앞 투구가 다 멈춘 뒤에 닿는다 — 우리 스톤 n 번째가 움직이기 시작한 뒤에야 n+1 번째가 온다.
        const delivers = plan.moves.filter((m) => m.kind === 'deliver');
        expect(delivers).toHaveLength(plan.throws);
        for (let k = 1; k < delivers.length; k += 1) expect(delivers[k].t0).toBeGreaterThan(delivers[k - 1].t0);
      }
    }
    // 판마다 길이가 다르다.
    expect(max - min).toBeGreaterThan(1500);
  }, 30_000);

  it('같은 판 번호는 같은 각본, 다른 판 번호는 다른 각본', () => {
    expect(curlingPlan(9, 4, seededRandom(42))).toEqual(curlingPlan(9, 4, seededRandom(42)));
    const a = curlingPlan(9, 4, seededRandom(42))!;
    const b = curlingPlan(9, 4, seededRandom(43))!;
    expect(a.start).not.toEqual(b.start);
  });

  it('후보가 2곳 미만이거나 당첨이 범위 밖이면 null', () => {
    expect(curlingPlan(1, 0)).toBeNull();
    expect(curlingPlan(0, 0)).toBeNull();
    expect(curlingPlan(5, -1)).toBeNull();
    expect(curlingPlan(5, 5)).toBeNull();
  });
});

describe('컬링 사건', () => {
  const sample = [...plans(8, 200), ...plans(15, 100, 7), ...plans(3, 100, 11)];
  const has = (p: CurlingPlan, kind: string) => p.events.some((e) => e.kind === kind);
  const rate = (pred: (p: CurlingPlan) => boolean) => sample.filter(pred).length / sample.length;

  it('사건이 고루 나온다 — 테이크아웃·더블·연쇄·한 끗·밀어 올리기·걸치기·측정', () => {
    expect(rate((p) => has(p, 'hit'))).toBeGreaterThan(0.5);
    expect(rate((p) => has(p, 'double'))).toBeGreaterThan(0.08);
    expect(rate((p) => has(p, 'chain'))).toBeGreaterThan(0.08);
    expect(rate((p) => has(p, 'short'))).toBeGreaterThan(0.1);
    expect(rate((p) => has(p, 'raise'))).toBeGreaterThan(0.5);
    expect(rate((p) => has(p, 'raise'))).toBeLessThan(0.9);
    expect(rate((p) => !!p.teeter)).toBeGreaterThan(0.2);
    expect(rate((p) => !!p.measure)).toBeGreaterThan(0.3);
    expect(rate((p) => !!p.measure)).toBeLessThan(0.65);
    expect(rate((p) => p.throws === 3)).toBeGreaterThan(0.2);
  });

  it('스위퍼가 판마다 적어도 한 번 "닦아요!" 를 외친다', () => {
    for (const p of sample) expect(has(p, 'sweep')).toBe(true);
  });

  it('측정: 2등은 당첨보다 0.4~1.2단위 멀고, 다 멈춘 뒤 측정하고 측정이 끝나야 당첨을 밝힌다', () => {
    for (const p of sample) {
      if (!p.measure) continue;
      const end = frameAt(p, p.endMs);
      const dW = dist(end.pos[p.winner], BUTTON);
      const dR = dist(end.pos[p.measure.runner], BUTTON);
      expect(dR - dW).toBeGreaterThan(0.4);
      expect(dR - dW).toBeLessThan(1.2);
      expect(p.measure.winnerDist).toBeCloseTo(dW, 6);
      expect(p.measure.runnerDist).toBeCloseTo(dR, 6);
      expect(p.measure.startMs).toBeGreaterThanOrEqual(p.settleMs);
      expect(p.revealMs).toBe(p.measure.endMs);
      // 측정 중에도 아직 당첨을 밝히지 않았다.
      expect(eventAt(p, p.measure.startMs + 10)?.kind).toBe('measure');
    }
  });

  it('밀어 올리기: 당첨이 하우스 앞에서 맞아 버튼 둘레로 올라온다 / 지키기: 당첨은 그대로, 더 가까운 미끼가 쳐내진다', () => {
    let raised = 0;
    let kept = 0;
    for (const p of sample) {
      const wMoves = p.moves.filter((m) => m.id === p.winner);
      if (p.events.some((e) => e.kind === 'raise')) {
        raised += 1;
        expect(wMoves).toHaveLength(1);
        expect(wMoves[0].path.a.y).toBeGreaterThan(wMoves[0].path.b.y);
        // 맞기 전엔 버튼에서 멀리(하우스 앞) 있다.
        expect(dist(wMoves[0].path.a, BUTTON)).toBeGreaterThan(dist(wMoves[0].path.b, BUTTON) + 8);
      } else {
        kept += 1;
        expect(wMoves).toHaveLength(0);
        // 처음엔 미끼가 당첨보다 가깝다 — 마지막 투구가 쳐낸다.
        const first = closestPlace(p, 0);
        expect(first.best).not.toBe(p.winner);
        expect(p.moves.some((m) => m.id === first.best && m.kind === 'knock')).toBe(true);
      }
    }
    expect(raised).toBeGreaterThan(0);
    expect(kept).toBeGreaterThan(0);
  });

  it('걸치기: 튕겨 나간 가게 스톤이 하우스 바깥 고리에 걸쳐 멈추고, 당첨이 아니다', () => {
    let n = 0;
    for (const p of sample) {
      if (!p.teeter) continue;
      n += 1;
      const at = frameAt(p, p.endMs).pos[p.teeter.id];
      expect(p.teeter.id).not.toBe(p.winner);
      expect(Math.abs(dist(at, BUTTON) - (HOUSE_R + R * 0.3))).toBeLessThan(0.01);
      expect(p.teeter.t1).toBeGreaterThan(p.teeter.t0);
    }
    expect(n).toBeGreaterThan(20);
  });

  it('부딪치는 순간 맞는 스톤과 미는 스톤은 딱 2R 떨어져 있다(지나쳐 겹치지 않는다)', () => {
    for (const p of sample.slice(0, 80)) {
      for (const e of p.events.filter((x) => x.at && ['hit', 'double', 'chain', 'raise'].includes(x.kind))) {
        const f = frameAt(p, e.t);
        const near = f.pos.filter((q, i) => f.shown[i] && dist(q, e.at!) < R + 0.05);
        expect(near.length, `${e.kind} @${e.t}`).toBe(2);
      }
    }
  });
});

describe('컬링 장면 도구', () => {
  it('ease 는 0→0, 1→1 이고 줄곧 늘어난다', () => {
    for (const k of ['out', 'carry', 'creep'] as const) {
      expect(ease(k, 0)).toBeCloseTo(0);
      expect(ease(k, 1)).toBeCloseTo(1);
      let prev = -1;
      for (let u = 0; u <= 1; u += 0.05) {
        const v = ease(k, u, 0.4);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it('우리 스톤은 던지기 전엔 보이지 않고, 끝 장면엔 모두 보인다', () => {
    const p = curlingPlan(6, 2, seededRandom(5))!;
    const f0 = frameAt(p, 0);
    expect(f0.shown.slice(0, 6).every(Boolean)).toBe(true);
    expect(f0.shown.slice(6).some(Boolean)).toBe(false);
    expect(frameAt(p, p.endMs).shown.every(Boolean)).toBe(true);
    expect(frameAt(p, p.endMs).moving.some(Boolean)).toBe(false);
  });

  it('스위퍼는 던진 스톤이 미끄러지는 동안 그 앞(나아가는 쪽)에 있고, 다 멈추면 없다', () => {
    for (const p of plans(7, 20)) {
      const d = p.moves.find((m) => m.kind === 'deliver')!;
      const mid = (d.t0 + d.t1) / 2;
      const sw = sweepersAt(p, mid);
      expect(sw).toHaveLength(1);
      expect(sw[0].id).toBe(d.id);
      // 위쪽(하우스 쪽)으로 나아간다.
      expect(sw[0].dir.y).toBeLessThan(0);
      expect(Math.hypot(sw[0].dir.x, sw[0].dir.y)).toBeCloseTo(1);
      expect(sweepersAt(p, p.settleMs + 1)).toHaveLength(0);
      // 외치는 동안만 shout.
      for (const e of p.events.filter((x) => x.kind === 'sweep')) {
        const during = sweepersAt(p, (e.t + e.until!) / 2);
        expect(during.some((s) => s.shout)).toBe(true);
      }
    }
  });

  it('판 시작 전 자리: 후보 수마다 고정, 1곳이면 버튼 위', () => {
    expect(idleLayout(0)).toEqual([]);
    expect(idleLayout(1)).toEqual([BUTTON]);
    expect(idleLayout(9)).toHaveLength(9);
    expect(idleLayout(9)).toEqual(idleLayout(9));
  });

  it('이름표 글자 수는 후보가 많을수록 짧다', () => {
    expect(curlingNameMax(2)).toBeGreaterThan(curlingNameMax(8));
    expect(curlingNameMax(8)).toBeGreaterThan(curlingNameMax(15));
    expect(curlingNameMax(15, true)).toBeGreaterThan(curlingNameMax(15));
  });
});
