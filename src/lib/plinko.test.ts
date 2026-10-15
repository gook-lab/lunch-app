import { describe, expect, it } from 'vitest';
import {
  ballAt,
  beatAt,
  BALL_R,
  cameraAt,
  cameraTransform,
  landingSlot,
  MAX_END_MS,
  MIN_END_MS,
  pinHits,
  plinkoBoard,
  plinkoPath,
  plinkoPlan,
  restY,
  slotX,
  wallTop,
  type PlinkoPlan,
} from './plinko';
import { seededRandom } from './random';

describe('플링코 — 경로 역산', () => {
  it('모든 후보 수·모든 당첨 칸에서 공이 그 칸에 떨어진다', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let w = 0; w < n; w += 1) {
        const path = plinkoPath(w, n, seededRandom(n * 100 + w));
        expect(path).toHaveLength(n - 1);
        expect(landingSlot(path)).toBe(w);
      }
    }
  });

  it('판 번호가 다르면 길도 대체로 다르다', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, s) => plinkoPath(5, 12, seededRandom(s)).join('')));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('맞는 핀은 줄마다 하나, 그 줄 안의 번호다', () => {
    const path = plinkoPath(3, 8, seededRandom(1));
    const hits = pinHits(path);
    expect(hits).toHaveLength(7);
    hits.forEach((h, r) => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(r);
    });
  });
});

const planFor = (n: number, w: number, seed: number): PlinkoPlan => plinkoPlan(n, w, seededRandom(seed))!;

describe('플링코 각본', () => {
  it('한 곳뿐이거나 당첨이 범위 밖이면 null', () => {
    expect(plinkoPlan(1, 0)).toBeNull();
    expect(plinkoPlan(4, 4)).toBeNull();
    expect(plinkoPlan(4, -1)).toBeNull();
  });

  it('공정성: 진짜 공은 언제나 당첨 칸 바닥에서 끝나고, 가짜 공은 당첨이 아닌 칸으로만 간다 (2..20곳 × 여러 시드)', () => {
    for (let n = 2; n <= 20; n += 1) {
      const b = plinkoBoard(n);
      for (let s = 0; s < 60; s += 1) {
        const w = (s * 7 + n) % n;
        const plan = planFor(n, w, s * 131 + n);
        expect(plan.winnerIndex).toBe(w);
        expect(plan.real.slot).toBe(w);
        const end = ballAt(plan.real, plan.endMs)!;
        expect(end.x).toBeCloseTo(slotX(b, w));
        expect(end.y).toBeCloseTo(restY(b));
        // 칸에 닿은 뒤로는 움직이지 않는다.
        expect(ballAt(plan.real, plan.landMs)).toEqual(end);
        // 칸 바닥에 닿는 순간 공은 당첨 칸 벽 사이에 있다.
        for (const d of plan.decoys) {
          expect(d.slot).not.toBe(w);
          const p = ballAt(d, plan.endMs)!;
          expect(Math.floor(p.x / b.slotW)).toBe(d.slot);
        }
        const land = plan.beats.filter((x) => x.kind === 'land');
        expect(land).toHaveLength(1);
        expect(land[0].slot).toBe(w);
        // 넘어갈 뻔한 이웃 칸은 당첨 바로 옆이고 당첨이 아니다.
        if (plan.neighbour !== null) {
          expect(plan.neighbour).not.toBe(w);
          expect(Math.abs(plan.neighbour - w)).toBe(1);
        }
      }
    }
  });

  it('진짜 공은 칸 벽 아래로 내려간 뒤엔 당첨 칸 안에만 있다(벽을 뚫지 않는다)', () => {
    for (let s = 0; s < 300; s += 1) {
      const n = 2 + (s % 19);
      const b = plinkoBoard(n);
      const w = (s * 5) % n;
      const plan = planFor(n, w, s);
      for (let t = plan.releaseMs; t <= plan.endMs; t += 16) {
        const p = ballAt(plan.real, t)!;
        if (p.y > wallTop(b) + BALL_R) {
          expect(p.x, `${n}/${s}@${t}`).toBeGreaterThan(w * b.slotW);
          expect(p.x, `${n}/${s}@${t}`).toBeLessThan((w + 1) * b.slotW);
        }
      }
    }
  });

  it('길이 4.5~7초 · 시각이 앞으로만 간다 · 같은 판 번호는 같은 각본', () => {
    let min = Infinity;
    let max = 0;
    for (let s = 0; s < 800; s += 1) {
      const n = 2 + (s % 19);
      const plan = planFor(n, s % n, s);
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
      for (let k = 1; k < plan.real.segs.length; k += 1) {
        expect(plan.real.segs[k].t0).toBe(plan.real.segs[k - 1].t1);
        expect(plan.real.segs[k].t1).toBeGreaterThanOrEqual(plan.real.segs[k].t0);
      }
      expect(plan.introMs).toBeLessThanOrEqual(plan.releaseMs);
      expect(plan.releaseMs).toBeLessThan(plan.slowMs + 1);
      expect(plan.slowMs).toBeLessThan(plan.landMs);
      expect(plan.landMs).toBeLessThan(plan.endMs);
      for (const d of plan.decoys) expect(d.landMs).toBeLessThan(plan.releaseMs);
    }
    expect(min).toBeGreaterThanOrEqual(MIN_END_MS);
    expect(max).toBeLessThanOrEqual(MAX_END_MS);
    expect(planFor(9, 4, 77)).toEqual(planFor(9, 4, 77));
  });

  it('사건이 판마다 고루 나온다(가짜 공·멈칫·첫 핀 멈칫·범퍼·아슬아슬)', () => {
    const N = 2000;
    let decoy = 0;
    let fake = 0;
    let perch = 0;
    let edge = 0;
    let bump = 0;
    const kinds = new Set<string>();
    for (let s = 0; s < N; s += 1) {
      const n = 2 + (s % 19);
      const plan = planFor(n, (s * 3) % n, s + 5000);
      if (plan.events.decoys) decoy += 1;
      if (plan.events.hesitate === 'fake') fake += 1;
      if (plan.events.hesitate === 'perch') perch += 1;
      if (plan.events.edge) edge += 1;
      if (plan.events.bumperHits) bump += 1;
      kinds.add(`${plan.events.decoys}${plan.events.hesitate}${plan.events.edge}${plan.events.bumperHits}`);
    }
    const rate = (x: number) => x / N;
    expect(rate(decoy)).toBeGreaterThan(0.25);
    expect(rate(decoy)).toBeLessThan(0.5);
    expect(rate(fake)).toBeGreaterThan(0.15);
    expect(rate(perch)).toBeGreaterThan(0.12);
    expect(rate(edge)).toBeGreaterThan(0.45);
    expect(rate(edge)).toBeLessThan(0.7);
    expect(rate(bump)).toBeGreaterThan(0.5);
    expect(kinds.size).toBeGreaterThan(20);
  });

  it('범퍼 사건은 진짜 공이 실제로 맞은 범퍼다', () => {
    for (let s = 0; s < 200; s += 1) {
      const plan = planFor(12, s % 12, s);
      const realBumps = plan.hits.filter((h) => h.ball === 0 && h.bumper);
      expect(realBumps).toHaveLength(plan.events.bumperHits);
      expect(plan.beats.filter((x) => x.kind === 'bump')).toHaveLength(plan.events.bumperHits);
      for (const h of realBumps) expect(plan.bumpers).toContain(`${h.row}-${h.pin}`);
    }
  });

  it('카메라: 처음은 드로퍼를 크게, 끝은 판 전체(배율 1) · 판 밖을 비추지 않는다', () => {
    const b = plinkoBoard(15);
    const plan = planFor(15, 7, 3);
    expect(cameraAt(plan, b, 0).z).toBeGreaterThan(2);
    expect(cameraAt(plan, b, plan.endMs).z).toBe(1);
    expect(cameraAt(plan, b, plan.slowMs + 500).z).toBeGreaterThan(2);
    for (let t = 0; t <= plan.endMs; t += 50) {
      const c = cameraAt(plan, b, t);
      const { tx, ty, z } = cameraTransform(c.fx, c.fy, c.z);
      expect(tx).toBeLessThanOrEqual(0);
      expect(ty).toBeLessThanOrEqual(0);
      expect(tx).toBeGreaterThanOrEqual(100 - 100 * z - 1e-9);
      expect(ty).toBeGreaterThanOrEqual(100 - 100 * z - 1e-9);
    }
  });

  it('사건 순서: 드로퍼 → (가짜 공) → 망설임 → 톡 → … → 골인', () => {
    for (let s = 0; s < 100; s += 1) {
      const plan = planFor(10, s % 10, s);
      const order = plan.beats.map((x) => x.kind);
      expect(order[0]).toBe('intro');
      expect(order.at(-1)).toBe('land');
      expect(order.indexOf('hesitate')).toBeLessThan(order.indexOf('drop'));
      if (plan.events.decoys) expect(order.indexOf('decoy')).toBeLessThan(order.indexOf('hesitate'));
      if (plan.events.edge) expect(order.indexOf('edge')).toBeGreaterThan(order.indexOf('slow'));
      expect(beatAt(plan, plan.endMs)?.beat.kind).toBe('land');
      expect(beatAt(plan, -1)).toBeNull();
    }
  });
});
