import { describe, it, expect } from 'vitest';
import {
  BOARD_W,
  binFromX,
  buildPegs,
  buildPinballRun,
  pinballGeometry,
} from './pinball';

/** 재현 가능한 난수. 섞는 순서를 고정해 실패를 다시 만들 수 있게 한다. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COUNTS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

describe('buildPinballRun — 연출이 결과를 정하지 않는다', () => {
  it('모든 후보 수와 모든 당첨에 대해 도착 칸이 winnerIndex 다', () => {
    // 이 테스트가 이 게임의 전부다. 깨지면 화면과 DB 가 어긋난다.
    for (const count of COUNTS) {
      for (let winner = 0; winner < count; winner += 1) {
        for (const seed of [1, 7, 99, 1234]) {
          const run = buildPinballRun(count, winner, rng(seed))!;
          expect(run, `count=${count} winner=${winner}`).not.toBeNull();

          const last = run.points[run.points.length - 1];
          expect(
            binFromX(last.x, run.geometry, count),
            `count=${count} winner=${winner} seed=${seed}`,
          ).toBe(winner);
        }
      }
    }
  });

  it('오른쪽으로 꺾는 횟수가 정확히 winnerIndex 다', () => {
    for (const count of COUNTS) {
      for (let winner = 0; winner < count; winner += 1) {
        const run = buildPinballRun(count, winner, rng(42))!;
        expect(run.rights.filter(Boolean).length).toBe(winner);
        expect(run.rights).toHaveLength(Math.max(count - 1, 0));
      }
    }
  });

  it('난수를 바꾸면 꺾는 위치가 달라지지만 도착 칸은 같다', () => {
    const shapes = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const run = buildPinballRun(8, 3, rng(seed))!;
      expect(binFromX(run.points.at(-1)!.x, run.geometry, 8)).toBe(3);
      shapes.add(run.rights.join(''));
    }
    // 매번 같은 길만 나오면 연출로서 의미가 없다.
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('같은 난수는 같은 경로를 만든다', () => {
    const a = buildPinballRun(6, 4, rng(11))!;
    const b = buildPinballRun(6, 4, rng(11))!;
    expect(a.points).toEqual(b.points);
    expect(a.rights).toEqual(b.rights);
  });

  it('범위를 벗어난 당첨은 null', () => {
    expect(buildPinballRun(5, 5, rng(1))).toBeNull();
    expect(buildPinballRun(5, -1, rng(1))).toBeNull();
    expect(buildPinballRun(0, 0, rng(1))).toBeNull();
  });

  it('공이 판 안에서만 움직이고 아래로만 내려간다', () => {
    for (const count of COUNTS) {
      const run = buildPinballRun(count, count - 1, rng(5))!;
      let prevY = -Infinity;
      for (const point of run.points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(BOARD_W);
        expect(point.y).toBeGreaterThan(prevY);
        prevY = point.y;
      }
      expect(run.points.at(-1)!.y).toBeLessThanOrEqual(run.geometry.svgH);
    }
  });

  it('부딪힌 핀 번호가 실제 핀 배열 안을 가리킨다', () => {
    for (const count of COUNTS) {
      const run = buildPinballRun(count, 0, rng(3))!;
      const pegs = buildPegs(run.geometry);
      expect(pegs).toHaveLength(run.geometry.pegCount);

      const hit = run.points.filter((p) => p.peg >= 0);
      // 출발·도착을 뺀 나머지가 행 수만큼이어야 한다.
      expect(hit).toHaveLength(run.geometry.rows);
      for (const point of hit) {
        expect(point.peg).toBeLessThan(pegs.length);
        // 점의 x 는 그 핀의 x 와 같아야 한다 — 어긋나면 공이 핀을 스쳐 간다.
        expect(point.x).toBeCloseTo(pegs[point.peg].x, 6);
      }
    }
  });
});

describe('pinballGeometry', () => {
  it('후보가 1곳이면 핀 없이 칸 하나다', () => {
    const g = pinballGeometry(1);
    expect(g.rows).toBe(0);
    expect(g.pegCount).toBe(0);
    expect(g.binW).toBe(BOARD_W);
    expect(buildPinballRun(1, 0, rng(1))!.points).toHaveLength(2);
  });

  it('행이 많아져도 판 높이가 무한정 늘지 않는다', () => {
    const tall = pinballGeometry(30);
    expect(tall.svgH).toBeLessThan(300);
  });

  it('칸 폭 × 후보 수가 판 폭이다', () => {
    for (const count of COUNTS) {
      expect(pinballGeometry(count).binW * count).toBeCloseTo(BOARD_W, 6);
    }
  });
});
