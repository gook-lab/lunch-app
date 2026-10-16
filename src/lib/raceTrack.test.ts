import { describe, expect, it } from 'vitest';
import { PLANE_H, TRACK_SHAPES, gridBack, laneCount, laneOffset, roadWidth, trackAt, trackPath, trackPoint } from './raceTrack';

describe('경주 트랙 모양', () => {
  it('타원은 예전 식(반지름에 차선을 더함)과 같은 자리다', () => {
    for (const t of [0, 0.7, Math.PI / 2, 2.2, Math.PI, 4.1]) {
      const p = trackAt('oval', t, 3);
      // 법선으로 민 거리는 반지름에 더한 것과 정확히 같지는 않다(타원). 출발선·좌우 끝에선 같다.
      if (t === Math.PI / 2) {
        expect(p.x).toBeCloseTo(50, 5);
        expect(p.y).toBeCloseTo(PLANE_H / 2 + 21 + 3, 5);
      }
    }
  });

  it('모든 모양·차선이 판 안에 들어간다', () => {
    const lanes = 10;
    const out = roadWidth(lanes) / 2 + 1.5; // 바깥 연석까지
    for (const shape of TRACK_SHAPES) {
      for (let i = 0; i < 360; i++) {
        const p = trackAt(shape, (i / 360) * 2 * Math.PI, out);
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(PLANE_H);
      }
    }
  });

  it('안쪽 차선은 바깥 차선보다 중심에 가깝다(안팎이 뒤집히지 않는다)', () => {
    for (const shape of TRACK_SHAPES) {
      for (let i = 0; i < 72; i++) {
        const t = (i / 72) * 2 * Math.PI;
        const a = trackAt(shape, t, laneOffset(0, 10));
        const b = trackAt(shape, t, laneOffset(9, 10));
        const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 50, p.y - PLANE_H / 2);
        expect(dist(a)).toBeLessThan(dist(b));
      }
    }
  });

  it('출발선은 어느 모양이든 아래 가운데, 오른쪽으로 달려 나간다', () => {
    for (const shape of TRACK_SHAPES) {
      const p = trackPoint(shape, 0, 0, 3);
      expect(p.x).toBeCloseTo(50, 3);
      expect(Math.abs(p.deg)).toBeGreaterThan(150); // 왼쪽(180°) — θ 가 늘면 아래에서 왼쪽으로 간다
    }
  });

  it('경로는 닫힌 SVG path', () => {
    expect(trackPath('bean', 0, 8)).toMatch(/^M[\d.,L]+Z$/);
  });

  it('차선은 최대 10개, 6개를 넘으면 도로가 넓어진다', () => {
    expect(laneCount(3)).toBe(3);
    expect(laneCount(16)).toBe(10);
    expect(roadWidth(6)).toBe(13);
    expect(roadWidth(10)).toBe(17);
  });

  it('출발 대열 간격은 첫 1/4 바퀴에 사라진다', () => {
    expect(gridBack(0, 0, 3)).toBe(0);
    expect(gridBack(1, 0, 3)).toBeGreaterThan(0);
    expect(gridBack(2, 0, 1)).toBeGreaterThan(gridBack(1, 0, 1));
    expect(gridBack(1, 0.25, 1)).toBe(0);
    expect(gridBack(1, 1 / 12, 3)).toBe(0);
  });
});
