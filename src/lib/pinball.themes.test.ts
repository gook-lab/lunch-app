/**
 * 판 테마 — 어느 테마든 대칭이고, 구슬이 어디에도 안 걸리고, 이름표 맞바꾸기가 그대로 통한다.
 *
 * 당첨은 테마와 무관하다(raceForWinner). 그래도 판이 구슬을 가두면 경기가 안 끝나고,
 * 한쪽으로 기울면 "어느 쪽으로 돌려도 같다" 는 화면 문구가 거짓처럼 보인다.
 */
import { describe, expect, it } from 'vitest';
import {
  BOARD_H,
  COURSE_W,
  FINISH_Y,
  MAX_MARBLES,
  PINBALL_THEMES,
  buildCourse,
  raceForWinner,
  simulateRace,
  startSpot,
} from './pinball';

const mirror = (v: number) => COURSE_W - v;
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

describe.each(PINBALL_THEMES.map((t) => t.id))('테마 %s', (theme) => {
  const course = buildCourse(theme);

  it('좌우 대칭이다 — 벽·핀·블랙홀·가속 구간·웜홀·회전 고리', () => {
    for (const w of course.walls) {
      expect(course.walls.some((o) => near(o.x1, mirror(w.x1)) && near(o.y1, w.y1) && near(o.x2, mirror(w.x2))), `벽 ${w.x1},${w.y1}`).toBe(true);
    }
    for (const g of course.pegs) {
      expect(course.pegs.some((o) => near(o.x, mirror(g.x)) && near(o.y, g.y) && o.r === g.r && o.bumper === g.bumper), `핀 ${g.x},${g.y}`).toBe(true);
    }
    for (const w of course.wells) expect(near(w.x, COURSE_W / 2)).toBe(true);
    for (const o of course.orbiters) expect(near(o.x, COURSE_W / 2)).toBe(true);
    for (const z of course.zones) {
      expect(course.zones.some((o) => near(o.x1, mirror(z.x2)) && near(o.y1, z.y1) && o.ay === z.ay), `구간 ${z.x1},${z.y1}`).toBe(true);
    }
    for (const p of course.portals) {
      expect(
        course.portals.some((o) => near(o.from.x, mirror(p.from.x)) && near(o.from.y, p.from.y) && near(o.to.x, mirror(p.to.x)) && near(o.to.y, p.to.y)),
        `웜홀 ${p.from.x},${p.from.y}`,
      ).toBe(true);
      // 출구는 입구보다 아래, 어느 입구 안도 아니다 — 안 그러면 웜홀 사이를 영영 오간다.
      expect(p.to.y).toBeGreaterThan(p.from.y);
      for (const q of course.portals) expect(Math.hypot(p.to.x - q.from.x, p.to.y - q.from.y)).toBeGreaterThan(q.r);
    }
  });

  it('장치가 판 안에 있고, 아무것도 없는 구간이 60px 를 넘지 않는다', () => {
    const spans = [
      ...course.pegs.map((p) => [p.y - p.r, p.y + p.r]),
      ...course.walls.map((w) => [Math.min(w.y1, w.y2), Math.max(w.y1, w.y2)]),
      ...course.spinners.map((sp) => [sp.y - sp.half, sp.y + sp.half]),
      ...course.orbiters.map((o) => [o.y - o.R - o.r, o.y + o.R + o.r]),
      ...course.portals.map((p) => [p.from.y - p.r, p.from.y + p.r]),
      ...course.wells.map((w) => [w.y - w.r / 2, w.y + w.r / 2]),
    ].sort((a, b) => a[0] - b[0]);
    for (const [top, bottom] of spans) {
      expect(top).toBeGreaterThan(0);
      expect(bottom).toBeLessThan(BOARD_H);
    }
    let reach = spans[0][1];
    for (const [top, bottom] of spans) {
      expect(top - reach, `${reach} 에서 ${top} 까지 비어 있습니다`).toBeLessThanOrEqual(60);
      reach = Math.max(reach, bottom);
    }
  });

  it.each([2, 5, 12, 20, MAX_MARBLES])('구슬 %i개: 어디에도 안 걸리고 전원 완주, 판 밖으로 안 나간다', { timeout: 60_000 }, (count) => {
    for (let s = 1; s <= 15; s += 1) {
      const { frames } = simulateRace(count, s, false, theme);
      const last = frames[frames.length - 1];
      expect(last.every((m) => m.y >= FINISH_Y), `시드 ${s}`).toBe(true);
      for (const f of frames) for (const m of f) {
        expect(m.x).toBeGreaterThanOrEqual(0);
        expect(m.x).toBeLessThanOrEqual(COURSE_W);
      }
    }
  });

  it('모든 구슬이 이길 수 있고 한 구슬이 독차지하지 않는다', { timeout: 60_000 }, () => {
    const count = 6;
    const tally = new Array<number>(count).fill(0);
    for (let s = 1; s <= 120; s += 1) tally[simulateRace(count, s, true, theme).winner] += 1;
    expect(Math.min(...tally), tally.join(',')).toBeGreaterThan(0);
    expect(Math.max(...tally), tally.join(',')).toBeLessThan(120 * 0.5);
  });

  it('이름표 맞바꾸기 — 어느 목표든 1등', () => {
    for (const target of [0, 3, 7]) {
      const race = raceForWinner(8, target, 50 + target, theme)!;
      expect(race.winner).toBe(target);
      expect(race.frames[race.winnerFrame][target].y).toBeGreaterThanOrEqual(FINISH_Y);
    }
  });
});

describe('출발 자리', () => {
  it('20개까지 한 줄, 그 위로는 여러 줄이고 이웃 자리가 구슬 지름보다 넓다', () => {
    expect(new Set(Array.from({ length: 20 }, (_, i) => startSpot(i, 20).y)).size).toBe(1);
    const spots = Array.from({ length: MAX_MARBLES }, (_, i) => startSpot(i, MAX_MARBLES));
    expect(new Set(spots.map((p) => p.y)).size).toBeGreaterThan(1);
    for (const a of spots) for (const b of spots) {
      if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(14);
    }
    // 마지막 줄도 첫 장애물(갈매기 막대 y 72)보다 위다.
    expect(Math.max(...spots.map((p) => p.y))).toBeLessThan(60);
  });
});
