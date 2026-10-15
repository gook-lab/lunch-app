/**
 * 승부차기 — 골문 입구를 가게 이름표를 단 구역으로 나누고, 키커가 공 세 개를 찬다.
 * 골망을 흔든 구역이 당첨이다. 마지막 슛만 들어간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 구역 자리와 슛 세 번의 사건·시각·궤적·골키퍼 동작만
 * 정한다(판 번호 run 시드). 마지막 슛은 언제나 winnerIndex 구역 골망에 꽂히고, 앞의 두 슛은 어떤 사건이든
 * 골이 되지 않는다 — 선방·골대·홈런·캐치·크로스바 맞고 라인 앞. 사건은 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 좌표는 경기장 상자의 % 다(x 는 폭, y 는 높이 기준). 위쪽 띠가 관중석, 그 아래 골문, 아래쪽 잔디에
 * 페널티 스폿과 키커(뒷모습)가 있다. 골문 입구는 줄마다 폭을 꽉 채우게 나눈다 — 15곳(5·5·5)도
 * 휴대폰(390px)에서 이름표 다섯 글자가 들어간다.
 */

/* ───────── 경기장 배치 ───────── */

/** 관중석 띠 · 잔디(골라인 아래) 높이(단위 u = 경기장 폭). */
const STANDS_U = 0.2;
const PITCH_U = 0.47;
/** 골문 입구 한 줄 높이 — 줄 수(1~4)마다. 한 줄이면 실제 골대 비(3:1)에 가깝게. */
const ROW_U = [0.27, 0.155, 0.13, 0.118] as const;
/** 골대 안쪽 왼쪽·오른쪽 끝(%). */
export const GOAL_L = 6;
export const GOAL_R = 94;

export interface Zone {
  /** 구역 가운데(%). */
  x: number;
  y: number;
  /** 구역 폭(폭 %) · 높이(높이 %). */
  w: number;
  h: number;
  row: number;
  col: number;
  /** 이 줄의 구역 수. */
  cols: number;
}

export interface PitchLayout {
  rows: number;
  /** 한 줄에 가장 많은 구역 수. 이름표 길이를 정하는 데 쓴다. */
  maxCols: number;
  /** 경기장 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css). */
  aspect: number;
  zones: Zone[];
  /** 골문 입구(%). top 이 크로스바 아래, bottom 이 골라인. */
  goal: { left: number; right: number; top: number; bottom: number };
  /** 관중석 아래 끝(높이 %). */
  stands: number;
  /** 페널티 스폿(공이 놓인 곳). */
  spot: { x: number; y: number };
  /** 골키퍼 발(골라인 가운데) · 키(폭 %). */
  keeper: { x: number; y: number; h: number };
}

/** 줄 수. 15곳이면 3줄(5·5·5). */
export function goalRows(count: number): number {
  if (count <= 3) return 1;
  if (count <= 8) return 2;
  if (count <= 15) return 3;
  return 4;
}

/** 구역 자리. 줄마다 구역 수를 고르게 나누고(앞줄이 하나 더) 줄 폭을 꽉 채운다. */
export function pitchLayout(count: number): PitchLayout {
  const n = Math.max(1, count);
  const rows = goalRows(n);
  const rowU = ROW_U[rows - 1];
  const goalU = rows * rowU;
  const heightU = STANDS_U + goalU + PITCH_U;
  const aspect = 1 / heightU;
  const toH = (u: number) => (u / heightU) * 100;
  const top = toH(STANDS_U);
  const bottom = toH(STANDS_U + goalU);
  const rowH = (bottom - top) / rows;
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const zones: Zone[] = [];
  let maxCols = 0;
  for (let r = 0; r < rows; r += 1) {
    const cols = base + (r < extra ? 1 : 0);
    maxCols = Math.max(maxCols, cols);
    const w = (GOAL_R - GOAL_L) / cols;
    for (let c = 0; c < cols && zones.length < count; c += 1) {
      zones.push({ x: GOAL_L + (c + 0.5) * w, y: top + (r + 0.5) * rowH, w, h: rowH, row: r, col: c, cols });
    }
  }
  // 골키퍼는 맨 아랫줄 이름표(구역 위쪽) 아래에 들어가는 키로, 골라인보다 조금 앞(아래)에 선다 —
  // 서 있는 동안에도 이름표를 가리지 않는다.
  const keeperU = rows === 1 ? goalU * 0.72 : rowU * 0.98;
  const keeperFeet = bottom + toH(rows === 1 ? goalU * 0.06 : rowU * 0.3);
  return {
    rows,
    maxCols,
    aspect,
    zones,
    goal: { left: GOAL_L, right: GOAL_R, top, bottom },
    stands: toH(STANDS_U * 0.8),
    spot: { x: 50, y: toH(STANDS_U + goalU + PITCH_U * 0.62) },
    keeper: { x: 50, y: keeperFeet, h: keeperU * 100 },
  };
}

/* ───────── 슛 세 번 ───────── */

/**
 * 슛 한 번의 사건.
 * save 골키퍼가 몸을 날려 쳐냄(선방!) · post 골대를 맞고 튕겨 나옴(깡!) · over 크로스바 위로(홈런…)
 * · catch 골키퍼가 품에 안음 · bar 크로스바를 맞고 골라인 앞에 떨어짐(노골)
 * · goal 골키퍼가 반대로 다이빙(마지막) · late 방향은 읽었지만 늦음(마지막) · panenka 가운데로 살짝 띄움(마지막, 드물게).
 */
export type ShotKind = 'save' | 'post' | 'over' | 'catch' | 'bar' | 'goal' | 'late' | 'panenka';
export type MissKind = Exclude<ShotKind, 'goal' | 'late' | 'panenka'>;
export type FinalKind = Extract<ShotKind, 'goal' | 'late' | 'panenka'>;

export interface Dive {
  /** 골키퍼 몸 가운데가 향하는 점(%). */
  x: number;
  y: number;
  /** 그 점까지 얼마나 가는가(0~1). 늦은 다이빙은 끝까지 못 간다. */
  reach: number;
  /** 날기 시작(fly) 기준 출발 · 걸리는 시간(ms). 음수 출발은 차기 전에 미리 몸을 던진 것. */
  delayMs: number;
  durMs: number;
}

export interface Shot {
  kind: ShotKind;
  /** 노린 구역(후보 인덱스). 골대·크로스바·홈런은 이 구역 쪽으로 가다가 빗나간다. */
  aim: number;
  /** 공이 닿는 점(%) — 골망·골대·크로스바·골키퍼 손. over 는 관중석 쪽. */
  x: number;
  y: number;
  /** 감아 차기 — 궤적이 옆으로 휘는 정도(−1~1). */
  curl: number;
  /** 골대를 맞으면 어느 쪽 골대인가(−1 왼쪽·1 오른쪽, 아니면 0). */
  post: -1 | 0 | 1;
  dive: Dive;
  /** 눈싸움 · 도움닫기 · 뻥(차는 순간) · 날기 시작 · 닿음 · 다음 슛으로(마지막은 끝). 판 시작 기준 ms. */
  stareMs: number;
  runMs: number;
  kickMs: number;
  flyMs: number;
  impactMs: number;
  endMs: number;
}

export interface PenaltyPlan {
  shots: Shot[];
  /** 골망이 출렁이고 관중이 파도타기까지 — 여기서 onSpinEnd 를 부른다. */
  endMs: number;
}

export const SHOTS = 3;
/** 눈싸움(컷신 첫 장면): 첫 슛과 마지막 슛만. 둘째는 바로 도움닫기. */
const STARE_MS = [360, 0, 520] as const;
/** 도움닫기. */
const RUN_MS = [440, 400, 500] as const;
/** 뻥 — 발이 공에 닿는 순간(속도선·화면 흔들림). */
export const KICK_MS = 200;
/** 날아가는 시간. 마지막은 슬로모션, 파넨카는 둥실 더 느리게. */
export const FLY_MS = 440;
export const FINAL_FLY_MS = 900;
export const PANENKA_FLY_MS = 1050;
/** 닿은 뒤 머무는 시간 — 사건이 읽힐 만큼. */
const HOLD_MS: Record<MissKind, number> = { save: 620, post: 640, over: 520, catch: 520, bar: 700 };
/** 다음 컷신으로 넘어가는 틈. */
const GAP_MS = 100;
/** 마지막: 골망 출렁 · 꽃가루 · 파도타기. */
export const GOAL_FLASH_MS = 300;
const SETTLE_MS = 460;

/** 앞 두 슛 사건의 가중치(합 1). 같은 사건은 연달아 나오지 않는다. */
export const EVENT_WEIGHTS: [MissKind, number][] = [
  ['save', 0.26],
  ['post', 0.22],
  ['over', 0.14],
  ['catch', 0.16],
  ['bar', 0.22],
];
/** 마지막 슛 가중치 — 파넨카는 드문 보너스. */
export const FINAL_WEIGHTS: [FinalKind, number][] = [
  ['goal', 0.52],
  ['late', 0.36],
  ['panenka', 0.12],
];
/** 선방이 당첨 구역을 노린 슛을 막을 확률 — 막히고 나서 마지막에 같은 곳에 꽂히면 통쾌하다. */
export const SAVE_ON_WINNER = 0.25;

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

/** 골키퍼가 서 있을 때 몸 가운데(%). */
export function keeperHome(layout: PitchLayout): { x: number; y: number } {
  return { x: layout.keeper.x, y: layout.keeper.y - (layout.keeper.h * layout.aspect) / 2 };
}

/** 반대쪽(헛다이빙) — 공과 다른 쪽 골문 중간 높이. 공이 가운데면 아무 쪽. */
function wrongWay(layout: PitchLayout, ballX: number, rng: () => number): { x: number; y: number } {
  const side = Math.abs(ballX - 50) < 6 ? (rng() < 0.5 ? -1 : 1) : ballX < 50 ? 1 : -1;
  const g = layout.goal;
  return { x: 50 + side * (g.right - g.left) * (0.3 + rng() * 0.08), y: g.top + (g.bottom - g.top) * (0.45 + rng() * 0.2) };
}

/**
 * 슛 세 번의 사건·시각.
 *
 * 1) 앞 두 슛은 EVENT_WEIGHTS 에서 뽑는다(같은 사건 연달아 금지). 어느 사건도 골이 아니다.
 *    post 는 골대 옆 구역(줄 끝), over·bar 는 맨 윗줄, catch 는 가운데 가까운 구역을 노린다 —
 *    노린 구역은 당첨이 아니다(아깝다!). save 만 SAVE_ON_WINNER 로 당첨 구역을 노렸다가 막힌다.
 * 2) 마지막 슛은 당첨 구역 골망. goal 은 골키퍼가 반대로, late 는 같은 쪽으로 몸을 날리지만 늦고,
 *    panenka 는 골키퍼가 먼저 넘어진 사이 공이 둥실 떠서 들어간다.
 * 3) 길이: 5.6~7.1초 — 시험(penalty.test.ts)이 조합을 돌려 확인한다.
 * 4) 한 곳뿐이면 null — 찰 것 없이 바로 골 장면.
 */
export function penaltyPlan(count: number, winnerIndex: number, rng: () => number = Math.random): PenaltyPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const layout = pitchLayout(count);
  const zones = layout.zones;
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) others.push(i);
  const edge = others.filter((i) => zones[i].col === 0 || zones[i].col === zones[i].cols - 1);
  const top = others.filter((i) => zones[i].row === 0);
  const home = keeperHome(layout);
  const g = layout.goal;

  const shots: Shot[] = [];
  let t = 0;
  let prevKind: ShotKind | null = null;
  let prevAim = -1;

  const timing = (k: number, flyDur: number) => {
    const stareMs = t;
    const runMs = stareMs + STARE_MS[k];
    const kickMs = runMs + RUN_MS[k];
    const flyMs = kickMs + KICK_MS;
    const impactMs = flyMs + flyDur;
    return { stareMs, runMs, kickMs, flyMs, impactMs };
  };

  for (let k = 0; k < SHOTS - 1; k += 1) {
    let kind = weighted(EVENT_WEIGHTS.filter(([kd]) => kd !== prevKind), rng);
    // 노릴 구역이 없으면(그럴 일은 거의 없다) 선방으로.
    if ((kind === 'post' && edge.length === 0) || ((kind === 'over' || kind === 'bar') && top.length === 0)) kind = 'save';
    const fresh = (pool: number[]) => (pool.length > 1 ? pool.filter((i) => i !== prevAim) : pool);
    let aim: number;
    if (kind === 'post') aim = pick(fresh(edge), rng);
    else if (kind === 'over' || kind === 'bar') aim = pick(fresh(top), rng);
    else if (kind === 'catch') {
      // 가운데 가까운 구역 몇 개 중에서.
      const near = [...fresh(others)].sort((a, b) => Math.abs(zones[a].x - 50) - Math.abs(zones[b].x - 50)).slice(0, 3);
      aim = pick(near, rng);
    } else aim = rng() < SAVE_ON_WINNER ? winnerIndex : pick(fresh(others), rng);
    const z = zones[aim];
    let x = z.x + (rng() - 0.5) * z.w * 0.3;
    let y = z.y + (rng() - 0.5) * z.h * 0.3;
    let post: -1 | 0 | 1 = 0;
    if (kind === 'post') {
      post = z.col === 0 ? -1 : 1;
      // 한 줄에 두 구역뿐이면 양쪽이 다 골대 옆 — 공이 있는 쪽 골대.
      x = post < 0 ? g.left : g.right;
      y = z.y + (rng() - 0.5) * z.h * 0.4;
    } else if (kind === 'over') {
      y = g.top - (g.top - layout.stands) * 0.4 - 4;
    } else if (kind === 'bar') {
      y = g.top;
    }
    const curl = (rng() - 0.5) * 1.6;
    const tm = timing(k, FLY_MS);
    const flyDur = tm.impactMs - tm.flyMs;
    let dive: Dive;
    if (kind === 'save') {
      // 공이 닿는 순간 손이 거기 있다.
      dive = { x, y, reach: 1, delayMs: 40, durMs: flyDur - 40 };
    } else if (kind === 'catch') {
      dive = { x, y, reach: 1, delayMs: 60, durMs: flyDur - 60 };
    } else if (kind === 'post') {
      // 반은 같은 쪽으로 날았지만 못 닿고, 반은 반대로.
      const same = rng() < 0.5;
      const p = same ? { x: 50 + (x - 50) * 0.7, y } : wrongWay(layout, x, rng);
      dive = { ...p, reach: same ? 0.8 : 1, delayMs: -20, durMs: 420 };
    } else if (kind === 'over') {
      // 뛰어올라 보지만 한참 위.
      dive = { x: home.x + (x - home.x) * 0.25, y: g.top + (g.bottom - g.top) * 0.35, reach: 1, delayMs: 80, durMs: 360 };
    } else {
      // bar: 반대로 넘어졌다가 고개만 돌린다.
      dive = { ...wrongWay(layout, x, rng), reach: 1, delayMs: 0, durMs: 400 };
    }
    const endMs = tm.impactMs + HOLD_MS[kind] + GAP_MS;
    shots.push({ kind, aim, x, y, curl, post, dive, ...tm, endMs });
    t = endMs;
    prevKind = kind;
    prevAim = aim;
  }

  const kind = weighted(FINAL_WEIGHTS, rng);
  const z = zones[winnerIndex];
  const x = z.x + (rng() - 0.5) * z.w * 0.24;
  const y = z.y + (rng() - 0.5) * z.h * 0.24;
  const flyDur = kind === 'panenka' ? PANENKA_FLY_MS : FINAL_FLY_MS;
  const tm = timing(SHOTS - 1, flyDur);
  let dive: Dive;
  if (kind === 'late') {
    // 방향은 맞혔다 — 하지만 공이 지나간 뒤에야 손끝이 닿는 자리에 온다.
    dive = { x, y, reach: 0.72, delayMs: Math.round(flyDur * 0.45), durMs: Math.round(flyDur * 0.75) };
  } else if (kind === 'panenka') {
    dive = { ...wrongWay(layout, x, rng), reach: 1, delayMs: -120, durMs: 420 };
  } else {
    dive = { ...wrongWay(layout, x, rng), reach: 1, delayMs: 60, durMs: 460 };
  }
  const curl = kind === 'panenka' ? 0 : (rng() - 0.5) * 1.4;
  const endMs = tm.impactMs + GOAL_FLASH_MS + SETTLE_MS;
  shots.push({ kind, aim: winnerIndex, x, y, curl, post: 0, dive, ...tm, endMs });
  return { shots, endMs };
}

export const isFinal = (s: Shot) => s.kind === 'goal' || s.kind === 'late' || s.kind === 'panenka';
/** 골이 되는 슛인가 — 마지막 슛만. */
export const scores = (s: Shot) => isFinal(s);

/** 마지막 슛이 들어간 뒤 카메라가 물러나기 시작하는 시각. */
export function settleMs(shot: Shot): number {
  return shot.impactMs + GOAL_FLASH_MS;
}

/** 공이 닿은 점이 들어 있는 구역(골문 안이면). 골대·크로스바·관중석이면 null. */
export function zoneAt(layout: PitchLayout, x: number, y: number): number | null {
  const g = layout.goal;
  if (x <= g.left || x >= g.right || y <= g.top || y >= g.bottom) return null;
  const i = layout.zones.findIndex((z) => Math.abs(x - z.x) <= z.w / 2 && Math.abs(y - z.y) <= z.h / 2);
  return i < 0 ? null : i;
}

/* ───────── 궤적 ───────── */

export interface BallPoint {
  x: number;
  y: number;
  /** 멀어질수록 작아진다(1 → 0.42). */
  s: number;
}

export const BALL_STOPS = 5;

/**
 * 스폿에서 닿는 점까지 공 궤적(2차 베지어를 BALL_STOPS 점으로). 감아 차면 옆으로 부풀고,
 * 파넨카는 높이 떴다가 떨어진다. 마지막 슛은 슬로모션 — 앞쪽에 몰아 골문 앞에서 느려진다.
 */
export function ballPath(layout: PitchLayout, shot: Shot): BallPoint[] {
  const s = layout.spot;
  const e = { x: shot.x, y: shot.y };
  const lift = shot.kind === 'panenka' ? 26 : shot.kind === 'over' ? 10 : 6;
  const c = { x: (s.x + e.x) / 2 + shot.curl * 14, y: Math.min(s.y, e.y) + (s.y - e.y) * 0.25 - lift };
  const final = isFinal(shot);
  const pts: BallPoint[] = [];
  for (let k = 0; k < BALL_STOPS; k += 1) {
    const lin = k / (BALL_STOPS - 1);
    const t = final && shot.kind !== 'panenka' ? 1 - (1 - lin) ** 1.6 : lin;
    const m = 1 - t;
    pts.push({
      x: m * m * s.x + 2 * m * t * c.x + t * t * e.x,
      y: m * m * s.y + 2 * m * t * c.y + t * t * e.y,
      s: 1 - 0.58 * t,
    });
  }
  return pts;
}

/** 골키퍼 몸 가운데가 옮겨 가는 양(폭 % = cqw)과 기울기(도). 서 있는 자리 기준. */
export function keeperMove(layout: PitchLayout, shot: Shot): { dx: number; dy: number; rot: number } {
  const h = keeperHome(layout);
  const d = shot.dive;
  const tx = h.x + (d.x - h.x) * d.reach;
  const ty = h.y + (d.y - h.y) * d.reach;
  const dx = tx - h.x;
  // 높이 % → 폭 단위.
  const dy = (ty - h.y) / layout.aspect;
  // 캐치는 몸을 날리지 않고 옆으로 한 발 — 덜 눕는다.
  const rot = Math.max(-88, Math.min(88, dx * 3.4)) * (shot.kind === 'catch' ? 0.35 : 1);
  return { dx, dy, rot };
}

/** 카메라: 배율 zoom 으로 (x, y) 를 화면 가운데에. 가장자리 밖이 보이지 않게 가둔다(origin 0 0). */
export function cameraAt(x: number, y: number, zoom: number): { tx: number; ty: number } {
  const half = 50 / zoom;
  const cx = Math.min(100 - half, Math.max(half, x));
  const cy = Math.min(100 - half, Math.max(half, y));
  return { tx: 50 - zoom * cx, ty: 50 - zoom * cy };
}
