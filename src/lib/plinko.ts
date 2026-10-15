/**
 * 플링코 — 공 하나가 삼각형 핀을 맞으며 내려가 아래 칸 하나에 들어간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 경로를 거꾸로 만든다. 후보가 n 곳이면
 * 핀은 n − 1 줄이고 줄마다 공이 왼쪽이나 오른쪽으로 반 칸 꺾인다. 오른쪽으로 꺾인
 * 횟수가 곧 도착 칸 번호라, 오른쪽 winnerIndex 번 · 왼쪽 나머지를 섞으면 어느 순서든
 * 그 칸에 떨어진다. 순서는 판 번호 난수로 섞어 판마다 다른 길로 보인다.
 */

export type Turn = 'L' | 'R';

/** winnerIndex 칸으로 가는 꺾임 순서. 길이 = 후보 수 − 1. */
export function plinkoPath(winnerIndex: number, count: number, random: () => number = Math.random): Turn[] {
  const rows = Math.max(0, count - 1);
  const rights = Math.max(0, Math.min(rows, winnerIndex));
  const path: Turn[] = [...Array<Turn>(rights).fill('R'), ...Array<Turn>(rows - rights).fill('L')];
  for (let i = path.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [path[i], path[j]] = [path[j], path[i]];
  }
  return path;
}

/** 경로의 도착 칸(오른쪽으로 꺾인 횟수). */
export function landingSlot(path: Turn[]): number {
  return path.filter((t) => t === 'R').length;
}

/**
 * 공이 맞는 핀 차례. hits[r] = r 번째 줄에서 맞는 핀 번호(0..r).
 * 줄 r 에는 핀이 r + 1 개 있고, 공은 그때까지 오른쪽으로 꺾인 횟수 번째 핀에 떨어진다.
 */
export function pinHits(path: Turn[]): number[] {
  const hits: number[] = [];
  let rights = 0;
  for (let r = 0; r < path.length; r += 1) {
    hits.push(rights);
    if (path[r] === 'R') rights += 1;
  }
  return hits;
}

/* ───────── 판 모양 ───────── */

/** 그림 단위. 칸 폭 S, 줄 간격 H, 첫 핀 줄 높이 TOP. */
export const S = 24;
const H = 22;
const TOP = 12;
/** 판 위 공 떨어뜨리는 기계(드로퍼)가 걸린 머리 띠 높이. */
export const HEAD = 30;
/**
 * 판의 최소 폭(그림 단위) — 칸 7개 폭. 판 폭이 후보 수 × S 뿐이면 후보 2곳일 때
 * 그림 폭이 48 이라 핀·공이 7배로 불어나 판을 꽉 채웠다(리뷰 재현).
 * 후보가 적으면 칸을 넓히고 줄 간격도 같은 비율로 늘려 핀 모양을 지킨다.
 */
export const MIN_W = 7 * S;
/** 공 반지름. */
export const BALL_R = 6;

export interface PlinkoBoard {
  count: number;
  rows: number;
  /** 판 폭 · 칸 하나 폭 · 줄 간격 · 핀 판 아래 끝(칸 벽 아래 끝). */
  W: number;
  slotW: number;
  rowH: number;
  boardH: number;
  /** 이름표 띠 높이 — 판 폭 360 을 360px 로 볼 때 72px 가 되게 판 폭에 비례한다. */
  labelH: number;
  /** 그림 전체 높이(머리 띠 + 판 + 이름표 띠). */
  totalH: number;
  cx: number;
}

export function plinkoBoard(count: number): PlinkoBoard {
  const n = Math.max(1, count);
  const rows = Math.max(0, n - 1);
  const W = Math.max(n * S, MIN_W);
  const slotW = W / n;
  const rowH = (H * slotW) / S;
  const boardH = TOP + rows * rowH + S;
  const labelH = (72 * W) / 360;
  return { count: n, rows, W, slotW, rowH, boardH, labelH, totalH: HEAD + boardH + labelH, cx: W / 2 };
}

export const pinX = (b: PlinkoBoard, r: number, j: number) => b.cx + (j - r / 2) * b.slotW;
export const pinY = (_b: PlinkoBoard, r: number) => TOP + r * _b.rowH;
/** 칸 k 가운데 · 칸 바닥에 놓인 공 높이 · 칸 벽 위 끝. */
export const slotX = (b: PlinkoBoard, k: number) => (k + 0.5) * b.slotW;
export const restY = (b: PlinkoBoard) => b.boardH - BALL_R - 1;
export const wallTop = (b: PlinkoBoard) => b.boardH - S;
/** 드로퍼 입구(공을 물고 있는 자리). */
export const dropY = -BALL_R - 2;

/* ───────── 공 움직임 ───────── */

export interface Pt {
  x: number;
  y: number;
}

/**
 * 공 움직임 한 토막. hold 는 제자리(흔들림 wob), fall 은 점점 빨라지는 낙하,
 * arc 는 핀에 튕겨 h 만큼 솟았다가 다음 자리에 닿는 포물선, roll 은 벽 위를 굴러가기.
 */
export interface Seg {
  t0: number;
  t1: number;
  kind: 'hold' | 'fall' | 'arc' | 'roll';
  from: Pt;
  to: Pt;
  h?: number;
  wob?: number;
}

export interface Track {
  /** 이 공이 떨어지는 칸. 진짜 공은 언제나 winnerIndex. */
  slot: number;
  /** 드로퍼에서 나오는 시각. 그 전에는 화면에 없다(가짜 공) — 진짜 공은 0 부터 드로퍼에 있다. */
  start: number;
  segs: Seg[];
  /** 칸 바닥에 닿은 시각. */
  landMs: number;
}

const ease = (f: number) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);

/** ms 시각의 공 자리. 아직 나오지 않은 공은 null. */
export function ballAt(track: Track, ms: number): Pt | null {
  if (ms < track.start) return null;
  const segs = track.segs;
  const seg = segs.find((s) => ms < s.t1) ?? null;
  if (!seg) return segs[segs.length - 1].to;
  const f = Math.max(0, Math.min(1, (ms - seg.t0) / Math.max(1, seg.t1 - seg.t0)));
  const { from: a, to: b } = seg;
  switch (seg.kind) {
    case 'hold': {
      const w = seg.wob ?? 0;
      // 좌우로 흔들흔들 — 끝으로 갈수록 잦아든다.
      const dx = w * Math.sin(((ms - seg.t0) / 150) * Math.PI) * (1 - f * 0.4);
      return { x: a.x + (b.x - a.x) * ease(f) + dx, y: a.y + (b.y - a.y) * ease(f) };
    }
    case 'fall':
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f * f };
    case 'roll':
      return { x: a.x + (b.x - a.x) * ease(f), y: a.y + (b.y - a.y) * ease(f) };
    default: {
      const h = seg.h ?? 0;
      // 핀에 튕겨 솟았다가 다음 핀 위로 떨어진다.
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f * f - h * Math.sin(f * Math.PI) };
    }
  }
}

/* ───────── 한 판 각본 ───────── */

/**
 * 판에서 일어나는 일(상태 줄·큰 글씨가 이걸 읽는다).
 * intro 드로퍼가 좌우로 드르륵 · decoy 가짜 공이 먼저 떨어진다 · decoyLand 가짜 공이 칸에 들어감(꽝)
 * · hesitate 진짜 공이 입구에서 흔들 · fake 떨어질 듯 멈칫 · drop 톡! · perch 첫 핀 위에서 멈칫
 * · bump 범퍼 팡 · fall 내려가는 중 · slow 마지막 핀(슬로모션) · edge 칸 벽 위 아슬아슬 · land 골인.
 */
export type BeatKind =
  | 'intro'
  | 'decoy'
  | 'decoyLand'
  | 'hesitate'
  | 'fake'
  | 'drop'
  | 'perch'
  | 'bump'
  | 'fall'
  | 'slow'
  | 'edge'
  | 'land';

export interface Beat {
  at: number;
  kind: BeatKind;
  /** decoyLand: 가짜 공이 들어간 칸 · edge: 넘어갈 뻔한 이웃 칸 · land: 당첨 칸. */
  slot?: number;
  /** 가짜 공 다음의 hesitate 인가("진짜 공은 이거예요"). */
  afterDecoy?: boolean;
}

export interface Hit {
  at: number;
  row: number;
  pin: number;
  /** 0 = 진짜 공, 1.. = 가짜 공. */
  ball: number;
  bumper: boolean;
}

/** 카메라가 보는 곳. top 드로퍼 · all 판 전체 · ball 진짜 공. */
export interface CamKey {
  at: number;
  z: number;
  focus: 'top' | 'all' | 'ball';
}

export type Hesitate = 'wiggle' | 'fake' | 'perch';

export interface PlinkoPlan {
  winnerIndex: number;
  real: Track;
  decoys: Track[];
  hits: Hit[];
  /** 범퍼 핀 "줄-번호". 진짜 공 길에 0~2개, 판에 따라 길 밖 장식 1개. */
  bumpers: string[];
  beats: Beat[];
  cams: CamKey[];
  /** 드로퍼가 좌우로 움직이는 동안(처음 장면). */
  introMs: number;
  releaseMs: number;
  /** 슬로모션(마지막 핀들) 시작 · 칸에 닿음 · 끝(onSpinEnd). */
  slowMs: number;
  landMs: number;
  endMs: number;
  events: { decoys: number; hesitate: Hesitate; edge: boolean; bumperHits: number };
  /** 칸 벽 위에서 넘어갈 뻔한 이웃 칸(edge 일 때). */
  neighbour: number | null;
}

/** 끝 시각 상한 · 하한. */
export const MAX_END_MS = 7000;
export const MIN_END_MS = 4500;
/** 마지막 장면(칸 불 켜짐 · 꽃가루 · 카메라가 물러남)을 보여 주는 시간. */
export const SETTLE_MS = 900;
const RAMP = 380;

/** 사건 확률(판 번호 시드로 뽑는다). */
export const EDGE_CHANCE = 0.55;
export const DECOY_ONE = 0.24;
export const DECOY_TWO = 0.14;
export const FAKE_CHANCE = 0.34;
export const PERCH_CHANCE = 0.3;

const BOUNCE = 6;
const BUMP_H = 20;

interface Opts {
  decoys: number;
  hesitate: Hesitate;
  edge: boolean;
  step: number;
  slowStep: number;
  intro: number;
  hes: number;
  /** 0..1 — 줄이 많아 길이가 넘칠 때 장면마다 조금씩 줄인다(1 이면 가장 짧게). */
  squeeze: number;
}

/** squeeze 0 이면 a, 1 이면 b. */
const sq = (o: Opts, a: number, b: number) => Math.round(a + (b - a) * o.squeeze);

const shuffle = <T>(arr: T[], rng: () => number): T[] => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

/**
 * 판 하나의 각본. 당첨은 App 이 정했다 — 진짜 공의 꺾임 순서는 plinkoPath(winnerIndex) 라 언제나 그 칸에 들어간다.
 * 가짜 공은 당첨이 아닌 칸으로만 간다. 사건(가짜 공·멈칫·범퍼·아슬아슬)은 연출일 뿐 도착 칸을 바꾸지 않는다.
 * 후보가 한 곳뿐이면(판이 없다) null.
 */
export function plinkoPlan(count: number, winnerIndex: number, rng: () => number = Math.random): PlinkoPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const b = plinkoBoard(count);
  const path = plinkoPath(winnerIndex, count, rng);
  const hits = pinHits(path);

  // 사건 뽑기. 순서를 고정해 같은 판 번호면 같은 각본이다.
  const r1 = rng();
  const maxDecoys = count >= 12 ? 1 : Math.min(2, count - 1);
  const decoys = Math.min(maxDecoys, r1 < DECOY_TWO ? 2 : r1 < DECOY_TWO + DECOY_ONE ? 1 : 0);
  const r2 = rng();
  // 가짜 공이 나오는 판은 그게 입구 쪽 낚시라, 진짜 공은 짧게 망설이고 바로 떨어진다.
  const hesitate: Hesitate =
    decoys > 0 ? 'wiggle' : r2 < FAKE_CHANCE ? 'fake' : r2 < FAKE_CHANCE + PERCH_CHANCE && b.rows >= 2 ? 'perch' : 'wiggle';
  const edge = rng() < (count <= 3 ? 0.65 : EDGE_CHANCE);
  // 범퍼: 진짜 공이 지나는 핀 가운데 첫 줄·마지막 줄은 빼고 고른다.
  const r3 = rng();
  const wantBump = b.rows >= 5 ? (r3 < 0.15 ? 0 : r3 < 0.6 ? 1 : 2) : b.rows >= 3 ? (r3 < 0.25 ? 0 : 1) : r3 < 0.5 ? 1 : 0;
  const pool = shuffle(
    Array.from({ length: Math.max(0, b.rows - 2) }, (_, k) => k + 1),
    rng,
  );
  // 줄이 한두 줄뿐인 판은 첫 핀이 범퍼일 때가 있다 — 판이 심심하지 않게.
  if (b.rows <= 2 && r3 < 0.5) pool.push(0);
  // 범퍼 둘이 붙어 있으면 한 번에 두 번 튀어 읽기 어렵다.
  const bumperRows = pool.slice(0, wantBump).filter((r, k, arr) => k === 0 || Math.abs(r - arr[0]) > 1);
  const bumpers = bumperRows.map((r) => `${r}-${hits[r]}`);
  // 진짜 공 길에 없는 장식 범퍼 하나 — 어디에 맞을지 미리 읽히지 않게.
  if (b.rows >= 4) {
    const r = 1 + Math.floor(rng() * (b.rows - 2));
    const off = Array.from({ length: r + 1 }, (_, j) => j).filter((j) => j !== hits[r]);
    if (off.length) bumpers.push(`${r}-${off[Math.floor(rng() * off.length)]}`);
  }
  const target = 5500 + rng() * 900;
  // 가짜 공이 갈 칸(당첨이 아닌 곳).
  const others = shuffle(
    Array.from({ length: count }, (_, k) => k).filter((k) => k !== winnerIndex),
    rng,
  );
  const decoyPaths = others.slice(0, 2).map((slot) => ({ slot, hits: pinHits(plinkoPath(slot, count, rng)) }));

  // 길이 맞추기: 한 줄 시간을 늘이고 줄여 목표 길이에 맞춘다. 그래도 넘치면 가짜 공을 줄인다.
  const build = (o: Opts) => assemble(b, winnerIndex, hits, decoyPaths.slice(0, o.decoys), bumpers, o);
  const slowFrom = Math.max(1, b.rows - 2);
  const slowArcs = Math.max(0, b.rows - slowFrom) + 1;
  const normalArcs = Math.max(0, slowFrom - 1);
  let o: Opts = { decoys, hesitate, edge, step: 160, slowStep: 480, intro: 950, hes: decoys ? 450 : 700, squeeze: 0 };
  for (;;) {
    const base = build({ ...o, step: 0 });
    const room = target - base.endMs;
    if (normalArcs > 0) o = { ...o, step: Math.max(sq(o, 80, 60), Math.min(300, room / normalArcs)) };
    else o = { ...o, slowStep: Math.max(480, Math.min(1000, 480 + room / slowArcs)) };
    let plan = build(o);
    if (plan.endMs < MIN_END_MS + 150) {
      // 후보가 적으면 줄이 적다 — 드로퍼 장면과 입구 망설임을 늘린다.
      const d = MIN_END_MS + 150 - plan.endMs;
      o = { ...o, intro: o.intro + d * 0.5, hes: o.hes + d * 0.5 };
      plan = build(o);
    }
    if (plan.endMs <= MAX_END_MS) return plan;
    // 넘치면 장면을 줄이고, 그래도 넘치면 가짜 공을 하나씩 뺀다.
    if (o.squeeze < 1) o = { ...o, squeeze: Math.min(1, o.squeeze + 0.5) };
    else if (o.decoys > 0) o = { ...o, decoys: o.decoys - 1 };
    else return plan;
  }
}

function assemble(
  b: PlinkoBoard,
  winnerIndex: number,
  hits: number[],
  decoyPaths: { slot: number; hits: number[] }[],
  bumpers: string[],
  o: Opts,
): PlinkoPlan {
  const beats: Beat[] = [];
  const allHits: Hit[] = [];
  const cams: CamKey[] = [];
  const top: Pt = { x: b.cx, y: dropY };
  const isBump = (r: number, j: number) => bumpers.includes(`${r}-${j}`);
  const pinTop = (r: number, j: number): Pt => ({ x: pinX(b, r, j), y: pinY(b, r) - BALL_R - 1 });
  const rows = b.rows;

  beats.push({ at: 0, kind: 'intro' });
  cams.push({ at: 0, z: 2.3, focus: 'top' });
  let t = Math.round(o.decoys ? sq(o, 750, 550) : sq(o, o.intro, 600));
  const introMs = t;

  // 가짜 공 — 드로퍼가 먼저 뱉는다. 판 전체를 보여 주고 빠르게 떨어진다.
  const decoys: Track[] = decoyPaths.map((d, k) => {
    const start = t + 120 + k * 420;
    const dstep = Math.round(Math.max(sq(o, 55, 40), Math.min(150, 760 / Math.max(1, rows))));
    const segs: Seg[] = [];
    let at = start;
    let prev = top;
    if (rows > 0) {
      const p0 = pinTop(0, d.hits[0]);
      segs.push({ t0: at, t1: at + 200, kind: 'fall', from: prev, to: p0 });
      at += 200;
      allHits.push({ at, row: 0, pin: d.hits[0], ball: k + 1, bumper: isBump(0, d.hits[0]) });
      prev = p0;
      for (let r = 1; r < rows; r += 1) {
        const p = pinTop(r, d.hits[r]);
        const h = isBump(r - 1, d.hits[r - 1]) ? BUMP_H * 0.6 : BOUNCE;
        segs.push({ t0: at, t1: at + dstep, kind: 'arc', from: prev, to: p, h });
        at += dstep;
        allHits.push({ at, row: r, pin: d.hits[r], ball: k + 1, bumper: isBump(r, d.hits[r]) });
        prev = p;
      }
    }
    const end = { x: slotX(b, d.slot), y: restY(b) };
    segs.push({ t0: at, t1: at + 240, kind: 'arc', from: prev, to: end, h: BOUNCE });
    at += 240;
    beats.push({ at, kind: 'decoyLand', slot: d.slot });
    return { slot: d.slot, start, segs, landMs: at };
  });
  if (decoys.length) {
    beats.push({ at: t, kind: 'decoy' });
    cams.push({ at: t, z: 1, focus: 'all' });
    t = Math.max(...decoys.map((d) => d.landMs)) + sq(o, 750, 500);
  }

  // 진짜 공 — 입구에서 망설인다.
  const segs: Seg[] = [{ t0: 0, t1: t, kind: 'hold', from: top, to: top, wob: 0 }];
  beats.push({ at: t, kind: 'hesitate', afterDecoy: decoys.length > 0 });
  if (decoys.length) cams.push({ at: t, z: 2.3, focus: 'top' });
  const hes = Math.round((o.hesitate === 'perch' ? o.hes * 0.6 : o.hes) * (1 - 0.25 * o.squeeze));
  if (o.hesitate === 'fake') {
    // 흔들흔들 → 쑥 빠질 뻔 → 멈칫 → 다시 올라가 흔들 → 톡.
    const dip: Pt = { x: top.x, y: top.y + 7 };
    const a = t + Math.round(hes * 0.5);
    segs.push({ t0: t, t1: a, kind: 'hold', from: top, to: top, wob: 1.8 });
    segs.push({ t0: a, t1: a + 110, kind: 'fall', from: top, to: dip });
    beats.push({ at: a + 110, kind: 'fake' });
    segs.push({ t0: a + 110, t1: a + 520, kind: 'hold', from: dip, to: dip, wob: 0.6 });
    segs.push({ t0: a + 520, t1: a + 760, kind: 'roll', from: dip, to: top });
    t = a + 760 + Math.round(hes * 0.5);
    segs.push({ t0: a + 760, t1: t, kind: 'hold', from: top, to: top, wob: 2.4 });
  } else {
    segs.push({ t0: t, t1: t + hes, kind: 'hold', from: top, to: top, wob: 2.2 });
    t += hes;
  }
  const releaseMs = t;
  beats.push({ at: t, kind: 'drop' });
  cams.push({ at: t, z: 1.75, focus: 'ball' });

  /** 이 줄로 들어가는 토막부터 슬로모션 — 마지막 두 줄과 칸. */
  const slowFrom = Math.max(1, rows - 2);
  let slowMs = -1;
  const markSlow = () => {
    if (slowMs >= 0) return;
    slowMs = t;
    beats.push({ at: t, kind: 'slow' });
    cams.push({ at: t, z: 2.4, focus: 'ball' });
  };
  let prev = top;
  let bumperHits = 0;
  if (rows === 1) {
    // 핀이 한 줄뿐이면 톡! 을 잠깐 보여 준 뒤 바로 슬로모션.
    t += 250;
    markSlow();
    t -= 250;
  }
  if (rows > 0) {
    const p0 = pinTop(0, hits[0]);
    const d0 = rows === 1 ? Math.round(o.slowStep * 0.8) : 300;
    segs.push({ t0: t, t1: t + d0, kind: 'fall', from: prev, to: p0 });
    t += d0;
    allHits.push({ at: t, row: 0, pin: hits[0], ball: 0, bumper: isBump(0, hits[0]) });
    if (isBump(0, hits[0])) {
      bumperHits += 1;
      beats.push({ at: t, kind: 'bump' });
    }
    prev = p0;
    if (o.hesitate === 'perch') {
      beats.push({ at: t, kind: 'perch' });
      const perch = sq(o, 820, 600);
      segs.push({ t0: t, t1: t + perch, kind: 'hold', from: p0, to: p0, wob: 1.4 });
      t += perch;
      beats.push({ at: t, kind: 'fall' });
    }
    for (let r = 1; r < rows; r += 1) {
      const slow = r >= slowFrom;
      if (slow) markSlow();
      const bumped = isBump(r - 1, hits[r - 1]);
      const p = pinTop(r, hits[r]);
      const d = Math.round((slow ? o.slowStep * (1 - 0.15 * o.squeeze) : o.step) + (bumped ? 200 : 0));
      segs.push({ t0: t, t1: t + d, kind: 'arc', from: prev, to: p, h: bumped ? BUMP_H : BOUNCE * (slow ? 1.4 : 1) });
      t += d;
      const bump = isBump(r, hits[r]);
      allHits.push({ at: t, row: r, pin: hits[r], ball: 0, bumper: bump });
      if (bump) {
        bumperHits += 1;
        beats.push({ at: t, kind: 'bump' });
        if (!slow) beats.push({ at: t + 520, kind: 'fall' });
      }
      prev = p;
    }
  }
  markSlow();

  // 마지막: 칸 벽 위에서 아슬아슬하거나, 바로 칸에 쏙.
  const lastPin = rows > 0 ? hits[rows - 1] : 0;
  const divX = (lastPin + 1) * b.slotW;
  const neighbour = winnerIndex === lastPin + 1 ? lastPin : lastPin + 1;
  const rest: Pt = { x: slotX(b, winnerIndex), y: restY(b) };
  const edge = o.edge && rows > 0;
  const lastBumped = rows > 0 && isBump(rows - 1, lastPin);
  if (edge) {
    const onWall: Pt = { x: divX, y: wallTop(b) - BALL_R };
    const lean = Math.sign(slotX(b, neighbour) - divX);
    const tip: Pt = { x: divX + lean * BALL_R * 0.8, y: onWall.y + 1.2 };
    const back: Pt = { x: divX - lean * BALL_R * 0.6, y: onWall.y + 0.5 };
    const dFall = Math.round(o.slowStep * 0.8);
    segs.push({ t0: t, t1: t + dFall, kind: 'fall', from: prev, to: onWall });
    t += dFall;
    beats.push({ at: t, kind: 'edge', slot: neighbour });
    // 이웃 칸 쪽으로 데굴 → 버틴다(흔들) → 되돌아 굴러 당첨 칸으로.
    const roll = sq(o, 420, 380);
    const teeter = roll + sq(o, 520, 320);
    const backAt = teeter + sq(o, 300, 260);
    segs.push({ t0: t, t1: t + roll, kind: 'roll', from: onWall, to: tip });
    segs.push({ t0: t + roll, t1: t + teeter, kind: 'hold', from: tip, to: tip, wob: 0.9 });
    segs.push({ t0: t + teeter, t1: t + backAt, kind: 'roll', from: tip, to: back });
    t += backAt;
    segs.push({ t0: t, t1: t + 360, kind: 'fall', from: back, to: rest });
    t += 360;
  } else {
    const d = Math.round(o.slowStep * 1.1);
    segs.push({ t0: t, t1: t + d, kind: 'arc', from: prev, to: rest, h: lastBumped ? BUMP_H : BOUNCE * 1.6 });
    t += d;
  }
  const landMs = t;
  beats.push({ at: t, kind: 'land', slot: winnerIndex });
  cams.push({ at: t + 120, z: 1, focus: 'all' });
  const endMs = t + sq(o, SETTLE_MS, 750);
  // 범퍼 뒤 "내려가는 중" 이 슬로모션 안으로 넘어가면 "두근두근" 을 덮는다 — 뺀다.
  const story = beats.filter((x) => x.kind !== 'fall' || x.at < slowMs);
  story.sort((x, y) => x.at - y.at);
  allHits.sort((x, y) => x.at - y.at);

  return {
    winnerIndex,
    real: { slot: winnerIndex, start: 0, segs, landMs },
    decoys,
    hits: allHits,
    bumpers,
    beats: story,
    cams,
    introMs,
    releaseMs,
    slowMs,
    landMs,
    endMs,
    events: { decoys: decoys.length, hesitate: o.hesitate, edge, bumperHits },
    neighbour: edge ? neighbour : null,
  };
}

/** ms 시각의 사건(가장 최근 것)과 그 번호. */
export function beatAt(plan: PlinkoPlan, ms: number): { beat: Beat; index: number } | null {
  let idx = -1;
  for (let k = 0; k < plan.beats.length; k += 1) if (plan.beats[k].at <= ms) idx = k;
  return idx < 0 ? null : { beat: plan.beats[idx], index: idx };
}

/**
 * 카메라 — 그림 전체(머리 띠 + 판 + 이름표 띠) 기준 % 로 바라보는 점과 배율.
 * 장면이 바뀌면 RAMP 동안 부드럽게 옮겨 간다.
 */
export function cameraAt(plan: PlinkoPlan, b: PlinkoBoard, ms: number): { fx: number; fy: number; z: number } {
  const resolve = (k: CamKey) => {
    let p: Pt;
    if (k.focus === 'top') p = { x: b.cx, y: dropY + 6 };
    else if (k.focus === 'all') p = { x: b.cx, y: b.totalH / 2 - HEAD };
    else p = ballAt(plan.real, ms) ?? { x: b.cx, y: dropY };
    // 판 폭이 좁으면(후보가 적으면) 그림이 이미 크게 그려진다 — 그만큼 덜 당긴다.
    const k2 = Math.max(0.45, Math.min(1, b.W / 360));
    return { fx: (p.x / b.W) * 100, fy: ((p.y + HEAD) / b.totalH) * 100, z: 1 + (k.z - 1) * k2 };
  };
  let i = 0;
  for (let k = 0; k < plan.cams.length; k += 1) if (plan.cams[k].at <= ms) i = k;
  const cur = resolve(plan.cams[i]);
  if (i === 0) return cur;
  const f = Math.max(0, Math.min(1, (ms - plan.cams[i].at) / RAMP));
  if (f >= 1) return cur;
  const prev = resolve(plan.cams[i - 1]);
  const e = ease(f);
  return { fx: prev.fx + (cur.fx - prev.fx) * e, fy: prev.fy + (cur.fy - prev.fy) * e, z: prev.z + (cur.z - prev.z) * e };
}

/** 카메라 transform 값(translate %, scale). 판 밖이 보이지 않게 가장자리에서 멈춘다. */
export function cameraTransform(fx: number, fy: number, z: number): { tx: number; ty: number; z: number } {
  const clamp = (v: number) => Math.max(100 - 100 * z, Math.min(0, v));
  return { tx: clamp(50 - fx * z), ty: clamp(50 - fy * z), z };
}

/** 드로퍼 x — 처음 장면에서 좌우로 드르륵 오갔다가 가운데로 돌아온다. */
export function dropperX(plan: PlinkoPlan | null, b: PlinkoBoard, ms: number): number {
  if (!plan || ms >= plan.introMs) return b.cx;
  const f = ms / plan.introMs;
  const amp = Math.min(b.W * 0.3, b.slotW * 2.5);
  return b.cx + amp * Math.sin(f * Math.PI * 2) * (1 - f);
}
