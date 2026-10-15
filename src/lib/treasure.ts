/**
 * 보물찾기 — 해적 섬 지도 위 X 표시마다 가게 이름이 붙어 있고, 꼬마 해적이 삽을 들고 X 를 하나씩 판다.
 * 보물 상자가 나온 곳이 당첨이다. 마지막으로 판 곳에서만 진짜 보물이 나온다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 X 자리(후보 수마다 한 번)와, 판 번호 run 시드로
 * 앞서 파 볼 가짜 자리·사건·시각만 정한다. 마지막 구덩이는 언제나 winnerIndex 이고,
 * 앞의 구덩이는 언제나 당첨이 아닌 곳이다 — 꽝·낡은 장화·동전 한 닢·미믹.
 * 앵무새의 가짜 힌트·돌풍·꽃게·"더 깊이" 는 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 좌표는 지도 상자의 % 다(x 는 폭, y 는 높이 기준). 위 띠에 제목·나침반, 가운데에 X 격자,
 * 아래 띠(모래사장)에서 해적이 출발한다. 15곳이 휴대폰(390px)에서도 이름표가 겹치지 않아야 한다.
 */

/* ───────── 지도 배치 ───────── */

/** 위 띠 · X 한 줄 · 아래 띠 높이(단위 u = 칸 폭). */
const TOP_U = 0.42;
const ROW_U = 0.9;
const BOTTOM_U = 0.72;
/** 이름표 폭(칸 폭에 곱함). 같은 줄 이웃은 이보다 멀리 둔다. */
export const TAG_W = 0.84;
/** 자리 흔들림(칸 폭·줄 높이에 곱함, 한쪽). 이름표가 겹치지 않을 만큼만 — 지도가 격자처럼 보이지 않게. */
const JITTER_X = 0.06;
const JITTER_Y = 0.1;

export interface Spot {
  /** X 가운데(%, x 는 폭·y 는 높이 기준). */
  x: number;
  y: number;
  /** X 기울기(도) — 손으로 그은 느낌. */
  tilt: number;
}

export interface MapLayout {
  cols: number;
  rows: number;
  /** 지도 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css). */
  aspect: number;
  /** 칸 폭(지도 폭의 %). 이름표 폭은 이것의 TAG_W. */
  cellW: number;
  /** X 크기(지도 폭의 %). */
  size: number;
  spots: Spot[];
  /** 해적이 출발하는 모래사장 자리. */
  start: { x: number; y: number };
  /** 위 띠 아래 끝 · 아래 띠 위 끝(높이 %). 배경을 그리는 데 쓴다. */
  top: number;
  beach: number;
}

/** 열 수. 15곳이면 4열 — 390px 에서 칸 폭이 90px 쯤이라 이름표 여섯 글자가 들어간다. */
export function mapColumns(count: number): number {
  if (count <= 3) return Math.max(1, count);
  if (count === 4) return 2;
  if (count <= 6) return 3;
  if (count <= 16) return 4;
  return 5;
}

/** X 자리. 같은 rng 면 같은 지도다. */
export function treasureLayout(count: number, rng: () => number = Math.random): MapLayout {
  const cols = mapColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  // 칸은 2.5열보다 크게 하지 않는다 — 두 곳이면 X 가 지도 절반을 덮는다.
  const u = 1 / Math.max(cols, 2.5);
  const heightU = TOP_U + rows * ROW_U + BOTTOM_U;
  const aspect = 1 / (heightU * u);
  const cellW = 100 / cols;
  const spots: Spot[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const c = i - r * cols;
    const x0 = (100 - inRow * cellW) / 2 + (c + 0.5) * cellW;
    spots.push({
      x: x0 + (rng() - 0.5) * 2 * JITTER_X * cellW,
      y: ((TOP_U + (r + 0.4 + (rng() - 0.5) * 2 * JITTER_Y) * ROW_U) / heightU) * 100,
      tilt: Math.round((rng() - 0.5) * 16),
    });
  }
  return {
    cols,
    rows,
    aspect,
    cellW,
    size: u * 100 * 0.3,
    spots,
    start: { x: 50, y: ((heightU - BOTTOM_U * 0.42) / heightU) * 100 },
    top: (TOP_U / heightU) * 100,
    beach: ((heightU - BOTTOM_U) / heightU) * 100,
  };
}

/** 해적이 X 왼쪽에 서서 판다 — 삽 끝이 X 에 닿는 자리(%). */
export function standAt(layout: MapLayout, spot: number): { x: number; y: number } {
  const s = layout.spots[spot];
  return { x: s.x - layout.cellW * 0.2, y: s.y + layout.size * 0.25 * layout.aspect };
}

/* ───────── 구덩이 일정 ───────── */

/**
 * 판 구덩이에서 나온 것.
 * empty 꽝 · boot 낡은 장화 · coin 상자에 동전 한 닢(아깝다) · mimic 상자인 줄 알았더니 미믹 · treasure 진짜 보물(마지막).
 */
export type DigKind = 'empty' | 'boot' | 'coin' | 'mimic' | 'treasure';
export type FakeKind = Exclude<DigKind, 'treasure'>;

/**
 * 구덩이 하나의 장면 순서. 있는 것만 차례로 온다.
 * parrot 앵무새가 가짜 힌트 · gust 돌풍에 지도가 날아갔다 돌아옴 · walk 걸어감 · dig 파바박
 * · crab 꽃게가 집음 · deep 텅 빈 줄 알았는데 더 판다(마지막만) · reveal 나온 것 · open 보물 상자가 열림(마지막만).
 */
export type DigPhase = 'parrot' | 'gust' | 'walk' | 'dig' | 'crab' | 'deep' | 'reveal' | 'open';

export interface Dig {
  /** 판 X(후보 인덱스). */
  spot: number;
  kind: DigKind;
  /** 앵무새가 "저기예요!" 하고 이 가짜 자리를 가리킨다(가짜 구덩이에만). */
  parrot: boolean;
  /** 걷기 전에 돌풍이 분다. */
  gust: boolean;
  /** 파다가 꽃게에게 집힌다(가짜 구덩이에만). */
  crab: boolean;
  /** 텅 빈 줄 알았는데 한 번 더 판다(마지막만). */
  deep: boolean;
  /** 걷는 길이 휘는 정도(직선 거리에 곱함, 부호는 방향). */
  bend: number;
  /** 장면 시작 시각(판 시작 기준 ms). 순서대로이고, 없는 장면은 넣지 않는다. */
  phases: { phase: DigPhase; ms: number }[];
  startMs: number;
  walkMs: number;
  digMs: number;
  revealMs: number;
  endMs: number;
}

export interface TreasurePlan {
  digs: Dig[];
  /** 마지막 상자가 열린 뒤 카메라가 물러나고 동전이 쏟아지는 때. */
  settleMs: number;
  /** 여기서 onSpinEnd 를 부른다. */
  endMs: number;
}

/** 지도가 펼쳐지고 X 가 떨어지는 인트로. */
export const INTRO_MS = 700;
export const PARROT_MS = 520;
export const GUST_MS = 460;
export const DIG_MS = 380;
export const FINAL_DIG_MS = 560;
export const CRAB_MS = 360;
export const DEEP_MS = 540;
/** 나온 것을 보여 주는 시간 — 사건이 읽힐 만큼. */
export const REVEAL_MS: Record<FakeKind, number> = { empty: 440, boot: 480, coin: 560, mimic: 600 };
const GAP_MS = 60;
/** 마지막: 상자가 솟음 → 뚜껑이 열리며 금빛 → 카메라가 물러나며 동전이 쏟아짐. */
export const RISE_MS = 340;
export const OPEN_MS = 460;
export const SETTLE_MS = 480;
/** 한 판 상한. 이걸 넘으면 덧붙인 사건(꽃게 → 돌풍 → 앵무새 → 더 깊이)부터 뺀다. */
export const MAX_MS = 7150;

/** 가짜 구덩이에서 나올 것의 가중치. 같은 것은 연달아 나오지 않는다. */
export const FAKE_WEIGHTS: [FakeKind, number][] = [
  ['empty', 0.24],
  ['boot', 0.22],
  ['coin', 0.26],
  ['mimic', 0.28],
];
/** 상자가 나오는(아깝다) 가짜 — 판마다 적어도 하나는 있다. */
export const NEAR_WIN: FakeKind[] = ['coin', 'mimic'];
export const PARROT_CHANCE = 0.45;
export const GUST_CHANCE = 0.4;
export const CRAB_CHANCE = 0.35;
export const DEEP_CHANCE = 0.35;
/** 두 곳이면 가짜 구덩이가 하나뿐이라 덧붙인 사건을 적어도 이만큼 넣는다. */
const MIN_EXTRAS_FOR_TWO = 2;

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

function weighted<T>(items: [T, number][], rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

/** 두 자리 사이 거리(지도 폭 % 단위). y 는 높이 % 라 aspect 로 나눠 폭 단위로 바꾼다. */
function dist(layout: MapLayout, a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, (b.y - a.y) / layout.aspect);
}

/** 걷는 시간 — 멀수록 조금 길다. */
export function walkDuration(d: number, final: boolean): number {
  return Math.round(Math.min(500, Math.max(320, 260 + d * 3.5)) + (final ? 60 : 0));
}

interface Draft {
  spot: number;
  kind: DigKind;
  parrot: boolean;
  gust: boolean;
  crab: boolean;
  deep: boolean;
  bend: number;
}

/** 초안에 시각을 붙인다. */
function schedule(layout: MapLayout, drafts: Draft[]): TreasurePlan {
  const digs: Dig[] = [];
  let t = INTRO_MS;
  let from = layout.start;
  drafts.forEach((d, k) => {
    const final = d.kind === 'treasure';
    const phases: { phase: DigPhase; ms: number }[] = [];
    const startMs = t;
    if (d.parrot) {
      phases.push({ phase: 'parrot', ms: t });
      t += PARROT_MS;
    }
    if (d.gust) {
      phases.push({ phase: 'gust', ms: t });
      t += GUST_MS;
    }
    const to = standAt(layout, d.spot);
    const walkMs = t;
    phases.push({ phase: 'walk', ms: t });
    t += walkDuration(dist(layout, from, to), final);
    const digMs = t;
    phases.push({ phase: 'dig', ms: t });
    t += final ? FINAL_DIG_MS : DIG_MS;
    if (d.crab) {
      phases.push({ phase: 'crab', ms: t });
      t += CRAB_MS;
    }
    if (d.deep) {
      phases.push({ phase: 'deep', ms: t });
      t += DEEP_MS;
    }
    const revealMs = t;
    phases.push({ phase: 'reveal', ms: t });
    if (final) {
      t += RISE_MS;
      phases.push({ phase: 'open', ms: t });
      t += OPEN_MS;
    } else {
      t += REVEAL_MS[d.kind as FakeKind] + GAP_MS;
    }
    digs.push({ ...d, phases, startMs, walkMs, digMs, revealMs, endMs: k === drafts.length - 1 ? t + SETTLE_MS : t });
    from = to;
  });
  const settleMs = t;
  return { digs, settleMs, endMs: settleMs + SETTLE_MS };
}

/**
 * 구덩이 순서·사건·시각.
 *
 * 1) 가짜 구덩이: 세 곳 이상이면 둘, 두 곳이면 하나. 자리는 당첨이 아닌 곳에서 서로 다르게 고른다.
 *    나올 것은 FAKE_WEIGHTS 에서 뽑고(연달아 같은 것 없음), 판마다 상자(동전 한 닢·미믹)가 적어도 하나 나온다.
 * 2) 마지막 구덩이는 winnerIndex — 진짜 보물. DEEP_CHANCE 로 "텅 빈 줄 알았는데 더 판다".
 * 3) 앵무새·돌풍·꽃게는 확률로 덧붙인다. 두 곳이면 적어도 둘. 길이가 MAX_MS 를 넘으면 꽃게부터 뺀다.
 * 4) 길이: 계산으로 약 5.1~7.15초 — 시험(treasure.test.ts)이 모든 조합을 돌려 확인한다.
 * 5) 한 곳뿐이면 null — 팔 것 없이 바로 보물을 보인다.
 */
export function treasurePlan(layout: MapLayout, winnerIndex: number, rng: () => number = Math.random): TreasurePlan | null {
  const count = layout.spots.length;
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) others.push(i);

  const fakes = count >= 3 ? 2 : 1;
  const pool = [...others];
  const drafts: Draft[] = [];
  let prev: FakeKind | null = null;
  for (let k = 0; k < fakes; k += 1) {
    const spot = pool.splice(Math.min(pool.length - 1, Math.floor(rng() * pool.length)), 1)[0];
    let kind = weighted(FAKE_WEIGHTS.filter(([f]) => f !== prev), rng);
    // 마지막 가짜까지 상자가 없었으면 상자로 — 아깝다 장면이 판마다 하나는 있게.
    if (k === fakes - 1 && !drafts.some((d) => NEAR_WIN.includes(d.kind as FakeKind)) && !NEAR_WIN.includes(kind)) {
      kind = pick(NEAR_WIN.filter((f) => f !== prev), rng);
    }
    drafts.push({ spot, kind, parrot: false, gust: false, crab: false, deep: false, bend: (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.18) });
    prev = kind;
  }
  drafts.push({ spot: winnerIndex, kind: 'treasure', parrot: false, gust: false, crab: false, deep: false, bend: (rng() < 0.5 ? -1 : 1) * (0.12 + rng() * 0.18) });

  // 덧붙인 사건. 앵무새·꽃게는 가짜 구덩이에만(앵무새는 거짓말을 해야 재미있다), 돌풍은 아무 걸음에나.
  const fakeIdx = () => Math.floor(rng() * fakes);
  type Extra = 'parrot' | 'gust' | 'crab' | 'deep';
  const added: Extra[] = [];
  const add = (e: Extra) => {
    if (added.includes(e)) return;
    if (e === 'parrot') drafts[fakeIdx()].parrot = true;
    else if (e === 'crab') drafts[fakeIdx()].crab = true;
    else if (e === 'gust') drafts[Math.floor(rng() * drafts.length)].gust = true;
    else drafts[drafts.length - 1].deep = true;
    added.push(e);
  };
  if (rng() < PARROT_CHANCE) add('parrot');
  if (rng() < GUST_CHANCE) add('gust');
  if (rng() < CRAB_CHANCE) add('crab');
  if (rng() < DEEP_CHANCE) add('deep');
  if (count === 2) {
    const rest: Extra[] = (['parrot', 'gust', 'crab', 'deep'] as Extra[]).filter((e) => !added.includes(e));
    while (added.length < MIN_EXTRAS_FOR_TWO && rest.length) add(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
  }

  let plan = schedule(layout, drafts);
  for (const e of ['crab', 'gust', 'parrot', 'deep'] as Extra[]) {
    if (plan.endMs <= MAX_MS) break;
    if (!added.includes(e)) continue;
    for (const d of drafts) d[e] = false;
    plan = schedule(layout, drafts);
  }
  return plan;
}

/** 판 전체 장면 목록(시각 순). 컴포넌트가 이걸로 타이머를 건다. */
export function timeline(plan: TreasurePlan): { ms: number; dig: number; phase: DigPhase }[] {
  return plan.digs.flatMap((d, k) => d.phases.map((p) => ({ ms: p.ms, dig: k, phase: p.phase })));
}

/* ───────── 걷는 길 ───────── */

/** 걷는 길을 이만큼의 점으로 끊는다(CSS 키프레임 0·25·50·75·100%). */
export const PATH_STOPS = 5;

/** a 에서 b 까지 휘는 길(2차 베지어). 제어점은 가운데에서 직선에 수직으로 bend 만큼(폭 단위로 재서 되돌린다). */
export function walkControl(layout: MapLayout, a: { x: number; y: number }, b: { x: number; y: number }, bend: number) {
  const ax = a.x;
  const ay = a.y / layout.aspect;
  const bx = b.x;
  const by = b.y / layout.aspect;
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  // 수직 방향 (−dy, dx)
  const cx = mx - (by - ay) * bend;
  const cy = my + (bx - ax) * bend;
  return { x: cx, y: cy * layout.aspect };
}

/** 길 위의 점들(%). */
export function walkPath(layout: MapLayout, a: { x: number; y: number }, b: { x: number; y: number }, bend: number): { x: number; y: number }[] {
  const c = walkControl(layout, a, b, bend);
  const pts: { x: number; y: number }[] = [];
  for (let k = 0; k < PATH_STOPS; k += 1) {
    const t = k / (PATH_STOPS - 1);
    const m = 1 - t;
    pts.push({ x: m * m * a.x + 2 * m * t * c.x + t * t * b.x, y: m * m * a.y + 2 * m * t * c.y + t * t * b.y });
  }
  return pts;
}

/**
 * 카메라: 배율 zoom 으로 (x, y) 를 화면 가운데에 둔다. 가장자리 밖이 보이지 않게 가둔다.
 * 돌려주는 값은 CSS transform(translate %, scale) 의 두 수 — origin 0 0 기준.
 */
export function cameraAt(x: number, y: number, zoom: number): { tx: number; ty: number } {
  const half = 50 / zoom;
  const cx = Math.min(100 - half, Math.max(half, x));
  const cy = Math.min(100 - half, Math.max(half, y));
  return { tx: 50 - zoom * cx, ty: 50 - zoom * cy };
}
