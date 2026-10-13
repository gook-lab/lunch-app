/**
 * 핀볼 재생 속도 곡선.
 *
 * 시뮬레이션 프레임마다 재생 배속(rate)을 정하고, 그 역수를 쌓아 "이 프레임이
 * 화면에 나오는 시각" 표를 만든다. 화면은 경과 시간으로 이 표를 거꾸로 찾는다.
 *
 * 예전에는 배속을 계단으로 바꿨다. 1배로 내려오다 출구 앞 70프레임에서 갑자기
 * 0.45배, 1등이 들어오는 순간 갑자기 3배였다. 사용자 눈에는 "하단에서 멈칫하다
 * 갑자기 빨라지는" 끊김으로 보였다(2026-10-08 보고). 이제 배속은 코사인으로
 * 이어 붙여 어디서도 튀지 않는다.
 *
 * 1등이 들어온 뒤 나머지 구슬을 빨리감기로 마저 감던 꼬리는 뺐다. 당첨은 1등에서
 * 끝나는데 빨리감기를 보느라 결과가 늦게 떴다(10/13 사용자). 1등 뒤 HOLD_FRAMES 만
 * 제 속도로 보여 주고 재생을 끝낸다.
 *
 *   1배 ──╮ (EASE_IN 프레임 동안 감속)
 *         ╰── SLOW_RATE (출구 앞 SLOW_FRAMES 동안 유지) ──╮ (EASE_OUT 동안 가속)
 *                                                          ╰── 1배 (HOLD_FRAMES 뒤 끝)
 */
export const FRAME_MS = 1000 / 60;
/** 1등이 들어오기 전, 느리게 보여 주는 구간 길이(프레임). */
export const SLOW_FRAMES = 60;
/** 막판 배속. 너무 낮으면 "멈춤" 으로 읽힌다. */
export const SLOW_RATE = 0.6;
/** 1배에서 SLOW_RATE 로 내려가는 데 쓰는 프레임. */
const EASE_IN = 36;
/** 1등이 들어온 뒤 tailRate 까지 올라가는 데 쓰는 프레임(배속 차이에 비례). */
const EASE_OUT_PER_RATE = 28;
/** 1등이 들어온 뒤 더 보여 주는 프레임(약 0.7초). 들어오는 장면이 잘리지 않을 만큼만. */
export const HOLD_FRAMES = 40;

export interface Timing {
  /** at[f] = 프레임 f 가 화면에 나오는 시각(ms). 길이는 프레임 수와 같다. */
  at: Float64Array;
  playMs: number;
  /** 감속이 끝나 슬로 구간이 시작되는 프레임. */
  slowFrom: number;
}

/** a 에서 b 로, k(0~1) 만큼 코사인으로 잇는다. 양 끝에서 기울기가 0 이다. */
const ease = (a: number, b: number, k: number) =>
  a + ((b - a) * (1 - Math.cos(Math.PI * Math.min(1, Math.max(0, k))))) / 2;

export function rateAt(f: number, lead: number, slowFrom: number, tailRate: number): number {
  const easeFrom = slowFrom - EASE_IN;
  if (f < easeFrom) return 1;
  if (f < slowFrom) return ease(1, SLOW_RATE, (f - easeFrom) / EASE_IN);
  if (f < lead) return SLOW_RATE;
  return ease(SLOW_RATE, tailRate, (f - lead) / (EASE_OUT_PER_RATE * (tailRate - SLOW_RATE)));
}

function build(frames: number, lead: number, slowFrom: number, tailRate: number): Float64Array {
  const at = new Float64Array(Math.max(1, frames));
  for (let f = 1; f < at.length; f += 1) {
    // 프레임 f-1 → f 한 칸을 그 사이 배속으로 지나간다.
    at[f] = at[f - 1] + FRAME_MS / rateAt(f - 0.5, lead, slowFrom, tailRate);
  }
  return at;
}

export function timingFor(frameCount: number, winnerFrame: number): Timing {
  const lead = Math.max(1, Math.min(winnerFrame, frameCount - 1));
  // 아주 짧은 경기는 슬로·감속 구간도 비례해서 줄인다.
  const slow = Math.min(SLOW_FRAMES, Math.floor(lead * 0.25));
  const slowFrom = lead - slow;
  // 1등 뒤 HOLD_FRAMES 만 1배로 보여 주고 끝낸다. 나머지 구슬은 그 자리에 멈춘 채 남는다.
  const at = build(Math.min(frameCount, lead + HOLD_FRAMES + 1), lead, slowFrom, 1);
  return { at, playMs: at[at.length - 1], slowFrom };
}

/** 경과 시간(ms) → 소수 프레임 위치. 표를 이분 탐색하고 사이를 선형 보간한다. */
export function frameAtMs(timing: Timing, ms: number): number {
  const { at } = timing;
  if (ms <= 0) return 0;
  if (ms >= at[at.length - 1]) return at.length - 1;
  let lo = 0;
  let hi = at.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at[mid] <= ms) lo = mid;
    else hi = mid;
  }
  const span = at[hi] - at[lo];
  return lo + (span > 0 ? (ms - at[lo]) / span : 0);
}
