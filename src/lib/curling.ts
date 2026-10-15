/**
 * 컬링 — 가게 이름표를 단 스톤들이 하우스(과녁) 둘레에 흩어져 있고, 우리 스톤 2~3개가
 * 얼음 위를 휘어 미끄러져 와 부딪친다. 다 멈췄을 때 버튼(과녁 한가운데)에 가장 가까운
 * 가게 스톤이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 물리 계산을 하지 않는다 — 끝 장면(당첨이
 * 버튼에 가장 가깝다)을 먼저 정하고, 그 장면으로 가는 충돌 각본을 거꾸로 짠다. 각본은
 * 판 번호 rng 하나로 정해지는 순수 함수라 같은 판은 언제나 같은 장면이다.
 *
 * 좌표는 시트 폭 = 100 단위, 길이 = SHEET_L 단위다(세로로 긴 시트, 위쪽 끝에 하우스).
 * 화면에선 x% · y/SHEET_L% 로 옮긴다. 스톤 지름은 2R 단위(시트 폭의 8%).
 *
 * 약속(curling.test.ts 가 본다)
 *  - 끝 장면에서 당첨 스톤이 버튼에 가장 가깝다(엄격히). 우리 스톤(이름표 없음)은 그보다 훨씬 멀다.
 *  - 어느 순간에도 스톤끼리 겹치지 않는다(부딪치는 순간은 딱 맞닿는다).
 *  - 처음·끝 장면에서 이름표끼리 겹치지 않는다(후보가 많으면 이름표를 짧게 잡는다).
 *  - 전체 길이 7.5초 안.
 */
import { seededRandom } from './random';

export interface Pt {
  x: number;
  y: number;
}

/** 시트 길이(폭 100 기준). 폭 ÷ 길이가 화면 비율이다. */
export const SHEET_L = 120;
/** 버튼(하우스 한가운데). */
export const BUTTON: Pt = { x: 50, y: 36 };
/** 하우스 고리 반지름(바깥 → 안). 버튼 반지름은 BUTTON_R. */
export const RINGS = [24, 16, 8] as const;
export const HOUSE_R = RINGS[0];
export const BUTTON_R = 3;
/** 스톤 반지름. */
export const R = 4;
/** 멈춰 있는 스톤 사이 최소 중심 거리(맞닿음 + 틈). */
const REST_GAP = 2 * R + 1.5;
/** 이름표가 겹치지 않으려면 위아래로 이만큼 떨어지거나, 옆으로 이름표 폭만큼 떨어져야 한다. */
const TAG_DY = 10;
/** 스톤이 놓일 수 있는 범위(가장자리 1단위 여유). */
const MIN_X = R + 1;
const MAX_X = 100 - R - 1;
const MIN_Y = R + 1;
/** 처음부터 멈춰 있는 스톤이 놓이는 가장 아래(하우스 앞 조금). */
const STATIC_MAX_Y = BUTTON.y + HOUSE_R + 14;
/** 튕겨 나간 스톤이 멈출 수 있는 가장 아래. */
const REST_MAX_Y = SHEET_L - R - 6;

/* ───────── 이름표 ───────── */

/** 이름표 글자 수. 후보가 많을수록 짧게 — 15곳도 이름표가 서로 겹치지 않게 한다. */
export function curlingNameMax(count: number, expanded = false): number {
  if (expanded) return count >= 13 ? 5 : 7;
  return count >= 13 ? 4 : count >= 7 ? 5 : 6;
}

/** 이름표 폭의 절반(단위). 11px 굵은 한글 한 자 ≈ 11px, 테두리·여백 10px, 폭 360px = 100단위. */
export function tagHalfWidth(count: number): number {
  return (curlingNameMax(count) * 11 + 10) / 3.6 / 2;
}

/* ───────── 경로·움직임 ───────── */

/** 2차 베지어(c 가 없으면 직선). */
export interface Path {
  a: Pt;
  c: Pt | null;
  b: Pt;
}

/**
 * out: 멈추며 끝난다 · carry: 끝에서도 속도가 남는다(부딪치러 가는 중, carry 는 남은 속도 비)
 * · creep: 끝에서 아주 천천히 기어간다(밀려 올라가는 당첨 스톤).
 */
export type Ease = 'out' | 'carry' | 'creep';

export interface Move {
  /** 스톤 번호. 0..count-1 은 가게 스톤, count.. 은 우리 스톤(던진 순서). */
  id: number;
  t0: number;
  t1: number;
  path: Path;
  ease: Ease;
  carry?: number;
  /** 이 움직임 동안 도는 각(도). */
  spin: number;
  kind: 'deliver' | 'knock' | 'roll';
}

export type CurlEventKind =
  'deliver' | 'sweep' | 'hit' | 'double' | 'chain' | 'raise' | 'short' | 'teeter' | 'measure' | 'reveal';

export interface CurlEvent {
  t: number;
  kind: CurlEventKind;
  /** 몇 번째 투구(0부터). */
  throwNo?: number;
  /** 부딪친 자리(hit·double·chain·raise). */
  at?: Pt;
  /** 걸친 스톤(teeter) · 당첨(reveal). */
  id?: number;
  /** 이 장면이 끝나는 시각(sweep·teeter·measure). */
  until?: number;
}

export interface Measure {
  runner: number;
  startMs: number;
  endMs: number;
  /** 버튼까지 거리(단위). 화면엔 cm 로 보인다(CM_PER_UNIT). */
  winnerDist: number;
  runnerDist: number;
}

export interface CurlingPlan {
  count: number;
  winner: number;
  /** 던진 우리 스톤 수(2~3). 번호는 count, count+1, … */
  throws: number;
  /** 가게 스톤 처음 자리. */
  start: Pt[];
  moves: Move[];
  events: CurlEvent[];
  measure: Measure | null;
  /**
   * 이름표를 스톤 위에 다는 스톤 — 끝에 버튼 바로 위쪽에 멈추는 당첨·2등. 이름표를 아래에 달면
   * 버튼 쪽으로 늘어져 측정 테이프에 가린다.
   */
  tagUp: number[];
  /** 걸친 스톤이 흔들리는 시간. */
  teeter: { id: number; t0: number; t1: number } | null;
  /** 모든 스톤이 멈춘 시각. */
  settleMs: number;
  /** 당첨을 밝히는 시각. */
  revealMs: number;
  /** 반짝임까지 끝난 시각 — 여기서 onSpinEnd. */
  endMs: number;
}

/** 스톤 지름 29cm 를 2R 단위로 — 측정 테이프 숫자에 쓴다. */
export const CM_PER_UNIT = 29 / (2 * R);

/* 시간(ms) */
const LEAD_MS = 280;
const DELIVER_MS = 950;
const SHOUT_MS = 280;
const knockMs = (d: number) => Math.round(260 + d * 13);
const rollMs = (d: number) => Math.round(200 + d * 15);
const raiseMs = (d: number) => Math.round(420 + d * 20);
const TEETER_MS = 650;
const MEASURE_MS = 1200;
const SHINE_MS = 650;
/** 부딪치기 직전엔 스위퍼가 비켜선다. */
const SWEEP_OFF_MS = 90;
/** 판 전체 길이 상한. 넘는 각본은 다시 짠다. */
export const MAX_END_MS = 7200;

/* 사건 확률 */
/** 당첨이 처음부터 제자리(미끼를 쳐낸다). 나머지는 마지막 투구에 밀려 올라온다. */
const STATIC_CHANCE = 0.4;
/** 밀어 올리기 판에서 2등이 간발의 차로 붙어 '측정 중…' 이 나올 확률. */
const MEASURE_CHANCE = 0.65;
const THREE_THROWS_CHANCE = 0.5;
/** 투구마다 스위퍼가 "닦아요!" 를 외칠 확률(판마다 적어도 한 번). */
const SHOUT_CHANCE = 0.45;
/** 튕겨 나간 스톤 하나가 하우스 가장자리에 걸쳐 흔들릴 확률. */
const TEETER_CHANCE = 0.5;

/* ───────── 작은 벡터 도구 ───────── */

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const dot = (a: Pt, b: Pt) => a.x * b.x + a.y * b.y;
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
/** 시계 방향(화면 기준) 회전. */
const rot = (v: Pt, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
};
const UP: Pt = { x: 0, y: -1 };
const DOWN: Pt = { x: 0, y: 1 };
const polar = (deg: number, r: number): Pt => add(BUTTON, mul(rot(DOWN, deg), r));

export function bezier(p: Path, s: number): Pt {
  if (!p.c) return add(p.a, mul(sub(p.b, p.a), s));
  const u = 1 - s;
  return {
    x: u * u * p.a.x + 2 * u * s * p.c.x + s * s * p.b.x,
    y: u * u * p.a.y + 2 * u * s * p.c.y + s * s * p.b.y,
  };
}

export function ease(kind: Ease, u: number, carry = 0.35): number {
  const t = Math.min(1, Math.max(0, u));
  if (kind === 'out') return 1 - (1 - t) * (1 - t);
  if (kind === 'creep') return 1 - Math.pow(1 - t, 3);
  // 속도가 1 → carry 로 곧게 줄어든다.
  return (t - ((1 - carry) * t * t) / 2) / ((1 + carry) / 2);
}

/* ───────── 장면 ───────── */

export interface Frame {
  /** 모든 스톤 자리(가게 + 우리). */
  pos: Pt[];
  /** 도는 각(도). */
  rot: number[];
  /** 화면에 보이는가(우리 스톤은 던지기 전엔 없다). */
  shown: boolean[];
  /** 움직이는 중인가. */
  moving: boolean[];
}

/** t(ms) 의 장면. 계획에서 바로 계산하는 순수 함수다. */
export function frameAt(plan: CurlingPlan, t: number): Frame {
  const n = plan.count + plan.throws;
  const pos: Pt[] = [];
  const rotDeg: number[] = [];
  const shown: boolean[] = [];
  const moving: boolean[] = [];
  for (let id = 0; id < n; id += 1) {
    pos.push(id < plan.count ? plan.start[id] : { x: 50, y: SHEET_L + 20 });
    rotDeg.push(0);
    shown.push(id < plan.count);
    moving.push(false);
  }
  for (const m of plan.moves) {
    if (t < m.t0) continue;
    const u = m.t1 > m.t0 ? (t - m.t0) / (m.t1 - m.t0) : 1;
    const e = ease(m.ease, u, m.carry);
    pos[m.id] = bezier(m.path, e);
    rotDeg[m.id] += m.spin * e;
    shown[m.id] = true;
    moving[m.id] = u < 1;
  }
  return { pos, rot: rotDeg, shown, moving };
}

export interface Sweepers {
  /** 미는 우리 스톤 번호. */
  id: number;
  /** 스톤 자리와 나아가는 방향(단위 벡터). 스위퍼는 그 앞에 선다. */
  at: Pt;
  dir: Pt;
  /** "닦아요! 닦아요!" 를 외치는 중. */
  shout: boolean;
}

/** t 에 얼음을 닦고 있는 스위퍼 짝들. 던진 스톤이 미끄러지는 동안만 앞에서 닦는다. */
export function sweepersAt(plan: CurlingPlan, t: number): Sweepers[] {
  const out: Sweepers[] = [];
  for (const m of plan.moves) {
    if (m.kind !== 'deliver' || t < m.t0 || t > m.t1 - SWEEP_OFF_MS) continue;
    const s = ease(m.ease, (t - m.t0) / (m.t1 - m.t0), m.carry);
    const { a, c, b } = m.path;
    const d = c ? add(mul(sub(c, a), 2 * (1 - s)), mul(sub(b, c), 2 * s)) : sub(b, a);
    const throwNo = m.id - plan.count;
    const shout = plan.events.some(
      (e) => e.kind === 'sweep' && e.throwNo === throwNo && t >= e.t && t <= (e.until ?? e.t),
    );
    out.push({ id: m.id, at: bezier(m.path, s), dir: norm(d), shout });
  }
  return out;
}

/** t 까지 일어난 마지막 사건(없으면 null). 상태 문구를 고른다. */
export function eventAt(plan: CurlingPlan, t: number): CurlEvent | null {
  let last: CurlEvent | null = null;
  for (const e of plan.events) if (e.t <= t) last = e;
  return last;
}

/* ───────── 각본 짜기 ───────── */

type Template = 'takeout' | 'double' | 'chain' | 'short' | 'raise';

interface Ctx {
  rng: () => number;
  count: number;
  moves: Move[];
  events: CurlEvent[];
  start: Map<number, Pt>;
  /** 이름표 걸칠 스톤을 아직 고르지 않았으면 그 스톤 번호를 받는다. */
  teeterWanted: boolean;
  teeter: { id: number; t0: number; t1: number } | null;
}

const rr = (rng: () => number, a: number, b: number) => a + rng() * (b - a);
const sign = (rng: () => number) => (rng() < 0.5 ? -1 : 1);

const inBounds = (p: Pt, maxY = REST_MAX_Y, half = 0) =>
  p.x >= Math.max(MIN_X, half + 0.5) && p.x <= Math.min(MAX_X, 100 - half - 0.5) && p.y >= MIN_Y && p.y <= maxY;

/** from 에서 n 쪽으로 가면 시트 안에 얼마나 머무는가. */
function rayRoom(from: Pt, n: Pt, maxY = REST_MAX_Y, half = 0): number {
  const lo = Math.max(MIN_X, half + 0.5);
  const hi = Math.min(MAX_X, 100 - half - 0.5);
  let t = Infinity;
  if (n.x > 1e-6) t = Math.min(t, (hi - from.x) / n.x);
  if (n.x < -1e-6) t = Math.min(t, (lo - from.x) / n.x);
  if (n.y > 1e-6) t = Math.min(t, (maxY - from.y) / n.y);
  if (n.y < -1e-6) t = Math.min(t, (MIN_Y - from.y) / n.y);
  return Math.max(0, t);
}

/** 튕겨 나간 스톤이 멈출 자리. 걸치기(teeter)면 하우스 바깥 고리 위에 멈춘다. */
function knockDest(ctx: Ctx, id: number, from: Pt, n: Pt, dmin: number, dmax: number, teeter: boolean): Pt | null {
  // 가게 스톤은 이름표가 시트 밖으로 잘리지 않게 가장자리에서 이름표 폭 절반만큼 떨어져 멈춘다.
  const room = rayRoom(from, n, REST_MAX_Y, id < ctx.count ? tagHalfWidth(ctx.count) : 0);
  // 이미 자리 잡은 가게 스톤(처음 자리·멈출 자리)과 스톤·이름표가 겹치지 않는 곳에 멈춘다.
  const half = tagHalfWidth(ctx.count);
  const taken: Pt[] = [];
  for (const [k, p] of ctx.start) if (k !== id && !ctx.moves.some((m) => m.id === k)) taken.push(p);
  for (const m of ctx.moves) if (m.id !== id && m.id < ctx.count) taken.push(m.path.b);
  const clear = (p: Pt) => taken.every((q) => dist(p, q) >= REST_GAP && !tagsClash(p, q, half));
  if (teeter) {
    // |from + n t − BUTTON| = HOUSE_R + 0.3R 를 푼다. 바깥으로 나가는 근을 쓴다.
    const target = HOUSE_R + R * 0.3;
    const f = sub(from, BUTTON);
    const b = dot(f, n);
    const c = dot(f, f) - target * target;
    const disc = b * b - c;
    if (disc >= 0) {
      const t = -b + Math.sqrt(disc);
      const p = add(from, mul(n, t));
      if (t >= 6 && t <= room && clear(p)) return p;
    }
    return null;
  }
  const lo = Math.min(dmin, room * 0.85);
  if (room < 8) return null;
  for (let k = 0; k < 8; k += 1) {
    const p = add(from, mul(n, rr(ctx.rng, lo, Math.min(dmax, room))));
    if (clear(p)) return p;
  }
  return null;
}

/** 우리 스톤을 E 로 보낸다. 끝 방향 v(위쪽 근처)로 들어오게 휘는 길을 만든다. */
function deliver(
  ctx: Ctx,
  id: number,
  t0: number,
  E: Pt,
  v: Pt,
  hit: boolean,
  shout: boolean,
  throwNo: number,
): number | null {
  if (v.y > -0.84) return null; // 위에서 33° 넘게 비스듬하면 휘어 들어오는 모양이 안 난다.
  const S: Pt = { x: 50 + rr(ctx.rng, -9, 9), y: SHEET_L + R + 2 };
  const c = sub(E, mul(v, 0.55 * dist(S, E)));
  if (c.x < 6 || c.x > 94) return null;
  const path: Path = { a: S, c, b: E };
  for (let s = 0; s <= 1; s += 0.1) {
    const p = bezier(path, s);
    if (p.x < R || p.x > 100 - R) return null;
  }
  const dur = DELIVER_MS + (shout ? SHOUT_MS : 0);
  // 휘는 쪽으로 돈다 — 오른쪽으로 휘면 시계 방향.
  const curl = Math.sign(E.x - S.x - (c.x - S.x) * 0.5) || 1;
  ctx.moves.push({
    id,
    t0,
    t1: t0 + dur,
    path,
    ease: hit ? 'carry' : 'out',
    carry: hit ? 0.4 : undefined,
    spin: curl * rr(ctx.rng, 300, 480),
    kind: 'deliver',
  });
  ctx.events.push({ t: t0, kind: 'deliver', throwNo });
  if (shout) ctx.events.push({ t: t0 + 380, kind: 'sweep', throwNo, until: t0 + dur - 60 });
  return t0 + dur;
}

/** 맞은 스톤이 n 쪽으로 튕겨 나간다. 끝나는 시각을 돌려준다. */
function knock(
  ctx: Ctx,
  id: number,
  from: Pt,
  n: Pt,
  t: number,
  dmin: number,
  dmax: number,
  canTeeter: boolean,
): number | null {
  const teeter = canTeeter && ctx.teeterWanted && id < ctx.count;
  let dest = knockDest(ctx, id, from, n, dmin, dmax, teeter);
  let teetered = teeter && dest !== null;
  if (!dest) {
    dest = knockDest(ctx, id, from, n, dmin, dmax, false);
    teetered = false;
  }
  if (!dest) return null;
  const d = dist(from, dest);
  const t1 = t + knockMs(d);
  ctx.moves.push({
    id,
    t0: t,
    t1,
    path: { a: from, c: null, b: dest },
    ease: 'out',
    spin: sign(ctx.rng) * d * 4,
    kind: 'knock',
  });
  if (teetered) {
    ctx.teeterWanted = false;
    ctx.teeter = { id, t0: t1, t1: t1 + TEETER_MS };
    ctx.events.push({ t: t1, kind: 'teeter', id, until: t1 + TEETER_MS });
    return t1 + TEETER_MS;
  }
  return t1;
}

/** 부딪친 뒤 우리 스톤(또는 미는 스톤)이 옆으로 비껴 굴러간다. */
function roll(ctx: Ctx, id: number, from: Pt, dir: Pt, t: number, d: number): number {
  const room = rayRoom(from, dir);
  const dd = Math.min(d, room);
  if (dd < 0.8) return t;
  const t1 = t + rollMs(dd);
  ctx.moves.push({
    id,
    t0: t,
    t1,
    path: { a: from, c: null, b: add(from, mul(dir, dd)) },
    ease: 'out',
    spin: sign(ctx.rng) * dd * 6,
    kind: 'roll',
  });
  return t1;
}

/** v 로 들어온 스톤이 n 쪽으로 맞힌 뒤 비껴 나가는 방향과 남는 속도 비(sin). */
function tangent(v: Pt, n: Pt): { dir: Pt; k: number } {
  const t = sub(v, mul(n, dot(v, n)));
  return { dir: norm(t), k: len(t) };
}

/** 하우스 둘레 아무 데나(가운데에 몰리게) — 앞선 투구가 쳐낼 스톤 자리. */
function freeSpot(ctx: Ctx): Pt {
  const half = tagHalfWidth(ctx.count);
  let p = polar(rr(ctx.rng, -180, 180), rr(ctx.rng, 2, HOUSE_R + 6));
  for (let k = 0; k < 30; k += 1) {
    const clash = [...ctx.start.values()].some((q) => dist(p, q) < REST_GAP + 2 || tagsClash(p, q, half));
    if (!clash && inBounds(p, STATIC_MAX_Y, half)) break;
    p = polar(rr(ctx.rng, -180, 180), rr(ctx.rng, 2, HOUSE_R + 6));
  }
  return p;
}

/** 들어오는 방향 — 위쪽에서 ±deg 안. 시트를 따라 내려온 스톤은 크게 비스듬할 수 없다. */
const incoming = (rng: () => number, deg = 22) => rot(UP, rr(rng, -deg, deg));

interface ThrowSpec {
  tpl: Template;
  /** 쳐낼(밀어 올릴) 스톤들. takeout: [K] · double: [K1, X2] · chain: [A, B] · raise: [winner]. */
  ids: number[];
  /** 이 스톤 자리는 미리 정해져 있다(미끼·당첨). chain 이면 B 자리. */
  fixed?: Pt;
  /** raise: 당첨이 멈출 자리. */
  dest?: Pt;
  shout: boolean;
}

/** 투구 하나. 접촉 시각이 아니라 모든 움직임이 끝나는 시각을 돌려준다. 못 짜면 null. */
function buildThrow(
  ctx: Ctx,
  spec: ThrowSpec,
  shooter: number,
  t0: number,
  throwNo: number,
): { contact: number; settle: number } | null {
  const { rng } = ctx;
  const setStart = (id: number, p: Pt) => {
    if (id < ctx.count) ctx.start.set(id, p);
  };

  if (spec.tpl === 'short') {
    // 하우스 앞에서 한 끗 모자라 멈춘다.
    const E = polar(rr(rng, -35, 35), HOUSE_R + R + rr(rng, 0.4, 2));
    const contact = deliver(ctx, shooter, t0, E, rot(UP, rr(rng, -10, 10)), false, spec.shout, throwNo);
    if (contact === null) return null;
    ctx.events.push({ t: contact - 120, kind: 'short', throwNo });
    return { contact, settle: contact };
  }

  if (spec.tpl === 'raise') {
    const Wf = spec.dest!;
    const v = incoming(rng, 18);
    const phi = sign(rng) * rr(rng, 0, 26);
    const n = rot(v, phi);
    const d = rr(rng, 14, 24);
    const W0 = sub(Wf, mul(n, d));
    const P = sub(W0, mul(n, 2 * R));
    const contact = deliver(ctx, shooter, t0, P, v, true, spec.shout, throwNo);
    if (contact === null) return null;
    setStart(spec.ids[0], W0);
    const t1 = contact + raiseMs(d);
    ctx.moves.push({
      id: spec.ids[0],
      t0: contact,
      t1,
      path: { a: W0, c: null, b: Wf },
      ease: 'creep',
      spin: sign(rng) * d * 3,
      kind: 'knock',
    });
    ctx.events.push({ t: contact, kind: 'raise', throwNo, at: add(P, mul(n, R)) });
    const tg = tangent(v, n);
    const r = roll(ctx, shooter, P, tg.dir, contact, rr(rng, 6, 16) * Math.max(tg.k, 0.25) * 2);
    return { contact, settle: Math.max(t1, r) };
  }

  if (spec.tpl === 'chain') {
    // 우리 스톤 → A → B. B 자리가 정해져 있으면(미끼) 거꾸로 푼다.
    const [A, B] = spec.ids;
    const B0 = spec.fixed ?? freeSpot(ctx);
    const v = incoming(rng);
    const phi1 = sign(rng) * rr(rng, 0, 18);
    const n1 = rot(v, phi1);
    const phi2 = sign(rng) * rr(rng, 25, 50);
    const n2 = rot(n1, phi2);
    const s = rr(rng, 6, 16);
    const Ac = sub(B0, mul(n2, 2 * R));
    const A0 = sub(Ac, mul(n1, s));
    const P = sub(A0, mul(n1, 2 * R));
    const contact = deliver(ctx, shooter, t0, P, v, true, spec.shout, throwNo);
    if (contact === null) return null;
    setStart(A, A0);
    setStart(B, B0);
    ctx.events.push({ t: contact, kind: 'hit', throwNo, at: add(P, mul(n1, R)) });
    // A 가 밀려가 B 를 맞힌다.
    const tc2 = contact + Math.round(140 + s * 16);
    ctx.moves.push({
      id: A,
      t0: contact,
      t1: tc2,
      path: { a: A0, c: null, b: Ac },
      ease: 'carry',
      carry: 0.7,
      spin: sign(rng) * 60,
      kind: 'knock',
    });
    ctx.events.push({ t: tc2, kind: 'chain', throwNo, at: add(Ac, mul(n2, R)) });
    const kb = knock(ctx, B, B0, n2, tc2, 18, 40, true);
    if (kb === null) return null;
    const tgA = tangent(n1, n2);
    const ra = roll(ctx, A, Ac, tgA.dir, tc2, rr(rng, 8, 18) * tgA.k * 1.6);
    const tg = tangent(v, n1);
    const rs = roll(ctx, shooter, P, tg.dir, contact, rr(rng, 3, 9) * Math.max(tg.k, 0.3) * 2);
    return { contact, settle: Math.max(kb, ra, rs) };
  }

  // takeout · double — 첫 스톤 K 를 맞힌다.
  const K = spec.ids[0];
  const K0 = spec.fixed ?? freeSpot(ctx);
  const v = incoming(rng);
  const phi = sign(rng) * rr(rng, spec.tpl === 'double' ? 28 : 22, 55);
  const n = rot(v, phi);
  const P = sub(K0, mul(n, 2 * R));
  const contact = deliver(ctx, shooter, t0, P, v, true, spec.shout, throwNo);
  if (contact === null) return null;
  setStart(K, K0);
  ctx.events.push({ t: contact, kind: 'hit', throwNo, at: add(P, mul(n, R)) });
  const k1 = knock(ctx, K, K0, n, contact, 18, 44, true);
  if (k1 === null) return null;
  const tg = tangent(v, n);
  if (spec.tpl === 'takeout') {
    const rs = roll(ctx, shooter, P, tg.dir, contact, rr(rng, 16, 36) * tg.k * 1.4);
    return { contact, settle: Math.max(k1, rs) };
  }

  // double — 비껴 나간 우리 스톤이 둘째 스톤 X 를 또 맞힌다.
  const X = spec.ids[1];
  const s = rr(rng, 3, 12);
  const P2 = add(P, mul(tg.dir, s));
  const tc2 = contact + Math.round(120 + s * 22);
  ctx.moves.push({
    id: shooter,
    t0: contact,
    t1: tc2,
    path: { a: P, c: null, b: P2 },
    ease: 'carry',
    carry: 0.6,
    spin: sign(rng) * 50,
    kind: 'roll',
  });
  const n2 = rot(tg.dir, sign(rng) * rr(rng, 0, 35));
  const X0 = add(P2, mul(n2, 2 * R));
  setStart(X, X0);
  ctx.events.push({ t: tc2, kind: 'double', throwNo, at: add(P2, mul(n2, R)) });
  const k2 = knock(ctx, X, X0, n2, tc2, 12, 34, true);
  if (k2 === null) return null;
  const tg2 = tangent(tg.dir, n2);
  const rs = roll(ctx, shooter, P2, tg2.dir, tc2, rr(rng, 3, 12) * tg2.k * 1.5 + 1);
  return { contact, settle: Math.max(k1, k2, rs) };
}

/* ───────── 검사 ───────── */

/** 두 가게 스톤 이름표가 겹치는가. */
function tagsClash(a: Pt, b: Pt, half: number): boolean {
  return Math.abs(a.x - b.x) < 2 * half && Math.abs(a.y - b.y) < TAG_DY;
}

/** 멈춘 장면(가게 스톤만)에서 스톤·이름표가 겹치지 않는가. */
function restOk(points: Pt[], half: number | null): boolean {
  for (let i = 0; i < points.length; i += 1) {
    if (!inBounds(points[i], REST_MAX_Y, half ?? 0)) return false;
    for (let j = i + 1; j < points.length; j += 1) {
      if (dist(points[i], points[j]) < REST_GAP) return false;
      if (half !== null && tagsClash(points[i], points[j], half)) return false;
    }
  }
  return true;
}

/** 이 계획의 약속을 모두 지키는가(겹침 없음·당첨이 가장 가까움·이름표). */
export function checkPlan(plan: CurlingPlan, tags = true): boolean {
  const half = tags ? tagHalfWidth(plan.count) : null;
  const end = frameAt(plan, plan.endMs);
  const first = frameAt(plan, 0);
  if (!restOk(first.pos.slice(0, plan.count), half)) return false;
  if (!restOk(end.pos.slice(0, plan.count), half)) return false;
  for (const up of half === null ? [] : plan.tagUp) {
    // 위에 달린 이름표와 그 위쪽 스톤 이름표가 겹치지 않는다.
    for (const f of [first, end]) {
      const r = f.pos[up];
      for (let i = 0; i < plan.count; i += 1) {
        if (i === up) continue;
        const q = f.pos[i];
        if (Math.abs(q.x - r.x) < 2 * half! && r.y - q.y > 0 && r.y - q.y < TAG_DY + 1.8) return false;
      }
    }
  }
  // 당첨이 엄격히 가장 가깝다. 2등(측정)과도 0.4단위 넘게, 나머지와는 3단위 넘게.
  const dW = dist(end.pos[plan.winner], BUTTON);
  for (let i = 0; i < plan.count; i += 1) {
    if (i === plan.winner) continue;
    const d = dist(end.pos[i], BUTTON);
    const gap = plan.measure?.runner === i ? 0.4 : 3;
    if (d - dW < gap) return false;
  }
  // 우리 스톤은 하우스 안쪽 깊이 남지 않는다 — 이름표 없는 스톤이 가장 가까워 보이면 헷갈린다.
  for (let id = plan.count; id < plan.count + plan.throws; id += 1) {
    if (dist(end.pos[id], BUTTON) < Math.max(dW, plan.measure?.runnerDist ?? 0) + 7) return false;
    if (end.pos[id].x < R || end.pos[id].x > 100 - R || end.pos[id].y < R) return false;
  }
  // 어느 순간에도 겹치지 않는다(부딪치는 순간은 딱 2R).
  const n = plan.count + plan.throws;
  for (let t = 0; t <= plan.settleMs + 20; t += 20) {
    const f = frameAt(plan, t);
    for (let i = 0; i < n; i += 1) {
      if (!f.shown[i]) continue;
      for (let j = i + 1; j < n; j += 1) {
        if (!f.shown[j] || (!f.moving[i] && !f.moving[j])) continue;
        if (dist(f.pos[i], f.pos[j]) < 2 * R - 0.15) return false;
      }
    }
  }
  return true;
}

/* ───────── 계획 ───────── */

function pickTemplates(rng: () => number, n: number): Template[] {
  const out: Template[] = [];
  for (let k = 0; k < n; k += 1) {
    const x = rng() * 9;
    out.push(x < 3 ? 'takeout' : x < 5.5 ? 'double' : x < 7.5 ? 'chain' : 'short');
  }
  return out;
}

/** 판의 줄거리 — 끝 장면 방식, 측정 여부, 투구 종류와 맞을 스톤. 자리는 아직 없다. */
interface Scenario {
  /** raise: 당첨이 마지막 투구에 밀려 올라온다 · static: 당첨은 제자리, 더 가까운 미끼를 쳐낸다. */
  mode: 'static' | 'raise';
  runner: number | null;
  decoy: number | null;
  specs: ThrowSpec[];
  teeter: boolean;
}

function scenario(count: number, winner: number, rng: () => number): Scenario {
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winner) others.push(i);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const mode: Scenario['mode'] = rng() < STATIC_CHANCE ? 'static' : 'raise';
  const runner = mode === 'raise' && rng() < MEASURE_CHANCE ? others.pop()! : null;
  const decoy = mode === 'static' ? others.pop()! : null;

  const throws = rng() < THREE_THROWS_CHANCE ? 3 : 2;
  const pool = others;
  const specs: ThrowSpec[] = [];
  const need = (t: Template) => (t === 'takeout' ? 1 : t === 'short' ? 0 : 2);
  for (const t0 of pickTemplates(rng, throws - 1)) {
    let t = t0;
    if (need(t) > pool.length) t = pool.length >= 1 ? 'takeout' : 'short';
    specs.push({ tpl: t, ids: pool.splice(0, need(t)), shout: rng() < SHOUT_CHANCE });
  }
  if (mode === 'raise') {
    specs.push({ tpl: 'raise', ids: [winner], shout: rng() < SHOUT_CHANCE });
  } else {
    const x = rng();
    let t: Template = x < 0.5 ? 'takeout' : x < 0.78 ? 'double' : 'chain';
    if (t !== 'takeout' && pool.length < 1) t = 'takeout';
    // chain 은 A(맞는 스톤) → B(미끼) 순서, double 은 미끼를 먼저 맞힌다.
    const ids = t === 'takeout' ? [decoy!] : t === 'double' ? [decoy!, pool.shift()!] : [pool.shift()!, decoy!];
    specs.push({ tpl: t, ids, shout: rng() < SHOUT_CHANCE });
  }
  if (!specs.some((sp) => sp.shout)) specs[Math.floor(rng() * specs.length)].shout = true;
  return { mode, runner, decoy, specs, teeter: rng() < TEETER_CHANCE };
}

/** 줄거리에 자리·시각을 붙인다. 약속을 어기면 null — 같은 줄거리로 다시 짠다. */
function geometry(count: number, winner: number, sc: Scenario, rng: () => number, tags: boolean): CurlingPlan | null {
  let Wf: Pt = BUTTON;
  let dw = 0;
  let runner: { id: number; at: Pt; d: number } | null = null;
  let decoyAt: Pt | null = null;
  // 당첨과 2등(또는 미끼)은 버튼 위아래로 마주 본다 — 옆으로 붙으면 이름표가 겹친다.
  const half = tagHalfWidth(count);
  let tries = 0;
  for (;;) {
    tries += 1;
    if (tries > 40) return null;
    if (sc.mode === 'raise') {
      // 당첨은 앞(아래)에서 밀려 올라와 버튼 앞쪽에 멈춘다. 2등은 버튼 뒤쪽(위)에서 기다린다.
      const a = rr(rng, -25, 25);
      dw = sc.runner !== null ? rr(rng, 5.2, 6.8) : rr(rng, 1.2, 7);
      Wf = polar(a, dw);
      if (sc.runner === null) break;
      const d = dw + rr(rng, 0.5, 1.1);
      runner = { id: sc.runner, at: polar(a + 180 + rr(rng, -18, 18), d), d };
      if (dist(Wf, runner.at) >= REST_GAP && !tagsClash(Wf, runner.at, half)) break;
    } else {
      // 당첨은 제자리, 미끼가 버튼에 더 가까이(반대쪽) 있다.
      dw = rr(rng, 6.5, 9.5);
      const a = (rng() < 0.5 ? 0 : 180) + rr(rng, -30, 30);
      Wf = polar(a, dw);
      decoyAt = polar(a + 180 + rr(rng, -25, 25), rr(rng, 0.3, dw - 2));
      if (dist(Wf, decoyAt) >= REST_GAP && !tagsClash(Wf, decoyAt, half)) break;
    }
  }
  const closest = runner ? runner.d : dw;
  const specs = sc.specs.map((sp, k): ThrowSpec => {
    if (k < sc.specs.length - 1) return sp;
    return sc.mode === 'raise' ? { ...sp, dest: Wf } : { ...sp, fixed: decoyAt! };
  });

  const ctx: Ctx = {
    rng,
    count,
    moves: [],
    events: [],
    start: new Map(),
    teeterWanted: sc.teeter,
    teeter: null,
  };
  if (sc.mode === 'static') ctx.start.set(winner, Wf);
  if (runner) ctx.start.set(runner.id, runner.at);
  // 미끼 자리는 미리 잡아 둔다 — 앞선 투구가 그 자리를 지나가지 않게.
  if (sc.decoy !== null && decoyAt) ctx.start.set(sc.decoy, decoyAt);

  let t = LEAD_MS;
  let settle = 0;
  for (let k = 0; k < specs.length; k += 1) {
    const res = buildThrow(ctx, specs[k], count + k, t, k);
    if (!res) return null;
    settle = Math.max(settle, res.settle);
    // 다음 스톤은 앞 투구가 다 멈춘 뒤 도착하게 — 미리 출발해 빙판을 미끄러진다.
    t = Math.max(res.contact + 250, settle + 150 - DELIVER_MS);
  }

  // 버튼 위쪽에 멈추는 당첨·2등은 이름표를 위에 단다.
  const tagUp: number[] = [];
  if (Wf.y < BUTTON.y) tagUp.push(winner);
  if (runner && runner.at.y < BUTTON.y) tagUp.push(runner.id);
  const ups = [...(Wf.y < BUTTON.y ? [Wf] : []), ...(runner && runner.at.y < BUTTON.y ? [runner.at] : [])];

  // 나머지 스톤은 처음부터 끝까지 제자리 — 움직이는 길과 다른 스톤을 피해 하우스 둘레에 흩는다.
  const placed: Pt[] = [...ctx.start.values()];
  const finals: Pt[] = ctx.moves.map((m) => m.path.b);
  const trail: Pt[] = [];
  for (const m of ctx.moves) for (let s = 0; s <= 1.0001; s += 1 / 16) trail.push(bezier(m.path, s));
  const placeFinals = ctx.moves.filter((m) => m.id < count).map((m) => m.path.b);
  for (let i = 0; i < count; i += 1) {
    if (ctx.start.has(i)) continue;
    let ok: Pt | null = null;
    for (let k = 0; k < 300 && !ok; k += 1) {
      const p = polar(rr(rng, -180, 180), rr(rng, closest + 5, 50));
      if (!inBounds(p, STATIC_MAX_Y, tags ? half : 0)) continue;
      if (placed.some((q) => dist(p, q) < REST_GAP || (tags && tagsClash(p, q, half)))) continue;
      // 2등 이름표는 위에 달린다 — 그 위쪽 스톤은 이름표 높이만큼 더 떨어진다.
      if (tags && ups.some((u) => Math.abs(p.x - u.x) < 2 * half && u.y - p.y > 0 && u.y - p.y < TAG_DY + 2)) continue;
      if (placeFinals.some((q) => dist(p, q) < REST_GAP || (tags && tagsClash(p, q, half)))) continue;
      if (finals.some((q) => dist(p, q) < REST_GAP)) continue;
      if (trail.some((q) => dist(p, q) < 2 * R + 0.6)) continue;
      ok = p;
    }
    if (!ok) return null;
    ctx.start.set(i, ok);
    placed.push(ok);
  }

  const start: Pt[] = [];
  for (let i = 0; i < count; i += 1) start.push(ctx.start.get(i)!);
  const settleMs = Math.max(settle, ...ctx.moves.map((m) => m.t1), ctx.teeter?.t1 ?? 0);
  let revealMs = settleMs + 250;
  let meas: Measure | null = null;
  if (runner) {
    const startMs = settleMs + 200;
    meas = { runner: runner.id, startMs, endMs: startMs + MEASURE_MS, winnerDist: dw, runnerDist: runner.d };
    ctx.events.push({ t: startMs, kind: 'measure', until: startMs + MEASURE_MS });
    revealMs = startMs + MEASURE_MS;
  }
  if (revealMs + SHINE_MS > MAX_END_MS) return null;
  ctx.events.push({ t: revealMs, kind: 'reveal', id: winner });
  ctx.events.sort((x, y) => x.t - y.t);
  const plan: CurlingPlan = {
    count,
    winner,
    throws: specs.length,
    start,
    moves: ctx.moves.sort((x, y) => x.t0 - y.t0),
    events: ctx.events,
    measure: meas,
    tagUp,
    teeter: ctx.teeter,
    settleMs,
    revealMs,
    endMs: revealMs + SHINE_MS,
  };
  return checkPlan(plan, tags) ? plan : null;
}

/** 각본을 못 짤 때(거의 없다) — 던지기 하나가 하우스 앞에 멈추고, 스톤은 줄지어 서 있다. */
function fallbackPlan(count: number, winner: number): CurlingPlan {
  const cols = 4;
  const start: Pt[] = [];
  let k = 0;
  for (let i = 0; i < count; i += 1) {
    if (i === winner) {
      start.push({ ...BUTTON });
      continue;
    }
    const r = Math.floor(k / cols);
    const c = k % cols;
    k += 1;
    start.push({ x: 14 + c * 24, y: 8 + r * 11 > BUTTON.y - 12 ? BUTTON.y + 14 + (r - 3) * 11 : 8 + r * 11 });
  }
  const E = { x: 50, y: BUTTON.y + HOUSE_R + R + 1 };
  const S = { x: 50, y: SHEET_L + R + 2 };
  const moves: Move[] = [
    {
      id: count,
      t0: LEAD_MS,
      t1: LEAD_MS + DELIVER_MS,
      path: { a: S, c: null, b: E },
      ease: 'out',
      spin: 360,
      kind: 'deliver',
    },
  ];
  const settleMs = LEAD_MS + DELIVER_MS;
  const revealMs = settleMs + 250;
  return {
    count,
    winner,
    throws: 1,
    start,
    moves,
    events: [
      { t: LEAD_MS, kind: 'deliver', throwNo: 0 },
      { t: settleMs - 120, kind: 'short', throwNo: 0 },
      { t: revealMs, kind: 'reveal', id: winner },
    ],
    measure: null,
    tagUp: [],
    teeter: null,
    settleMs,
    revealMs,
    endMs: revealMs + SHINE_MS,
  };
}

/**
 * 컬링 한 판의 각본. 후보가 2곳 미만이거나 당첨이 범위 밖이면 null.
 *
 * 1) 끝 장면을 먼저 정한다 — 당첨이 버튼 둘레(1.2~9.5단위). 둘 중 하나:
 *    · 밀어 올리기(raise, 60%): 당첨이 하우스 앞에 있다가 마지막 투구에 맞아 버튼 앞까지 밀려 올라온다.
 *      이때 65% 는 2등이 버튼 뒤쪽에 0.5~1.1단위 차이로 있어 '측정 중…' 장면이 붙는다.
 *    · 지키기(static, 40%): 당첨은 처음부터 제자리, 미끼 스톤이 버튼에 더 가까이 있다가
 *      마지막 투구(테이크아웃·더블·연쇄)에 쳐내진다.
 * 2) 투구는 2~3번. 앞선 투구는 테이크아웃 · 더블 테이크아웃 · 연쇄 충돌 · 한 끗 모자란 투구 가운데 하나.
 *    투구마다 45% 로 스위퍼가 "닦아요! 닦아요!" 를 외친다(판마다 적어도 한 번). 50% 로 튕겨 나간 스톤
 *    하나가 하우스 가장자리에 걸쳐 흔들린다(teeter).
 * 3) 나머지 스톤은 움직이는 길을 피해 하우스 둘레에 흩는다. 약속(checkPlan)을 어기면 같은 rng 로 다시 짠다.
 */
export function curlingPlan(count: number, winnerIndex: number, rng: () => number = Math.random): CurlingPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  // 줄거리마다 자리를 여러 번 짜 본다 — 쉬운 줄거리만 살아남지 않게(사건 비율이 적은 대로 나온다).
  for (const tags of [true, false]) {
    for (let k = 0; k < 12; k += 1) {
      const sc = scenario(count, winnerIndex, rng);
      for (let g = 0; g < 40; g += 1) {
        const p = geometry(count, winnerIndex, sc, rng, tags);
        if (p) return p;
      }
    }
  }
  return fallbackPlan(count, winnerIndex);
}

/** 판 시작 전(당첨 모름)에 보여 줄 스톤 자리. 후보 수마다 고정. */
export function idleLayout(count: number): Pt[] {
  if (count <= 0) return [];
  if (count === 1) return [{ ...BUTTON }];
  return curlingPlan(count, 0, seededRandom(977 + count))!.start;
}
