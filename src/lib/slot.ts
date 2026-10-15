/**
 * 슬롯 — 릴 세 개가 한 줄에 같은 가게를 맞추면 당첨. 한 판의 일정을 정한다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 릴이 언제 어디에 서는지만 정한다(판 번호 run 시드).
 * 어떤 장면이든 마지막에는 세 릴 모두 가운데 줄이 winnerIndex 다 — 장면은 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 장면(scene)
 *  - jackpot   첫째·둘째가 당첨 → 리치! 셋째가 슬로모션으로 기어와 맞는다(가끔 멈칫했다가).
 *  - creep     리치! 셋째가 한 칸 모자라게 서서 떨다가 한 칸 더 내려와 맞는다.
 *  - overshoot 리치! 셋째가 당첨에 서는 듯하다 한 칸 지나친다 → 아깝다 → "한 번 더 돌아요" 셋째만 다시 돌아 맞는다.
 *  - fakeReach 첫째·둘째가 다른 가게(X)로 리치! 셋째가 X 에서 한 칸 지나쳐 꽝 → 셋 다 다시 돌아 당첨으로 맞는다.
 *
 * 릴 위치 r 은 "지나간 칸 수" 다(실수, 늘어나기만 한다). 정수 r 이면 가운데 줄에 order[r mod count] 가 선다.
 * 릴마다 가게 순서(order)가 달라 진짜 슬롯처럼 이웃 칸이 릴마다 다르다. 순서는 후보 수마다 한 번 정한다.
 */
import { seededRandom } from './random';

export const REELS = 3;

export type SlotScene = 'jackpot' | 'creep' | 'overshoot' | 'fakeReach';
type Ease = 'linear' | 'in' | 'out' | 'inout' | 'tremble' | 'bump';

export interface ReelSeg {
  t0: number;
  t1: number;
  r0: number;
  r1: number;
  ease: Ease;
}

/**
 * 장면. 상태 줄·조명·효과가 이걸 따른다.
 * pull 레버 · spin 릴이 돈다 · stop 첫 릴이 섰다 · reach 두 릴이 같다 · teeter 셋째가 멈칫 · short 한 칸 모자람
 * · creep 한 칸 더 내려온다 · miss 한 칸 지나쳐 꽝 · respin 다시 돈다 · jackpot 세 줄.
 */
export type SlotBeat =
  'pull' | 'spin' | 'stop' | 'reach' | 'teeter' | 'short' | 'creep' | 'miss' | 'respin' | 'jackpot';

export interface SlotPlan {
  scene: SlotScene;
  /** 릴마다 가게 순서(후보 인덱스의 순열). */
  orders: number[][];
  segs: ReelSeg[][];
  /** round 0 은 첫 판, 1 은 다시 돌린 판. sym 은 그 장면의 가게(리치·첫 릴). */
  beats: { at: number; beat: SlotBeat; round: number; sym: number | null }[];
  /** 릴이 서는 순간(딸깍 소리·불빛). */
  stops: { at: number; reel: number; sym: number }[];
  /** 가짜 리치의 가게(fakeReach 만). */
  reach: number | null;
  /** 셋째 릴이 멈칫하고(지나치지 않고) 그대로 맞는지 — jackpot 의 변주. */
  teeter: boolean;
  landMs: number;
  endMs: number;
}

/** 장면 가중치(합 1). */
export const SCENE_WEIGHTS: [SlotScene, number][] = [
  ['jackpot', 0.24],
  ['creep', 0.22],
  ['overshoot', 0.24],
  ['fakeReach', 0.3],
];

/** 레버를 당기는 컷신 · 릴 속도(칸/ms) · 출발 가속 · 서는 순간 튕김 · 맞은 뒤 잭팟 조명. */
export const PULL_MS = 650;
const SPEED = 0.02;
const ACCEL_MS = 220;
const BUMP_MS = 160;
export const JACKPOT_HOLD_MS = 600;
/** 멈칫(지나치기 전) · 한 칸 미끄러짐 · 꽝을 읽는 틈 · 한 칸 모자라 떠는 시간 · 한 칸 더 내려오는 시간. */
const TEETER_MS = 280;
const SLIP_MS = 240;
const MISS_MS = 420;
const SHORT_MS = 620;
const CREEP_MS = 460;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 릴마다 가게 순서. 후보 수마다 한 번 정해져 판마다 같다 — 아까 본 이웃을 눈이 기억한다. */
export function reelOrders(count: number): number[][] {
  const rng = seededRandom(9001 + count);
  return Array.from({ length: REELS }, (_, k) => {
    const o = Array.from({ length: count }, (_, i) => i);
    // 첫 릴은 목록 순서 그대로. 나머지는 섞는다.
    if (k === 0) return o;
    for (let i = count - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    return o;
  });
}

/** 정수 위치 r 에서 가운데 줄에 선 가게. */
export function symbolAt(order: number[], r: number): number {
  return order[mod(Math.round(r), order.length)];
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

/**
 * r0 에서 tStart 에 출발해 tStop 에 order 의 sym 칸에 선다. 가속(in) → 등속 → 감속(out, 길이 decel).
 * 등속 속도는 SPEED 근처에서 목표 칸에 딱 서도록 맞춘다 — 세 구간이 속도가 이어지게(꺾임 없이) 풀었다.
 * offset 은 목표 칸에서 몇 칸 더/덜 갈지(지나침 −1 앞에 서기 등은 부르는 쪽이 정한다).
 */
function spinTo(
  r0: number,
  tStart: number,
  tStop: number,
  order: number[],
  sym: number,
  decel: number,
  offset = 0,
): { segs: ReelSeg[]; end: number } {
  const n = order.length;
  const residue = order.indexOf(sym) + offset;
  // 등속 v 로 가속 반·등속·감속 반을 가면: 거리 = v · (tStop − tStart − ACCEL/2 − decel/2).
  const span = tStop - tStart - ACCEL_MS / 2 - decel / 2;
  const want = r0 + SPEED * span;
  let end = Math.round(r0) + mod(residue - Math.round(r0), n);
  while (end < want - n / 2) end += n;
  // 너무 짧으면(느린 릴) 한 바퀴 더.
  while (end - r0 < 3) end += n;
  const v = (end - r0) / span;
  const a1 = r0 + (v * ACCEL_MS) / 2;
  const ts = tStop - decel;
  const b1 = a1 + v * (ts - tStart - ACCEL_MS);
  return {
    end,
    segs: [
      { t0: tStart, t1: tStart + ACCEL_MS, r0, r1: a1, ease: 'in' },
      { t0: tStart + ACCEL_MS, t1: ts, r0: a1, r1: b1, ease: 'linear' },
      { t0: ts, t1: tStop, r0: b1, r1: end, ease: 'out' },
    ],
  };
}

const bump = (t: number, r: number): ReelSeg => ({ t0: t, t1: t + BUMP_MS, r0: r, r1: r, ease: 'bump' });

/**
 * 한 판의 일정. starts 는 지금 릴 위치(앞 판이 선 자리) · totalMs 는 한 판 길이(SPIN_MS.slot).
 * 후보가 한 곳이거나 당첨이 범위 밖이면 null.
 */
export function slotPlan(
  count: number,
  winner: number,
  starts: number[],
  totalMs: number,
  rng: () => number = Math.random,
): SlotPlan | null {
  if (count < 2 || winner < 0 || winner >= count) return null;
  const orders = reelOrders(count);
  const scene = weighted(SCENE_WEIGHTS, rng);
  const landMs = totalMs - JACKPOT_HOLD_MS;
  const last = landMs - BUMP_MS;
  const segs: ReelSeg[][] = [[], [], []];
  const beats: SlotPlan['beats'] = [
    { at: 0, beat: 'pull', round: 0, sym: null },
    { at: PULL_MS, beat: 'spin', round: 0, sym: null },
  ];
  const stops: SlotPlan['stops'] = [];
  const pos = starts.map((r) => r);

  // 가짜 리치의 가게: 당첨이 아닌 아무 곳.
  const reach = scene === 'fakeReach' ? mod(winner + 1 + Math.floor(rng() * (count - 1)), count) : null;
  const first = reach ?? winner;
  const teeter = scene === 'jackpot' && rng() < 0.5;

  const s0 = 1500 + Math.round(rng() * 160);
  const s1 = s0 + 640 + Math.round(rng() * 160);

  /** 릴 k 를 tStart 에 출발시켜 tStop 에 sym(+offset) 에 세운다. */
  const go = (k: number, tStart: number, tStop: number, sym: number, decel: number, offset = 0) => {
    const { segs: s, end } = spinTo(pos[k], tStart, tStop, orders[k], sym, decel, offset);
    segs[k].push(...s);
    pos[k] = end;
    return end;
  };
  const stopAt = (k: number, at: number, withBump = true) => {
    stops.push({ at, reel: k, sym: symbolAt(orders[k], pos[k]) });
    if (withBump) segs[k].push(bump(at, pos[k]));
  };
  const hold = (k: number, t0: number, t1: number, ease: Ease = 'tremble') =>
    segs[k].push({ t0, t1, r0: pos[k], r1: pos[k], ease });
  const move = (k: number, t0: number, t1: number, by: number) => {
    segs[k].push({ t0, t1, r0: pos[k], r1: pos[k] + by, ease: 'inout' });
    pos[k] += by;
  };

  go(0, PULL_MS, s0, first, 520);
  stopAt(0, s0);
  beats.push({ at: s0, beat: 'stop', round: 0, sym: first });
  go(1, PULL_MS, s1, first, 600);
  stopAt(1, s1);
  beats.push({ at: s1, beat: 'reach', round: 0, sym: first });

  if (scene === 'jackpot') {
    if (teeter) {
      const s2 = last - TEETER_MS;
      go(2, PULL_MS, s2, winner, 1700);
      stopAt(2, s2, false);
      hold(2, s2, last);
      beats.push({ at: s2, beat: 'teeter', round: 0, sym: winner });
    } else go(2, PULL_MS, last, winner, 1900);
    stopAt(2, last);
  } else if (scene === 'creep') {
    // 한 칸 모자라게(위 칸에 당첨이 보이게) 섰다가 한 칸 더.
    const s2 = last - CREEP_MS - SHORT_MS;
    go(2, PULL_MS, s2, winner, 1500, -1);
    stopAt(2, s2, false);
    hold(2, s2, s2 + SHORT_MS);
    beats.push({ at: s2, beat: 'short', round: 0, sym: winner });
    move(2, s2 + SHORT_MS, last, 1);
    beats.push({ at: s2 + SHORT_MS, beat: 'creep', round: 0, sym: winner });
    stopAt(2, last);
  } else if (scene === 'overshoot') {
    const respinMs = 900;
    const s2 = last - respinMs - MISS_MS - SLIP_MS - TEETER_MS;
    go(2, PULL_MS, s2, winner, 1300);
    stopAt(2, s2, false);
    hold(2, s2, s2 + TEETER_MS);
    beats.push({ at: s2, beat: 'teeter', round: 0, sym: winner });
    move(2, s2 + TEETER_MS, s2 + TEETER_MS + SLIP_MS, 1);
    const missAt = s2 + TEETER_MS + SLIP_MS;
    stopAt(2, missAt);
    beats.push({ at: missAt, beat: 'miss', round: 0, sym: winner });
    const re = missAt + MISS_MS;
    beats.push({ at: re, beat: 'respin', round: 1, sym: winner });
    go(2, re, last, winner, 520);
    stopAt(2, last);
  } else {
    // 가짜 리치 — X 에서 한 칸 지나쳐 꽝, 셋 다 다시.
    const r0 = last - 500 - 720;
    const s2 = r0 - MISS_MS - SLIP_MS - TEETER_MS;
    go(2, PULL_MS, s2, first, 1100);
    stopAt(2, s2, false);
    hold(2, s2, s2 + TEETER_MS);
    beats.push({ at: s2, beat: 'teeter', round: 0, sym: first });
    move(2, s2 + TEETER_MS, s2 + TEETER_MS + SLIP_MS, 1);
    stopAt(2, s2 + TEETER_MS + SLIP_MS);
    beats.push({ at: s2 + TEETER_MS + SLIP_MS, beat: 'miss', round: 0, sym: first });
    beats.push({ at: r0, beat: 'respin', round: 1, sym: null });
    go(0, r0, last - 500, winner, 380);
    stopAt(0, last - 500);
    beats.push({ at: last - 500, beat: 'stop', round: 1, sym: winner });
    go(1, r0, last - 250, winner, 420);
    stopAt(1, last - 250);
    beats.push({ at: last - 250, beat: 'reach', round: 1, sym: winner });
    go(2, r0, last, winner, 460);
    stopAt(2, last);
  }
  beats.push({ at: landMs, beat: 'jackpot', round: beats.at(-1)!.round, sym: winner });
  for (const s of segs) s.sort((a, b) => a.t0 - b.t0);
  beats.sort((a, b) => a.at - b.at);
  stops.sort((a, b) => a.at - b.at);
  return { scene, orders, segs, beats, stops, reach, teeter, landMs, endMs: totalMs };
}

function ease(kind: Ease, u: number): number {
  switch (kind) {
    case 'linear':
    case 'tremble':
    case 'bump':
      return u;
    case 'in':
      return u * u;
    case 'out':
      return 1 - (1 - u) * (1 - u);
    case 'inout':
      return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
  }
}

/** t(ms) 의 릴 위치. 구간 사이 빈 시간은 앞 구간 끝에 머문다. */
export function reelAt(segs: ReelSeg[], t: number, start: number): number {
  if (segs.length === 0 || t <= segs[0].t0) return segs[0]?.r0 ?? start;
  let seg = segs[0];
  for (const g of segs) {
    if (g.t0 <= t) seg = g;
    else break;
  }
  if (t >= seg.t1) return seg.r1;
  const u = (t - seg.t0) / (seg.t1 - seg.t0);
  const v = seg.r0 + (seg.r1 - seg.r0) * ease(seg.ease, u);
  // 멈칫 — 칸 안에서 부들부들. 서는 순간 — 살짝 더 내려갔다 돌아온다(철컥). 끝점은 그대로다.
  if (seg.ease === 'tremble') return v + 0.06 * Math.sin(u * Math.PI * 9);
  if (seg.ease === 'bump') return v + 0.16 * Math.sin(u * Math.PI) * (1 - u);
  return v;
}

/** t 의 장면. */
export function slotBeatAt(plan: SlotPlan, t: number): SlotPlan['beats'][number] {
  let b = plan.beats[0];
  for (const x of plan.beats) if (x.at <= t) b = x;
  return b;
}
