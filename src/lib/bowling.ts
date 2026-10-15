/**
 * 볼링 — 레인 끝에 가게 이름표를 단 핀들이 삼각형으로 서 있고, 공을 2~3번 굴린다.
 * 끝까지 서 있는 핀 하나가 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 물리 계산을 하지 않는다 — "당첨 핀만 남는다" 는
 * 끝 장면을 먼저 정하고, 판마다 어느 핀이 언제 어떻게 쓰러질지를 각본으로 짠다(판 번호 rng).
 * 어느 사건도 당첨 핀을 쓰러뜨리지 않는다. 당첨 핀은 휘청일 수는 있어도(버틸까?) 언제나 버틴다.
 *
 * 좌표는 레인 폭 = 100 단위(화면에선 cqw)다. y 는 위(핀 뒤 피트)에서 아래(파울 라인·볼러)로 커진다.
 * 화면 상자는 폭 100 · 높이 view 단위를 보여 주고, 세계(레인 전체)는 길이 length 단위다 —
 * 카메라가 볼러에서 핀까지 공을 따라 올라간다(frameAt 의 cam).
 *
 * 약속(bowling.test.ts 가 본다)
 *  - 후보 2~20곳 어떤 판이든 끝 장면엔 당첨 핀만 서 있고 나머지는 모두 쓰러졌다.
 *  - 당첨 핀은 어느 순간에도 쓰러지지 않는다.
 *  - 마지막 공 전에 당첨 말고도 선 핀이 적어도 하나 있다(마지막 공이 할 일이 있다).
 *  - 전체 길이 MAX_END_MS(7.2초) 안.
 */

import { seededRandom } from './random';

export interface Pt {
  x: number;
  y: number;
}

/* ───────── 레인 배치 ───────── */

/** 레인 나무판(공이 구르는 곳) 좌우 끝. 그 바깥이 거터, 더 바깥이 옆벽(킥백). */
export const LANE_X0 = 8.5;
export const LANE_X1 = 91.5;
export const GUTTER_L = 5.75;
export const GUTTER_R = 94.25;
/** 핀 키 · 폭, 공 반지름(단위). */
export const PIN_H = 9;
export const PIN_W = 3.6;
export const BALL_R = 3.2;
/** 핀 줄 사이(앞뒤). 이름표(약 4.7) + 핀(9) 이 들어가고 조금 남는다. */
export const ROW_GAP = 15;
/** 맨 뒷줄 핀 바닥. 그 위로 이름표·핀 머리가 올라간다. */
const BACK_Y = 23;
/** 맨 앞 핀 앞으로 화면에 보이는 레인. */
const FRONT_U = 40;
/** 화면 아래 끝에서 파울 라인까지 더 이어지는 레인 — 카메라가 따라가는 길이. */
const RUNWAY_U = 120;

export interface DeckPin extends Pt {
  /** 앞(헤드 핀)에서 0 부터. */
  row: number;
}

export interface DeckLayout {
  count: number;
  /** 줄마다 핀 수(앞줄부터). */
  rows: number[];
  pins: DeckPin[];
  /** 한 줄 안 핀 사이(단위). 이름표 폭이 이것을 넘지 않는다. */
  spacing: number;
  /** 화면 상자 높이(단위) — 폭 ÷ 높이 = 100 / view. */
  view: number;
  /** 레인 전체 길이(단위). */
  length: number;
  headY: number;
  backY: number;
  /** 핀 뒤 피트(공·쓰러진 핀이 빠지는 곳) 아래 끝. */
  pitY: number;
  foulY: number;
  /** 볼러가 서는 곳. */
  bowlerY: number;
  /** 레인 위 화살표(겨냥점) 줄. */
  arrowsY: number;
}

/** 줄마다 핀 수. 15곳이면 1-2-3-4-5 삼각형, 모자라면 마지막 줄이 덜 찬다. 두 곳은 나란히. */
export function deckRows(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 2) return [count];
  const rows: number[] = [];
  let left = count;
  for (let k = 1; left > 0; k += 1) {
    const take = Math.min(k, left);
    rows.push(take);
    left -= take;
  }
  return rows;
}

/** 핀 자리. 후보 순서대로 헤드 핀부터 앞줄 → 뒷줄, 줄 안에선 왼쪽부터. */
export function deckLayout(count: number): DeckLayout {
  const rows = deckRows(Math.max(1, count));
  const maxRow = Math.max(...rows);
  const spacing = Math.min(80 / maxRow, 24);
  const backY = BACK_Y;
  const headY = backY + (rows.length - 1) * ROW_GAP;
  const pins: DeckPin[] = [];
  rows.forEach((m, r) => {
    for (let j = 0; j < m; j += 1) pins.push({ x: 50 + (j - (m - 1) / 2) * spacing, y: headY - r * ROW_GAP, row: r });
  });
  const view = headY + FRONT_U;
  const length = view + RUNWAY_U;
  const foulY = length - 30;
  return {
    count,
    rows,
    pins: pins.slice(0, Math.max(0, count)),
    spacing,
    view,
    length,
    headY,
    backY,
    pitY: backY - 11,
    foulY,
    bowlerY: length - 13,
    arrowsY: foulY - 44,
  };
}

/**
 * 이름표 글자 수 — 줄 안 핀 사이에 들어갈 만큼. 상자 폭 360px(크게 보기 640px), 굵은 11px(13px) 한글
 * 한 자 ≈ 글자 크기, 테두리·여백 8px. 15곳(줄에 5개)이면 휴대폰에서 4자다.
 */
export function bowlingNameMax(layout: DeckLayout, expanded = false): number {
  const px = expanded ? 6.4 : 3.6;
  const font = expanded ? 13 : 11;
  const n = Math.floor((layout.spacing * px * 0.94 - 8) / font);
  return Math.max(3, Math.min(expanded ? 10 : 8, n));
}

/* ───────── 각본 ───────── */

/**
 * 공 한 번의 종류.
 * gutter 거터(하나도 못 쓰러뜨림) · brush 핀을 스치고 지나감(휘청…) · hit 몇 개 쓰러뜨림
 * · split 가운데만 쓰러져 양쪽 끝이 남음 · strike 와르르(당첨과 하나만 남거나, 마지막이면 당첨만).
 */
export type RollKind = 'gutter' | 'brush' | 'hit' | 'split' | 'strike';

/** 공이 지나는 길 한 토막(2차 베지어). */
export interface BallSeg {
  t0: number;
  t1: number;
  a: Pt;
  c: Pt;
  b: Pt;
  /** lin 고르게 · slow 끝에서 느려짐(마지막 공 슬로모션) · out 멈추듯 줄어듦. */
  ease: 'lin' | 'slow' | 'out';
}

export interface Roll {
  index: number;
  final: boolean;
  kind: RollKind;
  /** 이 공 시작(카메라가 볼러로 내려가기 시작) · 공을 놓음 · 첫 핀에 닿음(거터는 피트에 빠짐). */
  t0: number;
  /** 카메라가 볼러 앞에 내려온 때(마지막 공은 컷신 뒤에서). */
  panEnd: number;
  release: number;
  impact: number;
  /** 다 쓰러지고 멈춘 때. */
  settle: number;
  /** 쓰러진 핀을 치우는 바(마지막 공·아무것도 안 쓰러진 공은 없다). */
  sweep: { t0: number; t1: number } | null;
  end: number;
  /** 공을 놓는 자리(볼러 손). */
  start: Pt;
  segs: BallSeg[];
  /** 이번 공에 쓰러진 핀. */
  knocked: number[];
  /** 공이 끝내 지나간 줄(x). */
  lineX: number;
  /** 당첨을 노리는 척하다 휘어 나감(마지막 공). */
  swerve: boolean;
}

/** 쓰러짐 — path 를 따라 미끄러지며 rot(도, 시계 방향)까지 눕는다. flyer 는 옆벽을 맞고 돌아온 핀. */
export interface Fall {
  roll: number;
  t0: number;
  dur: number;
  path: Pt[];
  rot: number;
  flyer: boolean;
}

/** 휘청 — amp(도)로 흔들린다. falls 면 끝에 쓰러진다(Fall 이 t1 에 시작). */
export interface Wobble {
  t0: number;
  t1: number;
  amp: number;
  falls: boolean;
}

export interface PinFate {
  fall: Fall | null;
  wobbles: Wobble[];
  /** 치우는 바에 밀려 사라지는 때. */
  sweep: { t0: number; t1: number } | null;
}

export type BowlEventKind =
  | 'pan'
  | 'cut'
  | 'windup'
  | 'roll'
  | 'hook'
  | 'swerve'
  | 'slow'
  | 'gutter'
  | 'gutterEnd'
  | 'brush'
  | 'hit'
  | 'strike'
  | 'split'
  | 'kick'
  | 'teeter'
  | 'duel'
  | 'sweep'
  | 'final';

export interface BowlEvent {
  t: number;
  kind: BowlEventKind;
  roll: number;
  /** 이 장면이 끝나는 때(teeter·duel·sweep). */
  until?: number;
  /** 휘청이는 핀(teeter) · 끝내 쓰러지는 미끼(duel) · 스친 핀(brush). */
  pin?: number;
  /** teeter: 끝에 쓰러지는가. */
  falls?: boolean;
  /** 이번 공에 쓰러진 수(hit·strike·split) · 남은 핀 수(sweep). */
  count?: number;
  /** 옆벽을 맞은 자리(kick). */
  at?: Pt;
}

export interface BowlingPlan {
  count: number;
  winner: number;
  layout: DeckLayout;
  rolls: Roll[];
  fates: PinFate[];
  events: BowlEvent[];
  /** 당첨 핀이 빛나기 시작(끝까지 버텼어요!). */
  finalMs: number;
  /** 꽃가루까지 끝 — 여기서 onSpinEnd. */
  endMs: number;
}

/* 시간(ms) */
const PAN_MS = 220;
const WINDUP_MS = [300, 260] as const;
/** 마지막 공 컷신(볼러 백스윙 — 휙~). 카메라는 그 뒤에서 볼러로 내려간다. */
export const CUT_MS = 800;
const TRAVEL_MS = 760;
const GUTTER_TRAVEL_MS = 840;
const FINAL_TRAVEL_MS = 1000;
const EXIT_MS = 460;
const FALL_MS = 300;
const STRIKE_FALL_MS = 380;
const TEETER_MS = 680;
const DUEL_MS = 820;
const WIN_WOBBLE_MS = 620;
const KICK_LEG_MS = 190;
const HOLD_MS = 200;
const SWEEP_MS = 380;
const SWEEP_GAP_MS = 60;
const FANFARE_MS = 700;
/** 판 전체 길이 상한. 넘는 각본은 덧붙인 사건을 덜어 다시 짠다. */
export const MAX_END_MS = 7200;

/* 사건 확률 */
const THREE_ROLLS = 0.42;
/** 두 번 굴리는 판(3곳 이상)의 첫 공. */
const FIRST_KIND: [RollKind, number][] = [
  ['hit', 0.44],
  ['split', 0.18],
  ['strike', 0.2],
  ['gutter', 0.18],
];
/** 세 번 굴리는 판의 둘째 공(첫 공은 거터 아니면 몇 개). */
const SECOND_KIND: [RollKind, number][] = [
  ['hit', 0.36],
  ['split', 0.32],
  ['strike', 0.32],
];
/** 마지막 공: 깔끔히 · 미끼가 휘청이다 쓰러짐 · 당첨과 미끼가 같이 휘청(누가 버틸까) · 옆벽 맞고 돌아온 핀. */
type FinalKind = 'clean' | 'teeter' | 'duel' | 'kick';
const FINAL_KIND: [FinalKind, number][] = [
  ['clean', 0.22],
  ['teeter', 0.27],
  ['duel', 0.27],
  ['kick', 0.24],
];
const TEETER_FALL_CHANCE = 0.35;
const TEETER_STAY_CHANCE = 0.3;
const KICK_CHANCE = 0.3;
const WIN_WOBBLE_CHANCE = 0.3;
const SWERVE_CHANCE = 0.4;

/* ───────── 작은 도구 ───────── */

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const smooth = (u: number) => {
  const t = clamp(u, 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (u: number) => 1 - (1 - clamp(u, 0, 1)) ** 2;

function weighted<T>(items: [T, number][], rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

export function bezier(seg: { a: Pt; c: Pt; b: Pt }, s: number): Pt {
  const u = 1 - s;
  return {
    x: u * u * seg.a.x + 2 * u * s * seg.c.x + s * s * seg.b.x,
    y: u * u * seg.a.y + 2 * u * s * seg.c.y + s * s * seg.b.y,
  };
}

function segEase(kind: BallSeg['ease'], u: number): number {
  const t = clamp(u, 0, 1);
  if (kind === 'out') return 1 - (1 - t) ** 2;
  // 앞은 빠르게, 핀 앞에선 반쯤 느려진다 — 끝에서도 멈추진 않는다(핀을 쳐야 하니까).
  if (kind === 'slow') return 0.55 * (1 - (1 - t) ** 2) + 0.45 * t;
  return t;
}

/** 꺾은선 위 자리 — 토막마다 같은 시간. */
function along(path: Pt[], e: number): Pt {
  if (path.length === 1) return path[0];
  const k = clamp(e, 0, 1) * (path.length - 1);
  const i = Math.min(path.length - 2, Math.floor(k));
  const u = k - i;
  return { x: lerp(path[i].x, path[i + 1].x, u), y: lerp(path[i].y, path[i + 1].y, u) };
}

/* ───────── 각본 짜기 ───────── */

/**
 * 볼링 각본. 같은 rng 면 같은 판이다.
 *
 * 1) 굴리는 수: 두 곳이면 2번, 그 밖엔 THREE_ROLLS 로 3번(첫 공은 거터 아니면 몇 개).
 * 2) 마지막 공 전 공들은 당첨이 아닌 핀만 쓰러뜨리고, 마지막 공 몫으로 적어도 하나 남긴다.
 * 3) 마지막 공은 남은 미끼를 모두 쓰러뜨린다 — 깔끔히 · 휘청이다(버틸까?) · 당첨과 같이 휘청 · 옆벽 맞고 돌아온 핀.
 * 4) 덧붙인 사건(휘청·킥백·당첨 휘청)으로 MAX_END_MS 를 넘으면 하나씩 덜고 다시 짠다.
 * 5) 한 곳뿐이면 null — 굴릴 것 없이 그 핀이 빛난다.
 */
export function bowlingPlan(count: number, winnerIndex: number, rng: () => number = Math.random): BowlingPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const seed = Math.floor(rng() * 4294967296);
  let plan: BowlingPlan | null = null;
  for (let level = 0; level <= 5; level += 1) {
    plan = build(count, winnerIndex, seed, level);
    if (plan.endMs <= MAX_END_MS) return plan;
  }
  return plan;
}

/** level 이 오를수록 덧붙인 사건을 덜어 낸다(뽑는 난수는 그대로 써서 나머지 각본은 같다). */
function build(count: number, winner: number, seed: number, level: number): BowlingPlan {
  // 같은 seed 면 같은 수열 — 각본을 덜어 다시 짜도 나머지 선택은 같다.
  const r = seededRandom(seed);
  const rand = (a: number, b: number) => a + r() * (b - a);
  const layout = deckLayout(count);
  const P = layout.pins;
  const W = P[winner];
  const s = layout.spacing;
  const fates: PinFate[] = P.map(() => ({ fall: null, wobbles: [], sweep: null }));
  const events: BowlEvent[] = [];
  const rolls: Roll[] = [];
  const up = new Set<number>(P.map((_, i) => i));
  const standingOthers = () => [...up].filter((i) => i !== winner).sort((a, b) => a - b);

  let nRolls = count === 2 ? 2 : r() < THREE_ROLLS ? 3 : 2;
  if (level >= 4) nRolls = 2;
  // 세 번 굴리는 판은 전체를 조금 빠르게 — 7.2초 안에 휘청·킥백이 들어갈 틈을 남긴다.
  const pace = nRolls === 3 ? 0.84 : 1;
  const ms = (v: number) => Math.round(v * pace);

  // 공마다 쓸 선택을 먼저 뽑는다.
  const kinds: RollKind[] = [];
  if (count === 2) kinds.push(r() < 0.5 ? 'gutter' : 'brush');
  else if (nRolls === 3) kinds.push(r() < 0.55 ? 'gutter' : 'hit', weighted(SECOND_KIND, r));
  else kinds.push(weighted(FIRST_KIND, r));
  const finalKind = weighted(FINAL_KIND, r);
  const extra = {
    teeterFall: r() < TEETER_FALL_CHANCE && level < 2,
    teeterStay: r() < TEETER_STAY_CHANCE && level < 1,
    kick: r() < KICK_CHANCE && level < 1,
    winWobble: r() < WIN_WOBBLE_CHANCE && level < 3,
    swerve: r() < SWERVE_CHANCE,
  };

  let t = 0;
  for (let k = 0; k < nRolls; k += 1) {
    const final = k === nRolls - 1;
    const nonFinalLeft = nRolls - 1 - k - 1; // 이 공 뒤에 남은 마지막 아닌 공 수
    let kind: RollKind = final ? 'hit' : kinds[k];
    let so = standingOthers();

    /* 이번 공이 공으로 쓰러뜨릴 핀(ballKnock)과 남길 미끼(decoy) */
    let ballKnock: number[] = [];
    let bx = 50;
    let decoy = -1;
    const nearestTo = (x: number, pool: number[]) =>
      [...pool].sort((a, b) => Math.abs(P[a].x - x) - Math.abs(P[b].x - x) || P[b].y - P[a].y || a - b);

    if (!final && kind === 'strike' && (so.length < 3 || nonFinalLeft > 0)) kind = 'hit';
    if (!final && kind === 'split') {
      const far = [...so].sort((a, b) => Math.abs(P[b].x - W.x) - Math.abs(P[a].x - W.x) || P[a].y - P[b].y);
      if (so.length < 2 || nonFinalLeft > 0 || Math.abs(P[far[0]].x - W.x) < s * 1.4)
        kind = so.length >= 3 && nonFinalLeft === 0 ? 'strike' : 'hit';
      else decoy = far[0];
    }

    if (final) {
      ballKnock = so;
      const xs = so.map((i) => P[i].x);
      const oneSide = xs.every((x) => x > W.x) || xs.every((x) => x < W.x);
      const front = [...so].sort((a, b) => P[b].y - P[a].y || Math.abs(P[a].x - 50) - Math.abs(P[b].x - 50))[0];
      bx = oneSide ? xs.reduce((p, x) => p + x, 0) / xs.length : P[front].x + rand(-0.2, 0.2) * s;
      if (ballKnock.length >= 4) kind = 'strike';
    } else if (kind === 'hit') {
      const leave = nonFinalLeft + 1;
      const kCount = clamp(Math.round(so.length * rand(0.35, 0.65)), 1, so.length - leave);
      if (kCount < 1 || so.length - leave < 1) kind = 'gutter';
      else {
        const aim = so[Math.min(so.length - 1, Math.floor(r() * so.length))];
        bx = P[aim].x + rand(-0.25, 0.25) * s;
        ballKnock = nearestTo(bx, so).slice(0, kCount);
      }
    } else if (kind === 'split') {
      ballKnock = so.filter((i) => i !== decoy);
      const front = [...ballKnock].sort((a, b) => P[b].y - P[a].y)[0];
      bx = P[front].x + rand(-0.15, 0.15) * s;
    } else if (kind === 'strike') {
      decoy = so[Math.min(so.length - 1, Math.floor(r() * so.length))];
      ballKnock = so.filter((i) => i !== decoy);
      bx = P[0].x + (r() < 0.5 ? -1 : 1) * s * 0.3;
    } else if (kind === 'brush') {
      decoy = so[Math.min(so.length - 1, Math.floor(r() * so.length))];
      const away = Math.sign(P[decoy].x - W.x) || 1;
      bx = P[decoy].x + away * s * 0.42;
    }

    // 공 길이 당첨 핀을 꿰뚫지 않게 — 너무 가까우면 옆으로 비켜 지나가며 스친다(당첨 휘청).
    const side = r() < 0.5 ? -1 : 1;
    let grazed = false;
    if (kind !== 'gutter') {
      const gap = BALL_R + PIN_W / 2 + 0.6;
      if (Math.abs(W.x - bx) < gap) bx = W.x + (Math.sign(bx - W.x) || side) * gap;
      bx = clamp(bx, LANE_X0 + BALL_R, LANE_X1 - BALL_R);
      const firstY = ballKnock.length
        ? Math.max(...ballKnock.map((i) => P[i].y))
        : decoy >= 0
          ? P[decoy].y
          : layout.headY;
      grazed = Math.abs(W.x - bx) < gap + 2.2 && W.y >= firstY - ROW_GAP * 0.5;
    }

    /* 시각 */
    const t0 = t;
    const panEnd = final ? t0 + ms(CUT_MS * 0.45) : t0 + ms(PAN_MS);
    const release = final ? t0 + ms(CUT_MS) : panEnd + ms(WINDUP_MS[k > 0 ? 1 : 0]);
    const travel = ms(kind === 'gutter' ? GUTTER_TRAVEL_MS : final ? FINAL_TRAVEL_MS : TRAVEL_MS);
    const impact = release + travel;
    const start: Pt = { x: 50 + side * rand(6, 14), y: layout.foulY };

    /* 공 길 */
    const segs: BallSeg[] = [];
    let swerve = false;
    let lineX = bx;
    if (kind === 'gutter') {
      const gx = r() < 0.5 ? GUTTER_L : GUTTER_R;
      const g: Pt = { x: gx, y: start.y - (start.y - layout.headY) * rand(0.42, 0.58) };
      const c: Pt = { x: lerp(start.x, gx, 0.35), y: lerp(start.y, g.y, 0.55) };
      const tg = release + Math.round(travel * 0.55);
      segs.push({ t0: release, t1: tg, a: start, c, b: g, ease: 'lin' });
      const end: Pt = { x: gx, y: layout.pitY - 6 };
      segs.push({ t0: tg, t1: impact, a: g, c: { x: gx, y: (g.y + end.y) / 2 }, b: end, ease: 'lin' });
      lineX = gx;
      events.push({ t: tg, kind: 'gutter', roll: k });
    } else {
      const firstY = ballKnock.length ? Math.max(...ballKnock.map((i) => P[i].y)) : P[decoy].y;
      const b: Pt = { x: bx, y: firstY + 2 };
      // 훅: 바깥으로 흘렀다가 안으로 휘어 들어온다. 마지막 공은 당첨 쪽을 노리는 척하다 휘기도 한다.
      swerve = final && extra.swerve && Math.abs(W.x - bx) > s * 0.9;
      const cx = swerve ? clamp(start.x + (W.x - start.x) * 1.7, 12, 88) : clamp(start.x + side * rand(8, 18), 12, 88);
      const c: Pt = { x: cx, y: lerp(start.y, b.y, 0.6) };
      segs.push({ t0: release, t1: impact, a: start, c, b, ease: final ? 'slow' : 'lin' });
      const dev = (Math.sign(bx - W.x) || side) * rand(2, 6);
      const exit: Pt = { x: clamp(bx + dev, LANE_X0 + 2, LANE_X1 - 2), y: layout.pitY - 6 };
      segs.push({
        t0: impact,
        t1: impact + ms(EXIT_MS),
        a: b,
        c: { x: lerp(b.x, exit.x, 0.3), y: (b.y + exit.y) / 2 },
        b: exit,
        ease: 'out',
      });
      if (swerve) events.push({ t: release + Math.round(travel * 0.3), kind: 'swerve', roll: k });
      else if (Math.abs(cx - start.x) > 6)
        events.push({ t: release + Math.round(travel * 0.42), kind: 'hook', roll: k });
      if (final) events.push({ t: release + Math.round(travel * 0.66), kind: 'slow', roll: k });
    }
    events.push(final ? { t: t0, kind: 'cut', roll: k } : { t: t0, kind: 'pan', roll: k });
    if (!final) events.push({ t: panEnd, kind: 'windup', roll: k });
    events.push({ t: release, kind: 'roll', roll: k });

    /* 쓰러짐 */
    const strong = kind === 'strike';
    const firstY = ballKnock.length ? Math.max(...ballKnock.map((i) => P[i].y)) : 0;
    const delayOf = (i: number) =>
      Math.round(
        clamp(((firstY - P[i].y) / ROW_GAP) * 60 + (Math.abs(P[i].x - bx) / s) * 30, 0, 320) * (strong ? 0.75 : 1),
      );

    /** 쓰러뜨린다. 당첨 핀 쪽으로 눕지 않게 — 두 방향 중 당첨에서 먼 쪽. */
    const fallOf = (i: number, at: number, hint: number, dur = strong ? STRIKE_FALL_MS : FALL_MS) => {
      const p = P[i];
      let sd = Math.sign(p.x - bx) || hint;
      const dx = strong ? rand(4, 11) : rand(2.5, 6);
      const dy = strong ? rand(3, 12) : rand(1.5, 6);
      const endOf = (d: number): Pt => ({
        x: clamp(p.x + d * dx, LANE_X0 + 4, LANE_X1 - 4),
        y: Math.max(layout.pitY - 2, p.y - dy),
      });
      const clearance = (q: Pt) => Math.hypot((q.x - W.x) / 1.6, q.y - W.y);
      if (clearance(endOf(sd)) < 6 && clearance(endOf(-sd)) > clearance(endOf(sd))) sd = -sd;
      const spin = strong && r() < 0.5 ? 180 : 0;
      fates[i].fall = {
        roll: k,
        t0: at,
        dur,
        path: [{ x: p.x, y: p.y }, endOf(sd)],
        rot: sd * (rand(76, 102) + spin),
        flyer: false,
      };
    };

    // 킥백: 공에 맞은 핀 하나가 옆벽을 맞고 돌아와 바깥쪽 핀을 쓰러뜨린다.
    let kick: { flyer: number; target: number; sgn: number } | null = null;
    const wantKick =
      (final ? finalKind === 'kick' && level < 3 : extra.kick && (kind === 'hit' || kind === 'strike')) &&
      ballKnock.length >= 2;
    if (wantKick) {
      for (const sgn of side > 0 ? [1, -1] : [-1, 1]) {
        const out = ballKnock.filter((i) => sgn * (P[i].x - bx) > s * 0.4);
        if (out.length < 1) continue;
        const target = out.sort((a, b) => sgn * (P[b].x - P[a].x) || P[a].y - P[b].y)[0];
        const flyers = ballKnock.filter((i) => i !== target && sgn * (P[target].x - P[i].x) > 0.5);
        if (!flyers.length) continue;
        const flyer = flyers.sort((a, b) => delayOf(a) - delayOf(b))[0];
        kick = { flyer, target, sgn };
        break;
      }
    }

    // 휘청이다 쓰러지는 미끼(마지막 공의 teeter·duel, 마지막 아닌 공의 teeterFall).
    let teeterPin = -1;
    // 마지막 공에 미끼가 하나뿐이면 깔끔히 쓰러뜨리면 싱겁다 — 휘청이다 쓰러지게(버틸까?) 한다.
    const lone = final && ballKnock.length === 1 && (finalKind === 'clean' || finalKind === 'kick');
    const wantTeeter = final
      ? (finalKind === 'teeter' || finalKind === 'duel' || lone) && level < 5
      : extra.teeterFall && ballKnock.length >= 2;
    if (wantTeeter && ballKnock.length >= 1) {
      const pool = ballKnock.filter((i) => !kick || (i !== kick.flyer && i !== kick.target));
      if (pool.length) teeterPin = [...pool].sort((a, b) => delayOf(b) - delayOf(a) || a - b)[0];
    }
    const duel = final && finalKind === 'duel' && teeterPin >= 0 && level < 5;

    let lastT = impact + ms(EXIT_MS);
    for (const i of ballKnock) {
      if (kick && i === kick.target) continue;
      // 휘청이는 핀은 부딪친 소리(탁!)가 먼저 읽히고 당첨 휘청보다 뒤에 시작한다 — 상태 줄이 "버틸까?" 를 보인다.
      const at = impact + (i === teeterPin ? Math.max(delayOf(i), 140) : delayOf(i));
      if (kick && i === kick.flyer) {
        const f = P[i];
        const tg = P[kick.target];
        const wall: Pt = { x: kick.sgn > 0 ? 95.5 : 4.5, y: Math.max(layout.pitY + 2, (f.y + tg.y) / 2 - 4) };
        const rest: Pt = { x: tg.x + kick.sgn * 2.5, y: tg.y - 1 };
        const dur = KICK_LEG_MS * 2;
        fates[i].fall = {
          roll: k,
          t0: at,
          dur,
          path: [{ x: f.x, y: f.y }, wall, rest],
          rot: kick.sgn * 810,
          flyer: true,
        };
        events.push({ t: at + KICK_LEG_MS, kind: 'kick', roll: k, at: wall, pin: kick.target });
        // 돌아온 핀에 맞은 바깥 핀은 안쪽(레인 가운데)으로 눕는다.
        fallOf(kick.target, at + dur - 20, -kick.sgn, FALL_MS);
        lastT = Math.max(lastT, at + dur - 20 + FALL_MS);
        continue;
      }
      if (i === teeterPin) {
        const len = duel ? DUEL_MS : TEETER_MS;
        fates[i].wobbles.push({ t0: at, t1: at + len, amp: 11, falls: true });
        fallOf(i, at + len, side, FALL_MS);
        events.push({ t: at, kind: duel ? 'duel' : 'teeter', roll: k, pin: i, falls: true, until: at + len });
        lastT = Math.max(lastT, at + len + FALL_MS);
        continue;
      }
      fallOf(i, at, side);
      lastT = Math.max(lastT, at + (strong ? STRIKE_FALL_MS : FALL_MS));
    }

    // 당첨 핀 휘청 — 공이 스쳤거나(언제나), 마지막 공에서 가끔, 미끼와 같이 휘청(duel). 언제나 버틴다.
    if (grazed || duel || (final && extra.winWobble)) {
      const w0 = duel && teeterPin >= 0 ? impact + Math.max(delayOf(teeterPin), 140) : impact + 60;
      const len = duel ? DUEL_MS - 120 : WIN_WOBBLE_MS;
      fates[winner].wobbles.push({ t0: w0, t1: w0 + len, amp: duel ? 8 : 9, falls: false });
      if (!duel) events.push({ t: w0, kind: 'teeter', roll: k, pin: winner, falls: false, until: w0 + len });
      lastT = Math.max(lastT, w0 + len);
    }

    // 스친 핀(brush) · 버티는 미끼(teeterStay) — 휘청이다 그대로 선다(아직은).
    let stayPin = -1;
    if (kind === 'brush') stayPin = decoy;
    else if (!final && extra.teeterStay && kind === 'hit') {
      const rest = so.filter((i) => !ballKnock.includes(i));
      if (rest.length) stayPin = nearestTo(bx, rest)[0];
    }
    if (stayPin >= 0) {
      const w0 = impact + 80;
      fates[stayPin].wobbles.push({ t0: w0, t1: w0 + WIN_WOBBLE_MS, amp: 10, falls: false });
      events.push({ t: w0, kind: 'teeter', roll: k, pin: stayPin, falls: false, until: w0 + WIN_WOBBLE_MS });
      lastT = Math.max(lastT, w0 + WIN_WOBBLE_MS);
    }

    for (const i of ballKnock) up.delete(i);
    so = standingOthers();

    if (kind === 'gutter') events.push({ t: impact, kind: 'gutterEnd', roll: k });
    else if (kind === 'brush') events.push({ t: impact, kind: 'brush', roll: k, pin: decoy });
    else
      events.push({
        t: impact,
        kind: kind === 'strike' ? 'strike' : kind === 'split' ? 'split' : 'hit',
        roll: k,
        // 지금 바로 쓰러진 수 — 휘청이는 핀·킥백에 맞을 핀은 아직 서 있다.
        count: ballKnock.length - (teeterPin >= 0 ? 1 : 0) - (kick ? 1 : 0),
      });

    const settle = (kind === 'gutter' ? impact : lastT) + (final ? 100 : ms(HOLD_MS));
    let sweep: Roll['sweep'] = null;
    let end: number;
    if (!final && ballKnock.length) {
      sweep = { t0: settle, t1: settle + ms(SWEEP_MS) };
      for (const i of ballKnock) fates[i].sweep = sweep;
      events.push({ t: settle, kind: 'sweep', roll: k, until: sweep.t1, count: up.size });
      end = sweep.t1 + ms(SWEEP_GAP_MS);
    } else if (!final) {
      end = settle + 80;
    } else {
      end = settle + ms(FANFARE_MS);
      events.push({ t: settle, kind: 'final', roll: k });
    }
    rolls.push({
      index: k,
      final,
      kind,
      t0,
      panEnd,
      release,
      impact,
      settle,
      sweep,
      end,
      start,
      segs,
      knocked: ballKnock,
      lineX,
      swerve,
    });
    t = end;
  }

  events.sort((a, b) => a.t - b.t);
  const last = rolls[rolls.length - 1];
  return { count, winner, layout, rolls, fates, events, finalMs: last.settle, endMs: last.end };
}

/* ───────── 장면 ───────── */

/** 끝 장면에서 당첨 핀으로 다가가는 배율(1 + 이 값). */
const FINAL_ZOOM = 0.4;

export type Stage = 'idle' | 'pan' | 'windup' | 'cut' | 'travel' | 'react' | 'sweep' | 'final';

export interface PinFrame extends Pt {
  /** 기운 각(도, 시계 방향) — 바닥 가운데를 축으로. */
  rot: number;
  /** 쓰러지는 중이거나 누웠다. */
  down: boolean;
  /** 눕는 정도(0~1) — 이름표가 핀을 따라 내려온다. */
  lay: number;
  wobbling: boolean;
  /** 치워져 없다. */
  gone: boolean;
  /** 치우는 바에 밀려 피트로 빠지며 흐려짐(1 이 다 보임). */
  fade: number;
  /** 치우는 동안 선 핀이 들려 올라간 정도(0~1). */
  lift: number;
}

export interface BallFrame extends Pt {
  spin: number;
  gutter: boolean;
  fade: number;
}

export interface Frame {
  pins: PinFrame[];
  ball: BallFrame | null;
  /** 카메라 가운데(단위)와 배율. */
  cam: { x: number; y: number; z: number };
  /** 치우는 바 자리(없으면 null). */
  barY: number | null;
  /** 지금 공(없으면 -1). */
  roll: number;
  stage: Stage;
}

/** t(ms) 의 장면. 각본에서 바로 계산하는 순수 함수다. */
export function frameAt(plan: BowlingPlan, t: number): Frame {
  const L = plan.layout;
  let k = -1;
  for (let i = 0; i < plan.rolls.length; i += 1) if (t >= plan.rolls[i].t0) k = i;
  const R = k >= 0 ? plan.rolls[k] : null;

  // 치우는 바
  let barY: number | null = null;
  let liftU = 0;
  if (R?.sweep && t >= R.sweep.t0 && t < R.sweep.t1) {
    const u = (t - R.sweep.t0) / (R.sweep.t1 - R.sweep.t0);
    barY = lerp(L.headY + 10, L.pitY - 6, smooth(u));
    liftU = Math.sin(Math.PI * u);
  }

  const pins: PinFrame[] = L.pins.map((p, i) => {
    const f = plan.fates[i];
    const pf: PinFrame = {
      x: p.x,
      y: p.y,
      rot: 0,
      down: false,
      lay: 0,
      wobbling: false,
      gone: false,
      fade: 1,
      lift: 0,
    };
    if (f.fall && t >= f.fall.t0) {
      const u = clamp((t - f.fall.t0) / f.fall.dur, 0, 1);
      const e = f.fall.flyer ? u : easeOut(u);
      const at = along(f.fall.path, e);
      pf.x = at.x;
      pf.y = at.y;
      pf.lay = f.fall.flyer ? smooth(u * 2) : Math.min(1, easeOut(u * 1.5));
      pf.rot = f.fall.flyer ? f.fall.rot * u : f.fall.rot * pf.lay;
      pf.down = true;
    } else {
      for (const w of f.wobbles) {
        if (t < w.t0 || t >= w.t1) continue;
        const len = w.t1 - w.t0;
        const period = len / Math.max(1, Math.round(len / 230));
        const u = (t - w.t0) / len;
        // 쓰러질 핀은 점점 크게, 버틸 핀은 점점 잦아든다. 한 주기 끝(0도)에서 끝나 쓰러짐과 이어진다.
        const env = w.falls ? 0.55 + 0.45 * u : 1 - 0.7 * u;
        pf.rot = w.amp * env * Math.sin((2 * Math.PI * (t - w.t0)) / period);
        pf.wobbling = true;
      }
    }
    if (f.sweep && pf.down && t >= f.sweep.t0) {
      if (t >= f.sweep.t1) pf.gone = true;
      else if (barY !== null) {
        pf.y = Math.min(pf.y, barY - 2.5);
        pf.fade = clamp((pf.y - (L.pitY - 6)) / 8, 0, 1);
      }
    }
    if (!pf.down && liftU > 0) pf.lift = liftU;
    return pf;
  });

  // 공
  let ball: BallFrame | null = null;
  if (R) {
    const seg = R.segs.find((sg) => t >= sg.t0 && t <= sg.t1);
    if (seg) {
      const at = bezier(seg, segEase(seg.ease, (t - seg.t0) / Math.max(1, seg.t1 - seg.t0)));
      ball = {
        x: at.x,
        y: at.y,
        spin: (t - R.release) * 0.9,
        gutter: at.x < LANE_X0 || at.x > LANE_X1,
        fade: clamp((at.y - (L.pitY - 6)) / 7, 0, 1),
      };
    }
  }

  // 무대
  let stage: Stage = 'idle';
  if (R) {
    if (R.final && t >= R.settle) stage = 'final';
    else if (t < R.release) stage = R.final ? 'cut' : t < R.panEnd ? 'pan' : 'windup';
    else if (t < R.impact) stage = 'travel';
    else if (R.sweep && t >= R.sweep.t0) stage = 'sweep';
    else stage = 'react';
  }

  // 카메라
  const deck = { x: 50, y: L.view / 2, z: 1 };
  const bowl = { x: 50, y: L.length - L.view / 2, z: 1 };
  let cam = { ...deck };
  if (R && t < R.release) {
    const u = smooth((t - R.t0) / Math.max(1, R.panEnd - R.t0));
    cam = { x: 50, y: lerp(deck.y, bowl.y, u), z: 1 };
  } else if (R && ball) {
    // 공이 파울 라인에 있을 때의 간격을 그대로 두고 따라 올라간다 — 놓는 순간 카메라가 튀지 않는다.
    cam = { x: 50, y: ball.y - (L.foulY - bowl.y), z: 1 };
    if (R.final) {
      const p = (t - R.release) / (R.impact - R.release);
      const zIn = t < R.impact ? smooth((p - 0.5) / 0.4) : 1 - smooth((t - R.impact) / 320);
      cam.z = 1 + 0.35 * zIn;
      cam.x = lerp(50, t < R.impact ? ball.x : R.lineX, zIn);
    }
  }
  if (R && stage === 'final') {
    // 끝까지 버틴 핀으로 카메라가 다가간다.
    const u = smooth((t - R.settle) / 450);
    const wp = L.pins[plan.winner];
    cam = { x: lerp(50, wp.x, u), y: lerp(deck.y, wp.y - PIN_H * 0.6, u), z: 1 + FINAL_ZOOM * u };
  }
  const half = 50 / cam.z;
  const vh = L.view / (2 * cam.z);
  cam.x = clamp(cam.x, half, 100 - half);
  cam.y = clamp(cam.y, vh, L.length - vh);
  // 핀이 와르르 쓰러질 때 화면이 떨린다.
  if (R && R.knocked.length >= 2 && t >= R.impact && t < R.impact + 280) {
    const amp = (R.kind === 'strike' ? 1.3 : 0.7) * (1 - (t - R.impact) / 280);
    cam = { ...cam, x: cam.x + Math.sin(t * 0.11) * amp, y: cam.y + Math.cos(t * 0.13) * amp * 0.6 };
  }

  return { pins, ball, cam, barY, roll: k, stage };
}

/** t 까지 일어난 마지막 사건. */
export function eventAt(plan: BowlingPlan, t: number): BowlEvent | null {
  let ev: BowlEvent | null = null;
  for (const e of plan.events) {
    if (e.t > t) break;
    ev = e;
  }
  return ev;
}

/** t 에 서 있는 핀 수(쓰러지는 중인 핀은 뺀다). */
export function standingAt(plan: BowlingPlan, t: number): number {
  return plan.fates.filter((f) => !f.fall || t < f.fall.t0).length;
}
