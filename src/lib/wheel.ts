/**
 * 돌림판 한 판의 일정 — 원판 각도를 시각마다 정하는 구간 목록과 장면(beat) 목록.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 "어떻게 거기 멈추나" 만 정한다(판 번호 run 시드).
 * 어떤 결말이든 마지막 각도에서 바늘 밑 칸은 winnerIndex 다 — 결말은 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 한 판: 끼릭끼릭(원판을 뒤로 감는다) → 휘리릭(놓는다) → 점점 느려지며 칸마다 딸깍 → 결말.
 * 결말은 넷이다.
 *  - plain   그대로 당첨 칸에 멈춘다(긴 꼬리).
 *  - creep   이웃 칸 끝에 멈출 듯 떨다가 경계를 겨우 넘는다("한 칸 더…?").
 *  - nudge   이웃 칸에 멈춘 것처럼 서 있다가 툭 밀려 당첨 칸으로 넘어간다.
 *  - reverse 당첨 칸을 지나쳤다가 거꾸로 돌아온다("역회전!").
 *
 * 각도는 CSS rotate 와 같다(시계 방향 +). 바늘은 12시. 원판이 앞으로(+) 돌면 바늘 밑을 지나는 칸 번호는
 * 하나씩 줄어든다 — 당첨 칸 바로 앞에 오는 이웃은 winner + 1, 지나친 다음 칸은 winner − 1 이다.
 */

export type WheelEnding = 'plain' | 'creep' | 'nudge' | 'reverse';
type Ease = 'linear' | 'out' | 'inout' | 'snap' | 'tremble';

export interface WheelSeg {
  t0: number;
  t1: number;
  a0: number;
  a1: number;
  ease: Ease;
}

/**
 * 장면. 상태 줄·진행자 표정·효과가 이걸 따른다.
 * windup 끼릭끼릭 · launch 휘리릭 · slow 느려짐 · hold 멈칫(결말 직전) · move 결말 움직임 · landed 당첨.
 */
export type WheelBeat = 'windup' | 'launch' | 'slow' | 'hold' | 'move' | 'landed';

export interface WheelPlan {
  ending: WheelEnding;
  /** 끼릭 횟수(2~4). */
  clicks: number;
  segs: WheelSeg[];
  beats: { at: number; beat: WheelBeat }[];
  /** 결말에서 바늘 밑에 잠깐 걸리는 이웃 칸(plain 은 null). */
  tease: number | null;
  /** 마지막 각도. 바늘 밑 칸이 당첨이다. */
  final: number;
  /** 원판이 멈추는 시각 · 한 판 끝(onSpinEnd). */
  landMs: number;
  endMs: number;
}

/** 결말 가중치(합 1). 넷 다 판마다 고루 나온다. */
export const ENDING_WEIGHTS: [WheelEnding, number][] = [
  ['plain', 0.22],
  ['creep', 0.3],
  ['nudge', 0.22],
  ['reverse', 0.26],
];

/** 끼릭 한 번(뒤로 감기 + 쉼) · 한 번에 감는 각도 · 다 감고 숨 고르기. */
export const CLICK_MS = 190;
const CLICK_DEG = 7;
const WIND_HOLD_MS = 140;
/** 원판이 멈춘 뒤 당첨 조명·꽃가루를 보여 주는 시간. 이게 지나면 onSpinEnd. */
export const LAND_HOLD_MS = 380;
/** 최소 바퀴 수(휘리릭에서 멈출 때까지). */
const MIN_TURNS = 4;

/** 결말마다: 본 회전이 끝나고 멈칫하는 시간 · 결말 움직임 시간. */
const ENDING_MS: Record<Exclude<WheelEnding, 'plain'>, { hold: number; move: number }> = {
  creep: { hold: 700, move: 520 },
  nudge: { hold: 820, move: 460 },
  reverse: { hold: 380, move: 860 },
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 각도 angle 에서 12시 바늘 밑에 있는 칸 번호. */
export function sliceAt(angle: number, count: number): number {
  if (count <= 0) return 0;
  const slice = 360 / count;
  return Math.min(count - 1, Math.floor(mod(-angle, 360) / slice));
}

/** 바늘 밑 지점이 그 칸 안 어디쯤인가(0~1). 0·1 이 칸 경계(못)다. */
export function sliceFrac(angle: number, count: number): number {
  if (count <= 0) return 0.5;
  const slice = 360 / count;
  return mod(-angle, slice) / slice;
}

function weighted<T>(items: [T, number][], rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

const between = (rng: () => number, a: number, b: number) => a + rng() * (b - a);

/**
 * 한 판의 일정. start 는 지금 원판 각도(앞 판이 멈춘 자리)다 — 판마다 거기서 이어 돈다.
 * totalMs 는 한 판 길이(SPIN_MS.wheel). 후보가 한 곳이거나 당첨이 범위 밖이면 null.
 */
export function wheelPlan(
  count: number,
  winner: number,
  start: number,
  totalMs: number,
  rng: () => number = Math.random,
): WheelPlan | null {
  if (count < 2 || winner < 0 || winner >= count) return null;
  const s = 360 / count;
  const ending = weighted(ENDING_WEIGHTS, rng);
  const clicks = 2 + Math.min(2, Math.floor(rng() * 3));

  // 당첨 칸 가운데가 바늘 밑에 오는 각도 중, 충분히 돈 첫 각도.
  const center = mod(360 - (winner * s + s / 2), 360);
  const base = start + MIN_TURNS * 360;
  const F = base + mod(center - base, 360);

  const segs: WheelSeg[] = [];
  const beats: WheelPlan['beats'] = [{ at: 0, beat: 'windup' }];
  let a = start;
  for (let k = 0; k < clicks; k += 1) {
    const t0 = k * CLICK_MS;
    segs.push({ t0, t1: t0 + CLICK_MS * 0.5, a0: a, a1: a - CLICK_DEG, ease: 'out' });
    a -= CLICK_DEG;
  }
  const launch = clicks * CLICK_MS + WIND_HOLD_MS;
  beats.push({ at: launch, beat: 'launch' });
  const landMs = totalMs - LAND_HOLD_MS;

  // 결말 직전 멈칫하는 각도 · 결말 움직임.
  let pause: number;
  let tease: number | null = null;
  const tail: WheelSeg[] = [];
  let mainEnd = landMs;
  if (ending === 'plain') {
    pause = F + between(rng, -0.28, 0.28) * s;
  } else {
    const { hold, move } = ENDING_MS[ending];
    mainEnd = landMs - hold - move;
    const holdEnd = mainEnd + hold;
    if (ending === 'creep') {
      // 이웃(winner+1) 칸 끝, 경계 바로 앞에서 떨다가 겨우 넘어간다.
      pause = F - s / 2 - between(rng, 0.05, 0.12) * s;
      tease = mod(winner + 1, count);
      tail.push({ t0: mainEnd, t1: holdEnd, a0: pause, a1: pause, ease: 'tremble' });
      tail.push({ t0: holdEnd, t1: landMs, a0: pause, a1: F - s / 2 + between(rng, 0.14, 0.26) * s, ease: 'inout' });
    } else if (ending === 'nudge') {
      // 이웃 칸 한복판쯤에 멈춘 것처럼 서 있다가 툭.
      pause = F - s / 2 - between(rng, 0.3, 0.42) * s;
      tease = mod(winner + 1, count);
      tail.push({ t0: mainEnd, t1: holdEnd, a0: pause, a1: pause, ease: 'tremble' });
      tail.push({ t0: holdEnd, t1: landMs, a0: pause, a1: F + between(rng, -0.22, 0.05) * s, ease: 'snap' });
    } else {
      // 당첨 칸을 지나 다음 칸(winner-1)까지 갔다가 거꾸로 돌아온다. 돌아오며 가운데를 살짝 넘었다 선다.
      pause = F + s / 2 + between(rng, 0.16, 0.34) * s;
      tease = mod(winner - 1, count);
      const back = F - between(rng, 0.1, 0.2) * s;
      const mid = holdEnd + Math.round(move * 0.7);
      tail.push({ t0: mainEnd, t1: holdEnd, a0: pause, a1: pause, ease: 'tremble' });
      tail.push({ t0: holdEnd, t1: mid, a0: pause, a1: back, ease: 'inout' });
      tail.push({ t0: mid, t1: landMs, a0: back, a1: F + between(rng, -0.08, 0.08) * s, ease: 'inout' });
    }
    beats.push({ at: mainEnd, beat: 'hold' }, { at: holdEnd, beat: 'move' });
  }
  segs.push({ t0: launch, t1: mainEnd, a0: a, a1: pause, ease: 'out' });
  segs.push(...tail);
  beats.splice(2, 0, { at: launch + Math.round((mainEnd - launch) * 0.42), beat: 'slow' });
  beats.push({ at: landMs, beat: 'landed' });
  const final = segs[segs.length - 1].a1;
  return { ending, clicks, segs, beats, tease, final, landMs, endMs: totalMs };
}

function ease(kind: Ease, u: number): number {
  switch (kind) {
    case 'linear':
    case 'tremble':
      return u;
    case 'out':
      // 4차 감속 — 꼬리가 길어 마지막 몇 칸을 한 칸씩 기어간다.
      return 1 - (1 - u) ** 4;
    case 'inout':
      return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    case 'snap':
      // 툭 — 빨리 밀렸다가 천천히 선다.
      return 1 - (1 - u) ** 3;
  }
}

/** t(ms) 의 원판 각도. 구간 사이 빈 시간은 앞 구간 끝 각도에 머문다. */
export function wheelAngleAt(plan: WheelPlan, t: number): number {
  const { segs } = plan;
  if (t <= segs[0].t0) return segs[0].a0;
  let seg = segs[0];
  for (const g of segs) {
    if (g.t0 <= t) seg = g;
    else break;
  }
  if (t >= seg.t1) return seg.a1;
  const u = (t - seg.t0) / (seg.t1 - seg.t0);
  const v = seg.a0 + (seg.a1 - seg.a0) * ease(seg.ease, u);
  // 멈칫 — 경계 앞에서 부들부들. 끝점은 그대로다(sin 이 0).
  if (seg.ease === 'tremble') return v + 0.7 * Math.sin(u * Math.PI * 10) * Math.min(1, (1 - u) * 3);
  return v;
}

/** t 의 장면. */
export function wheelBeatAt(plan: WheelPlan, t: number): WheelBeat {
  let b: WheelBeat = 'windup';
  for (const x of plan.beats) if (x.at <= t) b = x.beat;
  return b;
}
