/**
 * 보물찾기 일정·배치 테스트.
 *
 * 마지막 구덩이만 당첨 자리이고 진짜 보물이 나오며, 앞 구덩이는 사건이 무엇이든 당첨이 아닌 곳이고,
 * 장면 시각이 늘어나기만 하고, 한 판이 7.2초 안에 끝나는지 본다. 사건은 당첨을 바꾸지 않는다.
 */
import { describe, it, expect } from 'vitest';
import {
  cameraAt,
  FAKE_WEIGHTS,
  INTRO_MS,
  mapColumns,
  NEAR_WIN,
  PATH_STOPS,
  standAt,
  TAG_W,
  timeline,
  treasureLayout,
  treasurePlan,
  walkPath,
  type DigPhase,
} from './treasure';
import { seededRandom } from './random';

describe('보물 지도 배치', () => {
  it('X 는 지도 안에, 같은 줄 이웃과 이름표 폭만큼 떨어져 있다', () => {
    for (let n = 1; n <= 20; n += 1) {
      const l = treasureLayout(n, seededRandom(7 + n));
      expect(l.spots).toHaveLength(n);
      expect(l.cols).toBe(mapColumns(n));
      for (const s of l.spots) {
        expect(s.x - (l.cellW * TAG_W) / 2).toBeGreaterThan(-0.01);
        expect(s.x + (l.cellW * TAG_W) / 2).toBeLessThan(100.01);
        expect(s.y).toBeGreaterThan(l.top);
        expect(s.y).toBeLessThan(l.beach);
      }
      for (let i = 0; i < n; i += 1)
        for (let j = i + 1; j < n; j += 1) {
          const a = l.spots[i];
          const b = l.spots[j];
          if (Math.abs(a.y - b.y) < 100 / (l.rows + 2) / 2) expect(Math.abs(a.x - b.x)).toBeGreaterThan(l.cellW * TAG_W);
        }
      // 해적이 서는 자리도 지도 안.
      for (let i = 0; i < n; i += 1) expect(standAt(l, i).x).toBeGreaterThan(0);
    }
  });

  it('15곳은 4열, 휴대폰(360px)에서도 칸 폭 80px 넘게', () => {
    const l = treasureLayout(15, seededRandom(1));
    expect(l.cols).toBe(4);
    expect((l.cellW / 100) * 360).toBeGreaterThan(80);
  });

  it('같은 시드면 같은 지도', () => {
    expect(treasureLayout(9, seededRandom(3))).toEqual(treasureLayout(9, seededRandom(3)));
  });
});

describe('보물찾기 구덩이 일정', () => {
  const all = (fn: (count: number, winner: number, seed: number) => void) => {
    for (let count = 2; count <= 20; count += 1)
      for (const winner of [0, Math.floor(count / 2), count - 1])
        for (let seed = 0; seed < 40; seed += 1) fn(count, winner, seed * 977 + count);
  };

  it('마지막 구덩이만 당첨 자리에서 보물 — 앞 구덩이는 사건이 무엇이든 당첨이 아닌 서로 다른 곳', () => {
    all((count, winner, seed) => {
      const layout = treasureLayout(count, seededRandom(11 + count));
      const plan = treasurePlan(layout, winner, seededRandom(seed))!;
      const last = plan.digs.at(-1)!;
      expect(last.spot).toBe(winner);
      expect(last.kind).toBe('treasure');
      expect(last.parrot).toBe(false);
      expect(last.crab).toBe(false);
      const fakes = plan.digs.slice(0, -1);
      expect(fakes).toHaveLength(count >= 3 ? 2 : 1);
      for (const d of fakes) {
        expect(d.spot).not.toBe(winner);
        expect(d.spot).toBeGreaterThanOrEqual(0);
        expect(d.spot).toBeLessThan(count);
        expect(['empty', 'boot', 'coin', 'mimic']).toContain(d.kind);
        expect(d.deep).toBe(false);
      }
      expect(new Set(plan.digs.map((d) => d.spot)).size).toBe(plan.digs.length);
      // 아깝다(상자가 나오는 가짜)가 판마다 하나는 있다.
      expect(fakes.some((d) => NEAR_WIN.includes(d.kind as never))).toBe(true);
      // 같은 것이 연달아 나오지 않는다.
      if (fakes.length === 2) expect(fakes[0].kind).not.toBe(fakes[1].kind);
    });
  });

  it('장면 시각은 늘어나기만 하고, 한 판은 5~7.2초', () => {
    let min = Infinity;
    let max = 0;
    all((count, winner, seed) => {
      const plan = treasurePlan(treasureLayout(count, seededRandom(11 + count)), winner, seededRandom(seed))!;
      const tl = timeline(plan);
      expect(tl[0].ms).toBeGreaterThanOrEqual(INTRO_MS);
      for (let i = 1; i < tl.length; i += 1) expect(tl[i].ms).toBeGreaterThan(tl[i - 1].ms);
      expect(plan.settleMs).toBeGreaterThan(tl.at(-1)!.ms);
      expect(plan.endMs).toBeGreaterThan(plan.settleMs);
      // 장면 순서: 앵무새·돌풍 → 걷기 → 파기 → 꽃게·더 깊이 → 나옴 → (열림)
      const order: DigPhase[] = ['parrot', 'gust', 'walk', 'dig', 'crab', 'deep', 'reveal', 'open'];
      for (const d of plan.digs) {
        const idx = d.phases.map((p) => order.indexOf(p.phase));
        expect([...idx].sort((a, b) => a - b)).toEqual(idx);
        expect(d.phases.some((p) => p.phase === 'open')).toBe(d.kind === 'treasure');
      }
      min = Math.min(min, plan.endMs);
      max = Math.max(max, plan.endMs);
    });
    expect(min).toBeGreaterThanOrEqual(5000);
    expect(max).toBeLessThanOrEqual(7200);
  });

  it('사건이 고루 나온다(시드 2000판)', () => {
    const n = { empty: 0, boot: 0, coin: 0, mimic: 0, parrot: 0, gust: 0, crab: 0, deep: 0 };
    const runs = 2000;
    let fakes = 0;
    for (let seed = 0; seed < runs; seed += 1) {
      const count = 2 + (seed % 14);
      const plan = treasurePlan(treasureLayout(count, seededRandom(11 + count)), seed % count, seededRandom(seed * 131))!;
      for (const d of plan.digs) {
        if (d.kind !== 'treasure') {
          n[d.kind] += 1;
          fakes += 1;
        }
      }
      if (plan.digs.some((d) => d.parrot)) n.parrot += 1;
      if (plan.digs.some((d) => d.gust)) n.gust += 1;
      if (plan.digs.some((d) => d.crab)) n.crab += 1;
      if (plan.digs.some((d) => d.deep)) n.deep += 1;
    }
    for (const [k] of FAKE_WEIGHTS) expect(n[k] / fakes, k).toBeGreaterThan(0.12);
    for (const k of ['parrot', 'gust', 'crab', 'deep'] as const) {
      expect(n[k] / runs, k).toBeGreaterThan(0.2);
      expect(n[k] / runs, k).toBeLessThan(0.7);
    }
  });

  it('같은 판 번호면 같은 일정, 한 곳뿐이거나 당첨이 범위 밖이면 null', () => {
    const l = treasureLayout(8, seededRandom(19));
    expect(treasurePlan(l, 3, seededRandom(5))).toEqual(treasurePlan(l, 3, seededRandom(5)));
    expect(treasurePlan(treasureLayout(1, seededRandom(12)), 0, seededRandom(1))).toBeNull();
    expect(treasurePlan(l, 8, seededRandom(1))).toBeNull();
    expect(treasurePlan(l, -1, seededRandom(1))).toBeNull();
  });
});

describe('걷는 길·카메라', () => {
  it('길은 출발점에서 시작해 도착점에서 끝난다', () => {
    const l = treasureLayout(6, seededRandom(17));
    const a = l.start;
    const b = standAt(l, 4);
    const p = walkPath(l, a, b, 0.25);
    expect(p).toHaveLength(PATH_STOPS);
    expect(p[0].x).toBeCloseTo(a.x);
    expect(p[0].y).toBeCloseTo(a.y);
    expect(p.at(-1)!.x).toBeCloseTo(b.x);
    expect(p.at(-1)!.y).toBeCloseTo(b.y);
  });

  it('카메라는 지도 밖을 보이지 않는다', () => {
    for (const [x, y] of [[0, 0], [100, 100], [50, 50], [3, 97]]) {
      const { tx, ty } = cameraAt(x, y, 1.6);
      expect(tx).toBeLessThanOrEqual(0);
      expect(ty).toBeLessThanOrEqual(0);
      expect(tx + 160).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(ty + 160).toBeGreaterThanOrEqual(100 - 1e-9);
    }
  });
});
