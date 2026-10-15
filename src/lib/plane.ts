/**
 * 종이비행기 — 가게마다 종이비행기 한 대씩, 책상에서 한꺼번에 날려 점심 테이블까지 경주한다.
 * 하나씩 떨어지고, 끝까지 날아 테이블에 내려앉는 비행기가 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 비행기마다 어떻게 날다가 어떻게 떨어지는지만
 * 정한다. 테이블에 내려앉는 비행기는 언제나 winnerIndex 하나뿐이고, 나머지는 모두 착륙 전에
 * 바닥에 떨어진다. 사건(바람·공중제비·비둘기·유리창·에어컨 바람·테이블 모서리)은 seededRandom(run)
 * 으로 고르고 연출만 바꾼다 — 누가 떨어지고 누가 내려앉는지는 사건이 바꾸지 못한다.
 *
 * 좌표: x 는 비행 구간의 진행률(0 = 책상 끝, 100 = 테이블 한가운데), y 는 자기 줄(레인) 가운데에서
 * 아래로 잰 거리(레인 높이 단위, 음수가 위), r 은 기울기(도, 양수가 기수 아래·시계 방향).
 * 화면 % 로 바꾸는 건 planeLayout 의 sceneX/sceneY 다.
 */

/* ───────── 판 모양 ───────── */

/** 비행 구간 — 장면 폭의 %. 왼쪽 0~FLIGHT_L 은 이름표 책상, 오른쪽 TABLE_L~100 은 점심 테이블. */
export const FLIGHT_L = 28;
export const FLIGHT_R = 93;
/** 테이블 띠가 시작하는 장면 폭 %. 진행률로는 약 89.2 — 여기 부딪히면 '테이블 모서리'다. */
export const TABLE_L = 86;
/** 테이블 모서리의 진행률. */
export const TABLE_EDGE_X = ((TABLE_L - FLIGHT_L) / (FLIGHT_R - FLIGHT_L)) * 100;

/** 떨어진 비행기가 놓이는 높이(레인 단위, 레인 바닥 조금 위). */
export const FLOOR = 0.34;
/** 날기 전 책상 위에 놓인 높이. */
export const DESK_Y = 0.12;
/** 테이블에 내려앉은 높이. */
export const LAND_Y = 0.1;

export interface PlaneLayout {
  count: number;
  /** 레인 하나의 높이 ÷ 장면 폭. */
  lane: number;
  /** 맨 위 하늘(공중제비·바람에 들릴 틈) · 맨 아래 바닥(에어컨이 놓이는 곳), 장면 폭 비. */
  head: number;
  foot: number;
  /** 장면 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css). */
  aspect: number;
  /** 레인 높이 하나가 진행률 몇에 해당하는지 — 공중제비를 동그랗게 그리는 데 쓴다. */
  laneToX: number;
  /** 공중제비 반지름(레인 단위). 레인이 좁으면 옆 레인까지 잠깐 넘어간다. */
  loopR: number;
  /** 비행기 몸 폭(장면 폭의 %, cqw). */
  planeW: number;
}

/**
 * 레인 높이는 후보가 적을수록 넉넉하게(2곳이면 장면 폭의 25%), 많으면 6% 까지 줄인다 —
 * 390px 휴대폰에서 15곳이면 레인 22px, 12px 이름표가 들어간다.
 */
export function planeLayout(count: number): PlaneLayout {
  const n = Math.max(1, count);
  const lane = Math.min(0.25, Math.max(0.06, 0.6 / (n + 0.4)));
  const head = 0.08;
  const foot = 0.04;
  const total = head + n * lane + foot;
  const flight = (FLIGHT_R - FLIGHT_L) / 100;
  return {
    count: n,
    lane,
    head,
    foot,
    aspect: 1 / total,
    laneToX: (lane * 100) / flight,
    loopR: Math.min(0.7, 0.07 / lane),
    planeW: Math.min(10, lane * 100 * 1.15),
  };
}

/** 진행률 → 장면 폭 %. */
export function sceneX(x: number): number {
  return FLIGHT_L + (x * (FLIGHT_R - FLIGHT_L)) / 100;
}

/** 레인 i 의 높이 y → 장면 높이 %. */
export function sceneY(layout: PlaneLayout, i: number, y: number): number {
  const total = 1 / layout.aspect;
  return ((layout.head + (i + 0.5 + y) * layout.lane) / total) * 100;
}

/* ───────── 경기 일정 ───────── */

/**
 * 비행기의 끝. win 은 테이블에 내려앉는다(당첨 하나뿐). 나머지는 떨어지는 방식이다.
 * glide 힘이 빠져 스르르 · spiral 빙글빙글 곤두박질 · window 유리창에 쾅 · pigeon 비둘기와 부딪힘
 * · gust 돌풍에 뒤집힘 · bounce 테이블 모서리에 튕김(아깝다!).
 */
export type Fate = 'win' | 'glide' | 'spiral' | 'window' | 'pigeon' | 'gust' | 'bounce';

/** 떨어질 때 종이가 구겨지는 방식인가(glide 는 그대로 바닥에 눕는다). */
export function crumples(fate: Fate): boolean {
  return fate !== 'win' && fate !== 'glide';
}

export interface Track {
  /** 책상에서 날아오르는 시각(ms). */
  launchMs: number;
  /** 이대로 날면 테이블(진행률 100)에 닿을 시각. 당첨은 landMs 와 같다. */
  arriveMs: number;
  /** 위아래로 출렁이는 주기·박자. */
  bobMs: number;
  bobPhase: number;
  fate: Fate;
  /** 탈락: 떨어지기 시작하는 시각(부딪힘·뒤집힘). 당첨: landMs. */
  downMs: number;
  /** 탈락: 바닥에 닿아 멈춘 시각(구겨짐). 당첨: landMs. */
  restMs: number;
}

/** 비행 중 덧붙는 장면. loop 공중제비 · updraft 떨어지다 에어컨 바람에 다시 뜸(탈락이 될 비행기)
 *  · comeback 당첨 비행기가 떨어지는 듯하다 에어컨 바람에 살아남. */
export interface Flourish {
  kind: 'loop' | 'updraft' | 'comeback';
  plane: number;
  ms: number;
  durMs: number;
}

/** 돌풍 — 날고 있는 비행기를 모두 뒤로 밀고 들어 올린다. */
export interface Gust {
  ms: number;
  durMs: number;
}

export interface PlanePlan {
  layout: PlaneLayout;
  winner: number;
  tracks: Track[];
  gust: Gust | null;
  flourishes: Flourish[];
  /** 당첨 비행기가 테이블에 내려앉는 시각. */
  landMs: number;
  /** 축하까지 끝난 시각 — onSpinEnd. */
  endMs: number;
}

const LAUNCH0 = 250;
const LAUNCH_SPAN = 250;
const LAND_MIN = 5000;
const LAND_SPAN = 600;
/** 내려앉은 뒤 콩 튀고 반짝이는 시간. */
export const CELEBRATE_MS = 700;
const HOP_MS = 420;
const FLARE_MS = 500;
/** 떨어지는 데 걸리는 시간(부딪힘 → 바닥). */
export const FALL_MS: Record<Exclude<Fate, 'win'>, number> = {
  glide: 900,
  spiral: 800,
  window: 750,
  pigeon: 850,
  gust: 850,
  bounce: 900,
};
/** 유리창이 나타나는 때(부딪히기 전) · 비둘기가 날아오는 때. */
export const WINDOW_LEAD_MS = 600;
export const PIGEON_LEAD_MS = 700;
export const LOOP_MS = 750;
export const UPDRAFT_MS = 1000;
export const COMEBACK_MS = 1150;
/** 떨어지다 다시 뜨는 장면에서 에어컨 바람이 부는 때(장면 길이의 비). */
export const LIFT_AT = 0.5;
export const GUST_MS = 900;

/** 사건 확률. 테스트가 이 값 근처로 나오는지 본다. */
export const CHANCE = {
  gust: 0.55,
  loop: 0.7,
  comeback: 0.45,
  updraft: 0.4,
  pigeon: 0.5,
  bounce: 0.5,
  /** 남은 탈락 비행기마다 — 유리창(최대 2) · 곤두박질(최대 3). 나머지는 스르르. */
  window: 0.25,
  spiral: 0.3,
} as const;
const MAX_WINDOW = 2;
const MAX_SPIRAL = 3;

/** 진행 곡선: 처음엔 던진 힘으로 조금 빠르게, 그다음 고르게. 0→0, 1→100, 늘기만 한다. */
export function progress(u: number): number {
  const v = Math.min(1, Math.max(0, u));
  return 100 * (0.78 * v + 0.22 * Math.sin((v * Math.PI) / 2));
}

/** progress(u) = x 인 u(이분법). */
function progressInv(x: number): number {
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 40; k += 1) {
    const mid = (lo + hi) / 2;
    if (progress(mid) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 경기 일정.
 *
 * 1) 착륙 시각 landMs 는 5.0~5.6초, 끝은 그 뒤 0.7초(5.7~6.3초).
 * 2) 탈락 비행기는 1.1~1.4초부터 landMs − 0.9~1.2초까지 하나씩 떨어진다. 앞쪽은 따다닥, 뒤로 갈수록 뜸.
 *    떨어지는 순서는 섞는다. 떨어지기 전에는 진행률 78 을 넘지 않게 속도를 늦춘다(테이블 모서리는 약 89).
 * 3) 떨어지는 방식: 마지막 탈락은 CHANCE.bounce 로 '테이블 모서리에 튕김'(앞서 날다 아깝게 떨어진다).
 *    돌풍이 불면 그 무렵 하나가 뒤집혀 떨어진다. 비둘기(하나) · 유리창(최대 2) · 곤두박질(최대 3) · 나머지는 스르르.
 * 4) 공중제비 · 에어컨 바람(탈락 비행기가 떨어지다 다시 뜸) · 기사회생(당첨이 떨어지는 듯하다 다시 뜸)은
 *    날고 있는 동안에만 덧붙인다. 당첨은 끝까지 바닥에 닿지 않는다.
 */
export function planePlan(count: number, winnerIndex: number, rng: () => number = Math.random): PlanePlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const layout = planeLayout(count);
  const landMs = Math.round(LAND_MIN + rng() * LAND_SPAN);
  const endMs = landMs + CELEBRATE_MS;

  const losers: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) losers.push(i);
  // 떨어지는 순서 — Fisher–Yates.
  for (let i = losers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [losers[i], losers[j]] = [losers[j], losers[i]];
  }
  const m = losers.length;
  const first = 1100 + rng() * 300;
  const last = landMs - FALL_MS.bounce - rng() * 300;
  const slots = losers.map((_, j) => {
    const f = m === 1 ? 1 : j / (m - 1);
    return Math.round(first + (last - first) * Math.pow(f, 1.3));
  });

  const fates: Fate[] = losers.map(() => 'glide');
  const taken = new Set<number>();
  // 마지막 탈락 — 앞서 날다 테이블 모서리에 튕긴다.
  if (rng() < CHANCE.bounce) {
    fates[m - 1] = 'bounce';
    taken.add(m - 1);
  }

  let gust: Gust | null = null;
  if (rng() < CHANCE.gust) {
    const want = 1700 + rng() * 1300;
    let victim = -1;
    for (let j = 0; j < m; j += 1) {
      if (taken.has(j) || slots[j] < 1500) continue;
      if (victim < 0 || Math.abs(slots[j] - want) < Math.abs(slots[victim] - want)) victim = j;
    }
    if (victim >= 0) {
      fates[victim] = 'gust';
      taken.add(victim);
      gust = { ms: slots[victim] - 350, durMs: GUST_MS };
    } else {
      gust = { ms: Math.round(want), durMs: GUST_MS };
    }
  }

  if (rng() < CHANCE.pigeon) {
    const pool = slots.map((_, j) => j).filter((j) => !taken.has(j) && slots[j] >= 1500);
    if (pool.length > 0) {
      const j = pool[Math.floor(rng() * pool.length)];
      fates[j] = 'pigeon';
      taken.add(j);
    }
  }
  let windows = 0;
  let spirals = 0;
  for (let j = 0; j < m; j += 1) {
    if (taken.has(j)) continue;
    const r = rng();
    if (r < CHANCE.window && windows < MAX_WINDOW && slots[j] >= 1300) {
      fates[j] = 'window';
      windows += 1;
    } else if (r >= CHANCE.window && r < CHANCE.window + CHANCE.spiral && spirals < MAX_SPIRAL) {
      fates[j] = 'spiral';
      spirals += 1;
    }
  }

  const tracks: Track[] = [];
  for (let i = 0; i < count; i += 1) {
    tracks.push({
      launchMs: Math.round(LAUNCH0 + rng() * LAUNCH_SPAN),
      arriveMs: 0,
      bobMs: Math.round(900 + rng() * 500),
      bobPhase: rng() * Math.PI * 2,
      fate: 'win',
      downMs: landMs,
      restMs: landMs,
    });
  }
  tracks[winnerIndex].arriveMs = landMs;
  losers.forEach((i, j) => {
    const t = tracks[i];
    t.fate = fates[j];
    t.downMs = slots[j];
    t.restMs = slots[j] + FALL_MS[fates[j] as Exclude<Fate, 'win'>];
    const span = t.downMs - t.launchMs;
    if (t.fate === 'bounce') {
      // 테이블 모서리에 딱 닿는 속도 — 당첨보다 앞서 난다.
      t.arriveMs = Math.round(t.launchMs + span / progressInv(TABLE_EDGE_X));
    } else {
      // 당첨과 비슷한 빠르기(앞서기도 뒤지기도). 떨어지기 전에 진행률 78 을 넘지 않는다 — 떨어지며 미끄러져도 테이블에 닿지 않게.
      const want = t.launchMs + (landMs - t.launchMs) * (0.88 + rng() * 0.3);
      t.arriveMs = Math.round(Math.max(want, t.launchMs + span / progressInv(78)));
    }
  });

  // 덧붙는 장면 — 날고 있는 비행기에만. 같은 비행기에 둘이 겹치지 않게.
  const flourishes: Flourish[] = [];
  const airborne = (i: number, from: number, to: number) => tracks[i].launchMs + 300 <= from && tracks[i].downMs >= to;
  const busy = (i: number, from: number, to: number) =>
    flourishes.some((f) => f.plane === i && f.ms < to && f.ms + f.durMs > from);

  if (rng() < CHANCE.comeback) {
    const ms = Math.round(landMs - 2300 - rng() * 200);
    flourishes.push({ kind: 'comeback', plane: winnerIndex, ms, durMs: COMEBACK_MS });
  }
  if (rng() < CHANCE.loop) {
    const ms = Math.round(1300 + rng() * 1200);
    const pool = [...Array(count).keys()].filter((i) => airborne(i, ms, ms + LOOP_MS + 250) && !busy(i, ms - 200, ms + LOOP_MS + 200));
    if (pool.length > 0) flourishes.push({ kind: 'loop', plane: pool[Math.floor(rng() * pool.length)], ms, durMs: LOOP_MS });
  }
  if (rng() < CHANCE.updraft) {
    const ms = Math.round(1400 + rng() * 1200);
    const pool = losers.filter((i) => airborne(i, ms, ms + UPDRAFT_MS + 500) && !busy(i, ms - 200, ms + UPDRAFT_MS + 200));
    if (pool.length > 0) flourishes.push({ kind: 'updraft', plane: pool[Math.floor(rng() * pool.length)], ms, durMs: UPDRAFT_MS });
  }
  flourishes.sort((a, b) => a.ms - b.ms);

  return { layout, winner: winnerIndex, tracks, gust, flourishes, landMs, endMs };
}

/* ───────── 자세(시각 → 자리) ───────── */

export type PosePhase = 'desk' | 'fly' | 'fall' | 'down' | 'landed';

export interface Pose {
  x: number;
  y: number;
  r: number;
  phase: PosePhase;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
const easeIn = (k: number) => k * k;
const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);

/** 날고 있는 자세(사건 포함). 탈락 비행기는 downMs 전까지만 쓴다. */
function flyPose(plan: PlanePlan, i: number, t: number): Pose {
  const tr = plan.tracks[i];
  const dt = t - tr.launchMs;
  const u = dt / (tr.arriveMs - tr.launchMs);
  let x = progress(u);
  const w = (2 * Math.PI * dt) / tr.bobMs + tr.bobPhase;
  // 던진 힘으로 처음 1초 동안 위로 솟았다가 내려온다. 그다음엔 출렁출렁.
  const climb = -0.3 * Math.sin(Math.PI * clamp01(dt / 1000));
  const settle = clamp01(dt / 600);
  let y = climb + 0.1 * Math.sin(w) * settle;
  let r = -16 * (1 - settle) + 9 * Math.cos(w) * settle;

  // 당첨: 마지막 0.5초 동안 기수를 들며 테이블 높이로 내려앉는다.
  if (i === plan.winner) {
    const k = clamp01((t - (plan.landMs - FLARE_MS)) / FLARE_MS);
    if (k > 0) {
      const e = easeInOut(k);
      y = lerp(y, LAND_Y, e);
      r = lerp(r, -6, e);
    }
  }

  for (const f of plan.flourishes) {
    if (f.plane !== i || t < f.ms || t > f.ms + f.durMs) continue;
    const k = (t - f.ms) / f.durMs;
    if (f.kind === 'loop') {
      const th = 2 * Math.PI * k;
      const ry = plan.layout.loopR;
      x += ry * plan.layout.laneToX * Math.sin(th);
      y += -ry * (1 - Math.cos(th));
      r = lerp(r, 0, Math.sin(Math.PI * k)) - 360 * k;
    } else {
      // 떨어지다(0~0.45) 바닥 가까이서 버티다(~LIFT_AT) 바람에 다시 떠오른다(~1).
      const bottom = f.kind === 'comeback' ? FLOOR - 0.04 : FLOOR - 0.12;
      const dip = k < 0.45 ? easeIn(k / 0.45) : k < LIFT_AT + 0.05 ? 1 : 1 - easeOut((k - LIFT_AT - 0.05) / (0.95 - LIFT_AT));
      const d = clamp01(dip);
      y = lerp(y, bottom, d);
      const nose = k < LIFT_AT ? 38 : -34 * Math.sin(Math.PI * clamp01((k - LIFT_AT) / (1 - LIFT_AT)));
      r = lerp(r, nose, k < LIFT_AT ? d : 1);
    }
  }

  if (plan.gust && t >= plan.gust.ms && t <= plan.gust.ms + plan.gust.durMs) {
    const k = (t - plan.gust.ms) / plan.gust.durMs;
    const s = Math.sin(Math.PI * k);
    x -= 7 * s;
    y -= 0.35 * s;
    r += -14 * s + 10 * Math.sin(6 * Math.PI * k) * s;
  }
  return { x, y, r, phase: 'fly' };
}

/**
 * 비행기 i 의 t(ms) 자세. 순수 함수 — 같은 plan·t 면 같은 자세다. t 가 Infinity 면 마지막 장면.
 */
export function planePose(plan: PlanePlan, i: number, t: number): Pose {
  const tr = plan.tracks[i];
  if (t < tr.launchMs) return { x: 0, y: DESK_Y, r: 0, phase: 'desk' };

  if (tr.fate === 'win') {
    if (t < plan.landMs) return flyPose(plan, i, t);
    // 내려앉은 뒤 콩 한 번 튄다.
    const k = clamp01((t - plan.landMs) / HOP_MS);
    return { x: 100, y: LAND_Y - 0.28 * Math.sin(Math.PI * k), r: -6 * (1 - k), phase: 'landed' };
  }

  if (t < tr.downMs) return flyPose(plan, i, t);
  const p0 = flyPose(plan, i, tr.downMs);
  const k = clamp01((t - tr.downMs) / (tr.restMs - tr.downMs));
  const phase: PosePhase = t >= tr.restMs ? 'down' : 'fall';
  switch (tr.fate) {
    case 'glide':
      // 힘이 빠져 앞으로 미끄러지며 스르르 내려앉는다.
      return { x: p0.x + 7 * easeOut(k), y: lerp(p0.y, FLOOR, easeIn(k)), r: lerp(p0.r, 22, Math.sin(Math.PI * k * 0.9)) * (1 - k) + 5 * k, phase };
    case 'spiral':
      // 기수를 박고 빙글빙글 곤두박질.
      return { x: p0.x + 4 * k, y: lerp(p0.y, FLOOR, Math.pow(k, 1.6)), r: p0.r + 70 * Math.min(1, k * 4) + 650 * k, phase };
    case 'window': {
      // 유리창에 쾅 — 조금 튕겨 나와(0~0.2) 유리를 타고 주르륵 미끄러진다.
      const hit = clamp01(k / 0.2);
      const slide = clamp01((k - 0.2) / 0.8);
      return { x: p0.x - 1.8 * Math.sin((Math.PI / 2) * hit), y: lerp(p0.y, FLOOR, easeIn(slide)), r: lerp(p0.r, -25, hit) + 140 * slide, phase };
    }
    case 'pigeon':
      // 비둘기와 부딪혀 뒤로 튕기며 뒤집혀 떨어진다.
      return { x: p0.x - 5 * easeOut(k), y: lerp(p0.y, FLOOR, easeIn(k)) - 0.35 * Math.sin(Math.PI * k), r: p0.r - 540 * k, phase };
    case 'gust':
      // 돌풍에 뒤집혀 뒤로 밀리며 떨어진다.
      return { x: p0.x - 6 * easeOut(k), y: lerp(p0.y, FLOOR, easeIn(k)) - 0.5 * Math.sin(Math.PI * k), r: p0.r + 480 * k, phase };
    case 'bounce':
    default:
      // 테이블 모서리에 부딪혀 위로 튕겼다가 테이블 앞 바닥으로 떨어진다.
      return { x: p0.x - 7 * easeOut(k), y: lerp(p0.y, FLOOR, k) - 0.85 * Math.sin(Math.PI * k), r: lerp(p0.r, -40, clamp01(k * 3)) + 200 * easeIn(k), phase };
  }
}

/* ───────── 장면 순서(상태 문구·효과음·화면 갱신) ───────── */

export type MarkKind =
  | 'launch'
  | 'gust'
  | 'loop'
  | 'dip'
  | 'lift'
  | 'windowShow'
  | 'pigeonShow'
  | Exclude<Fate, 'win'>
  | 'rest'
  | 'land'
  | 'end';

export interface Mark {
  ms: number;
  kind: MarkKind;
  /** 대상 비행기(launch·gust·land·end 는 -1, land 는 당첨). */
  plane: number;
}

/** 일정의 모든 장면을 시각 순으로. 같은 시각이면 만든 순서대로(정렬이 안정적이다). */
export function planeMarks(plan: PlanePlan): Mark[] {
  const marks: Mark[] = [{ ms: 0, kind: 'launch', plane: -1 }];
  if (plan.gust) marks.push({ ms: plan.gust.ms, kind: 'gust', plane: -1 });
  for (const f of plan.flourishes) {
    if (f.kind === 'loop') marks.push({ ms: f.ms, kind: 'loop', plane: f.plane });
    else {
      marks.push({ ms: f.ms, kind: 'dip', plane: f.plane });
      marks.push({ ms: Math.round(f.ms + f.durMs * LIFT_AT), kind: 'lift', plane: f.plane });
    }
  }
  plan.tracks.forEach((t, i) => {
    if (t.fate === 'win') return;
    if (t.fate === 'window') marks.push({ ms: t.downMs - WINDOW_LEAD_MS, kind: 'windowShow', plane: i });
    if (t.fate === 'pigeon') marks.push({ ms: t.downMs - PIGEON_LEAD_MS, kind: 'pigeonShow', plane: i });
    marks.push({ ms: t.downMs, kind: t.fate, plane: i });
    marks.push({ ms: t.restMs, kind: 'rest', plane: i });
  });
  marks.push({ ms: plan.landMs, kind: 'land', plane: plan.winner });
  marks.push({ ms: plan.endMs, kind: 'end', plane: -1 });
  return marks.sort((a, b) => a.ms - b.ms);
}

/** WAAPI 키프레임용 표본 — [0, endMs] 를 stepMs 간격으로(끝 포함). */
export function planeSamples(plan: PlanePlan, i: number, stepMs = 50): { offset: number; pose: Pose }[] {
  const out: { offset: number; pose: Pose }[] = [];
  const n = Math.ceil(plan.endMs / stepMs);
  for (let k = 0; k <= n; k += 1) {
    const t = Math.min(plan.endMs, k * stepMs);
    out.push({ offset: t / plan.endMs, pose: planePose(plan, i, t) });
  }
  return out;
}
