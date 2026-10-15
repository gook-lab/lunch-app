import { describe, expect, it } from 'vitest';
import {
  DICE_MAX_MS,
  DICE_MIN_MS,
  MAX_ROLLS,
  dieAt,
  dicePhase,
  dicePlan,
  faceZ,
  facePoses,
  foldInto,
  frontFace,
  neighborFaces,
  pawnAt,
  placeCell,
  throwFrom,
  trackLength,
} from './dice';
import { seededRandom } from './random';

/** 판 하나: 후보 n 곳, 말이 home 에 있고 당첨이 winner. 컴포넌트와 같은 순서로 계획을 만든다. */
function planFor(n: number, home: number, winner: number, seed: number) {
  const track = trackLength(n);
  const target = placeCell(winner, n);
  const cells = new Set(Array.from({ length: n }, (_, k) => placeCell(k, n)));
  const from = throwFrom(home, target, track);
  return { plan: dicePlan(from, target, track, seededRandom(seed), (c) => cells.has(c)), target, track };
}

describe('주사위 자세 — CSS 회전과 정면 눈', () => {
  it('final 자세는 그 눈이 정면, near 자세는 이웃 눈이 정면이다', () => {
    for (let f = 1; f <= 6; f += 1) {
      expect(frontFace(facePoses(f).final)).toBe(f);
      for (const g of neighborFaces(f)) {
        const p = facePoses(f, g);
        expect(frontFace(p.final)).toBe(f);
        expect(frontFace(p.near)).toBe(g);
        // 두 자세는 한 축으로 90° — 가운데는 두 면이 45° 씩 보이는 모서리다.
        const diff = Math.abs(p.final.rx - p.near.rx) + Math.abs(p.final.ry - p.near.ry);
        expect(diff).toBe(90);
        const mid = faceZ({ rx: (p.final.rx + p.near.rx) / 2, ry: (p.final.ry + p.near.ry) / 2 });
        expect(mid[f]).toBeCloseTo(Math.SQRT1_2, 5);
        expect(mid[g]).toBeCloseTo(Math.SQRT1_2, 5);
      }
    }
  });

  it('벽 반사로 접은 자리는 늘 펠트 안이다', () => {
    for (let u = -3; u <= 3; u += 0.01) {
      const v = foldInto(u, 0.12);
      expect(v).toBeGreaterThanOrEqual(0.12 - 1e-9);
      expect(v).toBeLessThanOrEqual(0.88 + 1e-9);
    }
  });
});

describe('주사위 던지기 — 사건은 당첨을 바꾸지 않는다', () => {
  it('후보 2~20곳, 시드 여럿: 눈의 합만큼 가면 당첨 칸이고, 마지막엔 모든 주사위가 진짜 눈을 보인다', () => {
    for (let n = 2; n <= 20; n += 1) {
      const track = trackLength(n);
      for (let seed = 1; seed <= 60; seed += 1) {
        const winner = (seed * 7) % n;
        const home = (seed * 5) % track;
        const { plan, target } = planFor(n, home, winner, seed * 101 + n);
        expect(plan.faces.reduce((a, b) => a + b, 0)).toBe(plan.distance);
        expect(plan.faces.length).toBeGreaterThanOrEqual(2);
        expect(plan.faces.length).toBeLessThanOrEqual(MAX_ROLLS);
        plan.faces.forEach((f) => {
          expect(f).toBeGreaterThanOrEqual(1);
          expect(f).toBeLessThanOrEqual(6);
        });
        expect((plan.from + plan.distance) % plan.track).toBe(target);
        expect(pawnAt(plan, plan.endMs)).toBe(target);
        expect(pawnAt(plan, 0)).toBe(plan.from);
        plan.dice.forEach((_, i) => {
          const d = dieAt(plan, i, plan.endMs);
          expect(frontFace(d.pose)).toBe(plan.faces[i]);
          expect(d.x).toBeGreaterThanOrEqual(0);
          expect(d.x).toBeLessThanOrEqual(1);
          expect(d.y).toBeGreaterThanOrEqual(0);
          expect(d.y).toBeLessThanOrEqual(1);
        });
      }
    }
  });

  it('모서리·부딪힘에서 잠깐 보이는 가짜 눈은 진짜 눈과 다르고, 합 공개 전에 진짜 눈으로 넘어간다', () => {
    let edges = 0;
    let knocks = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const n = 2 + (seed % 19);
      const { plan } = planFor(n, seed % trackLength(n), seed % n, seed);
      if (plan.edge) {
        edges += 1;
        const i = plan.edge.die;
        const settle = plan.dice[i].settleMs;
        const mid = dieAt(plan, i, settle + 10);
        expect(mid.teeter).toBe(true);
        const z = faceZ(mid.pose);
        // 서 있는 동안 진짜 눈과 가짜 눈이 함께 보인다.
        expect(z[plan.faces[i]]).toBeGreaterThan(0.4);
        expect(z[plan.edge.fake]).toBeGreaterThan(0.4);
        expect(plan.edge.fake).not.toBe(plan.faces[i]);
        // 가짜 눈이 닿을 칸은 당첨 칸이 아니다 — "아깝다" 는 다른 칸이어야 한다.
        expect(plan.edge.fakeCell).not.toBe(plan.target);
        expect(plan.edge.endMs).toBeLessThanOrEqual(plan.sumMs);
      }
      if (plan.knock) {
        knocks += 1;
        const k = plan.knock;
        const before = dieAt(plan, k.target, k.atMs - 1);
        expect(frontFace(before.pose)).toBe(k.fake);
        expect(k.fake).not.toBe(plan.faces[k.target]);
        expect(k.fakeCell).not.toBe(plan.target);
        expect(frontFace(dieAt(plan, k.target, k.endMs).pose)).toBe(plan.faces[k.target]);
        expect(plan.dice[k.hitter].settleMs).toBe(k.atMs);
        expect(k.endMs).toBeLessThanOrEqual(plan.sumMs);
      }
    }
    // 판마다 다르다 — 둘 다 자주, 그러나 늘은 아니게.
    expect(edges).toBeGreaterThan(100);
    expect(edges).toBeLessThan(300);
    expect(knocks).toBeGreaterThan(80);
    expect(knocks).toBeLessThan(300);
  });

  it(`연출은 ${DICE_MIN_MS / 1000}~${DICE_MAX_MS / 1000}초, 순서는 흔들기 → 쾅 → 구르기 → 합 → 말 → 당첨`, () => {
    for (let n = 2; n <= 20; n += 1) {
      for (let seed = 1; seed <= 40; seed += 1) {
        const { plan } = planFor(n, (seed * 3) % trackLength(n), (seed * 11) % n, seed * 13 + n);
        expect(plan.endMs).toBeGreaterThanOrEqual(DICE_MIN_MS);
        expect(plan.endMs).toBeLessThanOrEqual(DICE_MAX_MS + 100);
        expect(dicePhase(plan, 0)).toBe('shake');
        expect(dicePhase(plan, plan.slamMs)).toBe('slam');
        expect(dicePhase(plan, plan.openMs)).toBe('roll');
        expect(dicePhase(plan, plan.sumMs)).toBe('sum');
        expect(dicePhase(plan, plan.walkMs)).toBe('walk');
        expect(dicePhase(plan, plan.endMs)).toBe('spot');
        expect(plan.slowFromMs).toBeLessThan(plan.slowToMs);
        // 벽에 한 번은 튕긴다.
        expect(plan.hits.length).toBeGreaterThan(0);
      }
    }
  });

  it('같은 판 번호는 같은 연출이다', () => {
    const a = planFor(9, 3, 5, 77).plan;
    const b = planFor(9, 3, 5, 77).plan;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('출발 칸: 6개로 못 닿거나 한 칸 거리인 큰 판은 닿는 자리에서 출발한다', () => {
    expect(throwFrom(3, 7, 16)).toBe(3);
    // 한 칸 거리 → 한 바퀴 더(16+1 ≤ 36).
    expect(throwFrom(6, 7, 16)).toBe(6);
    // 40칸 판에서 한 칸 거리 → 두 칸 뒤에서.
    expect(throwFrom(6, 7, 40)).toBe(5);
    // 40칸 판에서 39칸 거리 → 36칸 뒤에서.
    expect(throwFrom(8, 7, 40)).toBe(11);
  });
});
