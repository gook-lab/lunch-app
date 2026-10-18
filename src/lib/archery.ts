/**
 * 활쏘기 — 가게 이름표를 단 과녁들이 사로(射路)에 서 있고, 궁수가 화살 세 발을 쏜다.
 * 정중앙을 맞힌 과녁이 당첨이다. 마지막 화살만 정중앙에 꽂힌다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 과녁 자리·흔들림 박자와 화살 세 발의
 * 사건·시각·궤적만 정한다(판 번호 run 시드). 마지막 화살은 언제나 winnerIndex 의 정중앙이고,
 * 앞의 두 발은 정중앙에 꽂히지 않는다 — 다른 과녁 가장자리, 하늘, 땅, 또는 당첨 과녁의 정중앙 옆(아깝다).
 * 사건은 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 좌표는 사로 상자의 % 다(x 는 폭, y 는 높이 기준). 위쪽은 하늘 띠(빗나간 화살·새가 지나는 곳),
 * 가운데에 과녁 격자, 아래 띠에 궁수가 선다. 과녁은 격자 칸마다 하나씩 — 15곳이 휴대폰(390px)에서도
 * 이름표가 겹치지 않아야 한다.
 */

/* ───────── 사로 배치 ───────── */

/** 하늘 띠 · 과녁 한 줄 · 궁수 띠 높이(단위 u = 칸 폭). */
// 하늘 띠를 조금 덜어 과녁 줄 사이에 준다 — 두 줄 이름표가 아래 줄 과녁에 닿지 않게(10/18).
// 두 줄 사로 높이(0.36 + 0.89×2 + 1.05)는 전과 같아 판 비율·실행 단추 자리가 그대로다.
const SKY_U = 0.36;
const ROW_U = 0.89;
const ARCHER_U = 1.05;
/** 과녁 지름(칸 폭 u 에 곱함). 이름표는 칸 폭의 0.82 까지. */
const TARGET_U = 0.5;

export interface Target {
  /** 과녁 가운데(%, x 는 폭·y 는 높이 기준). */
  x: number;
  y: number;
  /** 좌우로 미끄러지는 폭(사로 폭의 %, 한쪽). 이 폭만큼은 화살이 어긋나 보여도 눈에 띄지 않는다. */
  slide: number;
  /** 한 번 오갔다 오는 시간(ms). */
  periodMs: number;
  /** 흔들림 박자를 어긋나게(ms, 0 이하). */
  delayMs: number;
}

export interface RangeLayout {
  cols: number;
  rows: number;
  /** 사로 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css). */
  aspect: number;
  /** 칸 폭(사로 폭의 %). 이름표 폭은 이것의 0.82. */
  cellW: number;
  /** 과녁 지름(사로 폭의 %). */
  size: number;
  targets: Target[];
  /** 활을 든 손(화살이 출발하는 곳). */
  bow: { x: number; y: number };
  /** 하늘 띠 아래 끝 · 사대(궁수가 서는 선) 높이(%). 배경을 그리는 데 쓴다. */
  sky: number;
  line: number;
}

/**
 * 열 수. 16곳까지는 4열 — 390px 에서 칸 폭이 90px 쯤이라 이름표 다섯 글자가 들어간다.
 * 적은 곳(1~4)도 4열 칸 크기로 한 줄에 가운데 둔다. 열을 줄이면 과녁이 커지며 사로가 세로로 길어져
 * 휴대폰 실행 단추가 탭 바에 가렸다(5~6곳·2~3곳, 10/18 리뷰).
 */
export function rangeColumns(count: number): number {
  return count <= 16 ? 4 : 5;
}

/** 과녁 줄 높이는 적어도 두 줄 — 1~4곳도 5~8곳과 같은 사로 비율이라 판 크기가 후보 수마다 출렁이지 않는다. */
const MIN_ROWS = 2;

/** 과녁 자리와 흔들림 박자. 같은 rng 면 같은 사로다. */
export function rangeLayout(count: number, rng: () => number = Math.random): RangeLayout {
  const cols = rangeColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  const u = 1 / cols;
  const bandRows = Math.max(rows, MIN_ROWS);
  // 줄이 모자라면(1~4곳) 과녁 줄을 띠 가운데로 내린다.
  const rowOffset = (bandRows - rows) / 2;
  const heightU = SKY_U + bandRows * ROW_U + ARCHER_U;
  const aspect = 1 / (heightU * u);
  const cellW = 100 / cols;
  const targets: Target[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const c = i - r * cols;
    const x0 = (100 - inRow * cellW) / 2 + (c + 0.5) * cellW;
    targets.push({
      x: x0 + (rng() - 0.5) * cellW * 0.06,
      // 과녁은 줄 위쪽에 — 아래에 두 줄 이름표가 들어갈 자리를 남긴다(10/18).
      y: ((SKY_U + (r + rowOffset + 0.28) * ROW_U) / heightU) * 100,
      slide: u * 100 * (0.025 + rng() * 0.02),
      periodMs: Math.round(2400 + rng() * 1600),
      delayMs: -Math.round(rng() * 3000),
    });
  }
  return {
    cols,
    rows,
    aspect,
    cellW,
    size: u * 100 * TARGET_U,
    targets,
    bow: { x: 50, y: ((heightU - ARCHER_U * 0.62) / heightU) * 100 },
    sky: (SKY_U / heightU) * 100,
    line: ((heightU - ARCHER_U) / heightU) * 100,
  };
}

/* ───────── 화살 세 발 ───────── */

/**
 * 화살 한 발의 사건.
 * plain 다른 과녁 가장자리에 꽂힘 · wind 바람에 휘어 옆 과녁에 꽂힘 · ricochet 과녁 테에 맞고 튕겨 나감
 * · miss 하늘로 날아감 · close 정중앙 바로 옆(아깝다!) · bullseye 정중앙(마지막) · split 정중앙 + 앞 화살을 쪼갬(마지막).
 */
export type ShotKind = 'plain' | 'wind' | 'ricochet' | 'miss' | 'close' | 'bullseye' | 'split';

export interface Shot {
  kind: ShotKind;
  /** 겨눈 과녁(후보 인덱스). 바람은 겨눈 곳과 꽂힌 곳이 다르다. */
  aim: number;
  /** 꽂힌 과녁. 튕겨 나가거나 하늘로 날아가면 null. */
  hit: number | null;
  /** 닿은 자리 — 과녁 가운데 기준, 과녁 반지름 단위(오른쪽·아래가 +). miss 는 겨눈 과녁 기준 방향만 쓴다. */
  dx: number;
  dy: number;
  /** 날아가는 동안 새가 지나간다(연출만). */
  bird: boolean;
  /** 활시위를 당기기 시작 · 놓음(푸슝) · 날기 시작 · 닿음 · 다음 발로 넘어감(마지막은 끝). 판 시작 기준 ms. */
  drawMs: number;
  releaseMs: number;
  flyMs: number;
  impactMs: number;
  endMs: number;
}

export interface ArcheryPlan {
  shots: Shot[];
  /** 마지막 화살이 꽂힌 뒤 카메라가 물러나고 꽃가루까지 — 여기서 onSpinEnd 를 부른다. */
  endMs: number;
}

/** 화살 수. 마지막 한 발만 정중앙이다. */
export const SHOTS = 3;
/** 활시위 당기기(컷신): 첫 발은 길게, 둘째는 짧게, 마지막은 다시 뜸을 들인다. */
const DRAW_MS = [700, 520, 720] as const;
/** 놓는 순간(푸슝 · 화면 흔들림). */
export const RELEASE_MS = 200;
/** 날아가는 시간. 바람은 휘는 만큼 조금 길고, 마지막은 슬로모션. */
export const FLY_MS = 520;
export const WIND_FLY_MS = 640;
export const FINAL_FLY_MS = 1050;
/** 닿은 뒤 머무는 시간 — 사건이 읽힐 만큼. */
const HOLD_MS: Record<Exclude<ShotKind, 'bullseye' | 'split'>, number> = {
  plain: 420,
  wind: 420,
  ricochet: 600,
  miss: 420,
  close: 560,
};
/** 다음 컷신으로 넘어가며 카메라가 물러나는 틈. */
const GAP_MS = 120;
/** 마지막: 명중 번쩍임 · 카메라가 물러나며 꽃가루. 로빈후드면 쪼개지는 장면만큼 더. */
export const FINAL_IMPACT_MS = 320;
const FINAL_SETTLE_MS = 420;
const SPLIT_EXTRA_MS = 200;

/** 앞 두 발 사건의 가중치(합 1). 같은 사건은 연달아 나오지 않는다. */
export const EVENT_WEIGHTS: [Exclude<ShotKind, 'bullseye' | 'split'>, number][] = [
  ['plain', 0.24],
  ['wind', 0.22],
  ['ricochet', 0.2],
  ['miss', 0.12],
  ['close', 0.22],
];
/** close(아깝다)가 당첨 과녁에서 일어날 확률. 나머지는 다른 과녁 — 아깝다가 곧 정답이면 김이 샌다. */
export const CLOSE_ON_WINNER = 0.5;
/** 당첨 과녁에 아깝다 화살이 있을 때 마지막 화살이 그걸 쪼갤(로빈후드) 확률. */
export const SPLIT_CHANCE = 0.5;
/** 바람이 당첨 과녁을 겨눴다가 옆으로 휘게 할 확률(겨눈 곳이 당첨이면 속는 맛이 있다). */
const WIND_FROM_WINNER = 0.5;
/** 앞 두 발 중 한 발에 새가 지나갈 확률. */
export const BIRD_CHANCE = 0.3;
/** 아깝다 화살이 정중앙에서 떨어진 거리(반지름 단위). 화살 깃이 정중앙에 걸칠 만큼 가깝다. */
export const CLOSE_R = 0.3;

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

/** 반지름 방향(각 rad)·거리로 과녁 위 자리. 위쪽(−y)을 조금 피한다 — 이름표가 아래라 아래쪽이 더 잘 보인다. */
function polar(rng: () => number, rMin: number, rMax: number): { dx: number; dy: number } {
  const a = rng() * Math.PI * 2;
  const r = rMin + rng() * (rMax - rMin);
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r };
}

/** 가장 가까운 과녁(제외 목록 밖). 배치를 몰라도 되게 격자 칸 거리로 잰다. */
function nearest(from: number, pool: number[], cols: number): number {
  const fr = Math.floor(from / cols);
  const fc = from % cols;
  let best = pool[0];
  let bestD = Infinity;
  for (const i of pool) {
    const d = Math.hypot(Math.floor(i / cols) - fr, (i % cols) - fc);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * 화살 세 발의 사건·시각.
 *
 * 1) 앞 두 발은 EVENT_WEIGHTS 에서 뽑는다. 같은 사건이 연달아 나오면 남은 것에서 다시 뽑는다.
 *    어느 사건도 당첨 과녁 정중앙에 꽂히지 않는다. close 만 당첨 과녁에 꽂힐 수 있는데(CLOSE_ON_WINNER),
 *    그때도 정중앙에서 CLOSE_R 떨어진 자리다.
 * 2) 마지막 한 발은 당첨 정중앙. 당첨 과녁에 close 화살이 있으면 SPLIT_CHANCE 로 그 화살을 쪼갠다(로빈후드).
 * 3) 길이: 계산으로 6.45~6.97초 — 시험(archery.test.ts)이 모든 조합을 돌려 확인한다.
 * 4) 한 곳뿐이면 null — 쏠 것 없이 바로 명중한 모습을 보인다.
 */
export function archeryPlan(count: number, winnerIndex: number, cols: number, rng: () => number = Math.random): ArcheryPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) others.push(i);

  const shots: Shot[] = [];
  const birdAt = rng() < BIRD_CHANCE ? (rng() < 0.5 ? 0 : 1) : -1;
  let t = 0;
  let prevKind: ShotKind | null = null;
  let prevHit = -1;
  let closeOnWinner = false;

  for (let k = 0; k < SHOTS - 1; k += 1) {
    const kind = weighted(EVENT_WEIGHTS.filter(([kd]) => kd !== prevKind), rng);
    // 앞 발과 다른 과녁을 고른다(두 곳이면 남은 한 곳뿐).
    const fresh = others.length > 1 ? others.filter((i) => i !== prevHit) : others;
    let aim = pick(fresh, rng);
    let hit: number | null = aim;
    let at = { dx: 0, dy: 0 };
    if (kind === 'plain') {
      at = polar(rng, 0.55, 0.8);
    } else if (kind === 'wind') {
      // 겨눈 곳에서 옆 과녁으로 휜다. 옆에 당첨이 아닌 과녁이 없으면(두 곳) 당첨을 겨눴다가 휜다.
      const fromWinner = rng() < WIND_FROM_WINNER;
      if (fromWinner || others.length < 2) aim = winnerIndex;
      const land = others.filter((i) => i !== aim);
      hit = nearest(aim, land, cols);
      at = polar(rng, 0.5, 0.78);
    } else if (kind === 'ricochet') {
      // 테(반지름 0.95)에 맞고 튕겨 나간다. 옆쪽 테라야 튕기는 방향이 잘 보인다.
      const side = rng() < 0.5 ? -1 : 1;
      at = { dx: side * 0.88, dy: -0.35 + rng() * 0.3 };
      hit = null;
    } else if (kind === 'miss') {
      at = { dx: (rng() - 0.5) * 1.6, dy: -1 };
      hit = null;
    } else {
      // close: 정중앙 바로 옆. 당첨 과녁이면 로빈후드의 씨앗이 된다.
      if (rng() < CLOSE_ON_WINNER) {
        aim = winnerIndex;
        hit = winnerIndex;
        closeOnWinner = true;
      }
      const a = rng() * Math.PI * 2;
      at = { dx: Math.cos(a) * CLOSE_R, dy: Math.sin(a) * CLOSE_R };
    }
    const drawMs = t;
    const releaseMs = drawMs + DRAW_MS[k];
    const flyMs = releaseMs + RELEASE_MS;
    const impactMs = flyMs + (kind === 'wind' ? WIND_FLY_MS : FLY_MS);
    const endMs = impactMs + HOLD_MS[kind] + GAP_MS;
    shots.push({ kind, aim, hit, dx: at.dx, dy: at.dy, bird: k === birdAt, drawMs, releaseMs, flyMs, impactMs, endMs });
    t = endMs;
    prevKind = kind;
    if (hit !== null) prevHit = hit;
  }

  const split = closeOnWinner && rng() < SPLIT_CHANCE;
  const drawMs = t;
  const releaseMs = drawMs + DRAW_MS[SHOTS - 1];
  const flyMs = releaseMs + RELEASE_MS;
  const impactMs = flyMs + FINAL_FLY_MS;
  const endMs = impactMs + FINAL_IMPACT_MS + (split ? SPLIT_EXTRA_MS : 0) + FINAL_SETTLE_MS;
  shots.push({
    kind: split ? 'split' : 'bullseye',
    aim: winnerIndex,
    hit: winnerIndex,
    dx: 0,
    dy: 0,
    bird: false,
    drawMs,
    releaseMs,
    flyMs,
    impactMs,
    endMs,
  });
  return { shots, endMs };
}

/** 마지막 화살이 닿은 뒤 카메라가 물러나기 시작하는 시각(명중 번쩍임·로빈후드가 끝난 때). */
export function settleMs(shot: Shot): number {
  return shot.impactMs + FINAL_IMPACT_MS + (shot.kind === 'split' ? SPLIT_EXTRA_MS : 0);
}

/* ───────── 궤적 ───────── */

export interface FlightPoint {
  /** 사로 안 자리(%). */
  x: number;
  y: number;
  /** 화살 방향(도, 위쪽이 0 · 시계 방향). */
  angle: number;
}

/** 궤적을 이만큼의 점으로 끊는다(CSS 키프레임 0·25·50·75·100%). */
export const FLIGHT_STOPS = 5;

/** 화살이 닿는 끝점(%). 빗나가면 사로 위쪽 밖. */
export function shotEnd(layout: RangeLayout, shot: Shot): { x: number; y: number } {
  const r = layout.size / 2;
  const base = layout.targets[shot.hit ?? shot.aim];
  if (shot.kind === 'miss') return { x: base.x + shot.dx * r * 2, y: -8 };
  // y 는 높이 % — 반지름(폭 %)을 높이 %로 바꾼다.
  return { x: base.x + shot.dx * r, y: base.y + shot.dy * r * layout.aspect };
}

/**
 * 활에서 끝점까지 궤적(2차 베지어를 FLIGHT_STOPS 점으로). 방향은 사로의 실제 가로세로 비로 잰다.
 * 바람은 처음엔 겨눈 과녁 쪽으로 가다가 끝에서 꽂힌 과녁으로 휜다. 나머지는 살짝 바깥으로 부푼 곧은 길.
 */
export function flightPath(layout: RangeLayout, shot: Shot): FlightPoint[] {
  const s = layout.bow;
  const e = shotEnd(layout, shot);
  const aim = layout.targets[shot.aim];
  const c =
    shot.kind === 'wind'
      ? { x: s.x + (aim.x - s.x) * 0.8, y: s.y + (aim.y - s.y) * 0.8 }
      : { x: (s.x + e.x) / 2 + (e.x >= s.x ? -2 : 2), y: (s.y + e.y) / 2 };
  const pts: FlightPoint[] = [];
  // 마지막 화살은 슬로모션 — 키프레임은 같은 간격이니 궤적 위 자리를 앞쪽에 몰아, 과녁 앞에서 느려지게 한다.
  const final = shot.kind === 'bullseye' || shot.kind === 'split';
  for (let k = 0; k < FLIGHT_STOPS; k += 1) {
    const lin = k / (FLIGHT_STOPS - 1);
    const t = final ? 1 - (1 - lin) ** 1.7 : lin;
    const m = 1 - t;
    const x = m * m * s.x + 2 * m * t * c.x + t * t * e.x;
    const y = m * m * s.y + 2 * m * t * c.y + t * t * e.y;
    // 접선 (폭 %, 높이 %) → 실제 비율: 높이 % 를 aspect 로 나눠 폭 단위로.
    const tx = 2 * m * (c.x - s.x) + 2 * t * (e.x - c.x);
    const ty = (2 * m * (c.y - s.y) + 2 * t * (e.y - c.y)) / layout.aspect;
    pts.push({ x, y, angle: (Math.atan2(tx, -ty) * 180) / Math.PI });
  }
  return pts;
}

/**
 * 카메라가 화살을 따라간다: 배율 zoom 으로 (x, y) 를 화면 가운데에 둔다. 가장자리 밖이 보이지 않게 가둔다.
 * 돌려주는 값은 CSS transform(translate %, scale) 의 두 수 — origin 0 0 기준.
 */
export function cameraAt(x: number, y: number, zoom: number): { tx: number; ty: number } {
  const half = 50 / zoom;
  const cx = Math.min(100 - half, Math.max(half, x));
  const cy = Math.min(100 - half, Math.max(half, y));
  return { tx: 50 - zoom * cx, ty: 50 - zoom * cy };
}
