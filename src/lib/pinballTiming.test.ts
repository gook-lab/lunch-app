import { describe, expect, it } from 'vitest';
import { FRAME_MS, SLOW_RATE, frameAtMs, timingFor } from './pinballTiming';

/** 화면 한 프레임(16.7ms)마다 시뮬레이션이 몇 프레임 나아가는지. 이게 곧 체감 배속이다. */
function screenRates(frames: number, winner: number): number[] {
  const t = timingFor(frames, winner);
  const out: number[] = [];
  let prev = 0;
  for (let ms = FRAME_MS; ms <= t.playMs; ms += FRAME_MS) {
    const f = frameAtMs(t, ms);
    out.push(f - prev);
    prev = f;
  }
  return out;
}

describe('핀볼 재생 속도 곡선', () => {
  it.each([
    [600, 300],
    [700, 400],
    [520, 240],
    [650, 350],
  ])('%i프레임 경기(1등 %i)에서 배속이 화면 프레임 사이에 튀지 않는다', (frames, winner) => {
    const rates = screenRates(frames, winner);
    // 마지막 한 칸은 끝에 걸려 잘리므로 뺀다.
    const body = rates.slice(0, -1);
    // 이웃한 화면 프레임 사이 배속 비율. 예전 계단식은 1 → 0.45(55% 급감),
    // 0.45 → 3(6.7배 급증)이었다.
    const jumps = body.slice(1).map((r, i) => Math.abs(r - body[i]) / Math.max(r, body[i]));
    expect(Math.max(...jumps)).toBeLessThan(0.08);
    expect(Math.min(...body)).toBeGreaterThan(SLOW_RATE - 0.05);
  });

  it('1등이 들어오는 시각은 실시간에서 슬로 구간 몫만 늘어난다', () => {
    const t = timingFor(600, 300);
    const realtime = 300 * FRAME_MS;
    expect(t.at[300]).toBeGreaterThan(realtime);
    expect(t.at[300]).toBeLessThan(realtime + 1500);
  });

  it('실측 최장급 꼬리(1등 뒤 300프레임)도 2초 안에 감는다', () => {
    const t = timingFor(600, 300);
    expect(t.playMs - t.at[300]).toBeLessThan(2000);
  });

  it('frameAtMs 는 표를 정확히 되찾는다', () => {
    const t = timingFor(500, 250);
    for (const f of [0, 10, 200, 250, 499]) expect(frameAtMs(t, t.at[f])).toBeCloseTo(f, 6);
  });
});
