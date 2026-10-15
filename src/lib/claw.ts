/**
 * 인형뽑기 — 가게 이름표를 단 인형들이 유리 상자 안에 쌓여 있고, 집게가 두세 번 내려간다.
 * 앞 왼쪽 출구에 떨어진 인형이 당첨이다. 마지막 기회에만 인형이 출구로 들어간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 인형 자리(후보 수마다 한 번)와 기회마다의
 * 사건·시각·자세만 정한다(판 번호 run 시드). 사건은 연출일 뿐 당첨을 바꾸지 않는다 —
 * 당첨이 아닌 인형은 출구에 들어가지 않고, 당첨 인형은 마지막 기회에만 들어간다(claw.test.ts 가 잰다).
 *
 * 좌표는 유리 상자의 % 다(x 는 폭, y 는 높이 기준). 계산은 폭 = 1 인 단위(w)로 하고 끝에 % 로 바꾼다.
 * 위쪽 띠는 집게가 다니는 곳, 아래에 인형 더미, 왼쪽 아래 구석에 출구(아크릴 벽 + 앞판)가 있다.
 */

/* ───────── 상자 배치 ───────── */

export type ToyKind = 'bear' | 'bunny' | 'cat' | 'chick' | 'frog' | 'pig' | 'penguin' | 'dog';
export const TOY_KINDS: readonly ToyKind[] = ['bear', 'bunny', 'chick', 'frog', 'cat', 'pig', 'penguin', 'dog'];

/** 인형 색(oklch 의 L·C·H). 같은 모양이 다시 나오면 색조를 돌린다. */
const KIND_COLOR: Record<ToyKind, [l: number, c: number, h: number]> = {
  bear: [0.66, 0.09, 60],
  bunny: [0.86, 0.07, 350],
  chick: [0.88, 0.14, 95],
  frog: [0.76, 0.14, 140],
  cat: [0.78, 0.1, 55],
  pig: [0.82, 0.09, 10],
  penguin: [0.48, 0.08, 255],
  dog: [0.8, 0.06, 80],
};

export interface Toy {
  /** 인형 가운데(%, x 는 폭·y 는 높이 기준). */
  x: number;
  y: number;
  /** 더미에 비스듬히 놓인 각(도). */
  rot: number;
  kind: ToyKind;
  /** 몸 색 · 배·귀 안쪽 색. */
  color: string;
  color2: string;
  /** 아래에서 몇째 줄(0 이 바닥). 위 줄이 앞에 그려진다. */
  row: number;
}

export interface ClawLayout {
  cols: number;
  rows: number;
  /** 상자 폭 ÷ 높이. */
  aspect: number;
  /** 칸 폭(상자 폭 %). 이름표 폭은 이것의 0.94 까지. */
  cellW: number;
  /** 인형 크기(폭 %, 정사각). 높이 % 로는 toyH. */
  size: number;
  toyH: number;
  toys: Toy[];
  /** 출구: 0 ~ chuteW(폭 %), 아크릴 벽 윗선 chuteTop(높이 %). */
  chuteW: number;
  chuteTop: number;
  /** 바닥 · 집게 레일(높이 %). */
  floor: number;
  rail: number;
  /** 집게가 쉬는 자리(출구 위). y 는 집게 손바닥(발톱이 달린 곳). */
  home: { x: number; y: number };
}

const CHUTE_W = 0.22;
const PILE_X0 = 0.25;
const PILE_X1 = 0.985;
const FLOOR_W = 0.035;
const RAIL_W = 0.035;

/** 열 수. 15곳이면 4열 — 390px 에서 칸 폭이 65px 쯤이라 이름표 네 글자 + 줄임표가 들어간다. */
export function clawColumns(count: number): number {
  if (count <= 3) return Math.max(1, count);
  if (count <= 9) return 3;
  if (count <= 16) return 4;
  return 5;
}

/** 이름표 글자 수. 칸이 좁을수록 짧게. */
export function clawNameMax(cols: number, expanded: boolean): number {
  if (expanded) return cols >= 5 ? 6 : 8;
  if (cols >= 5) return 4;
  if (cols >= 4) return 5;
  return 7;
}

/** 인형 자리·모양·색. 같은 rng 면 같은 더미다. */
export function clawLayout(count: number, rng: () => number = Math.random): ClawLayout {
  const cols = clawColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  const cellW = (PILE_X1 - PILE_X0) / Math.max(cols, 3);
  const size = cellW * 0.86;
  const rowH = size * 0.8;
  const top = 0.09 + size * 1.3;
  const H = top + FLOOR_W + size + (rows - 1) * rowH + 0.03;
  const hy = (w: number) => (w / H) * 100;
  const kind0 = Math.floor(rng() * TOY_KINDS.length);
  const toys: Toy[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const c = i - r * cols;
    // 엇갈려 쌓인 맛 — 홀수 줄은 출구 쪽으로 조금 민다.
    const shift = r % 2 === 1 && inRow === cols ? -0.1 * cellW : 0;
    const x = (PILE_X0 + PILE_X1) / 2 - (inRow * cellW) / 2 + (c + 0.5) * cellW + shift + (rng() - 0.5) * cellW * 0.08;
    const y = H - FLOOR_W - size * 0.5 - r * rowH + Math.min(r === 0 ? 0 : 1, rng() - 0.5) * size * 0.14;
    const k = (kind0 + i) % TOY_KINDS.length;
    const kind = TOY_KINDS[k];
    const lap = Math.floor((kind0 + i) / TOY_KINDS.length);
    const [l, ch, h] = KIND_COLOR[kind];
    const hue = (h + lap * 47 + (rng() - 0.5) * 16 + 360) % 360;
    toys.push({
      x: x * 100,
      y: hy(y),
      rot: Math.round((rng() - 0.5) * 24),
      kind,
      color: `oklch(${l} ${ch} ${hue.toFixed(0)})`,
      color2: `oklch(${Math.min(0.97, l + 0.12).toFixed(2)} ${(ch * 0.5).toFixed(3)} ${hue.toFixed(0)})`,
      row: r,
    });
  }
  return {
    cols,
    rows,
    aspect: 1 / H,
    cellW: cellW * 100,
    size: size * 100,
    toyH: hy(size),
    toys,
    chuteW: CHUTE_W * 100,
    chuteTop: hy(H - FLOOR_W - size * 0.95),
    floor: hy(H - FLOOR_W),
    rail: hy(RAIL_W),
    home: { x: (CHUTE_W / 2) * 100, y: hy(RAIL_W + 0.03 + size * 0.3) },
  };
}

/* ───────── 기회 두세 번 ───────── */

/**
 * 앞 기회의 사건(가짜 당첨이 섞인다).
 * slip 들어 올리다 중간에 미끄러짐 · edge 출구 문턱에 떨어져 휘청이다 더미로(아깝다)
 * · weak 힘이 약해 스치기만(당첨 인형일 수도) · double 두 개를 잡았다 하나씩 떨어짐
 * · nudge 미끄러진 인형이 툭 — 당첨 인형이 출구 쪽으로 굴러간다.
 */
export type PreKind = 'slip' | 'edge' | 'weak' | 'double' | 'nudge';
/** 마지막 기회: clean 곧장 쏙 · double 이웃이 딸려 올라왔다 떨어지고 당첨만 · teeter 문턱에서 휘청이다 쏙. */
export type FinalKind = 'clean' | 'double' | 'teeter';
export type AttemptKind = PreKind | FinalKind;

export type ToyState = 'pile' | 'held' | 'fall' | 'land' | 'wiggle' | 'teeter' | 'roll' | 'chute' | 'won';
export type Ease = 'move' | 'drop' | 'lift' | 'fall' | 'pop';

export interface ToyPose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  state: ToyState;
  /** 이 자세로 옮겨 가는 시간(ms) · 곡선. */
  ms: number;
  ease: Ease;
}

export interface ClawPose {
  x: number;
  y: number;
  /** 발톱 벌림 0(닫힘) ~ 1(활짝). */
  open: number;
  ms: number;
  ease: Ease;
  /** 옮기는 동안 흔들흔들. */
  swing: boolean;
}

/** 상태 줄 문구 종류. 이름은 컴포넌트가 붙인다(who). */
export type Say =
  | 'move'
  | 'count'
  | 'drop'
  | 'final-drop'
  | 'grab'
  | 'weak-grab'
  | 'double-grab'
  | 'lift'
  | 'final-lift'
  | 'slip'
  | 'double-drop'
  | 'double-slip'
  | 'weak-miss'
  | 'nudge'
  | 'carry'
  | 'edge'
  | 'edge-back'
  | 'final-carry'
  | 'teeter'
  | 'drop-in'
  | 'won';

export type ClawCue = 'whirr' | 'clank' | 'beep' | 'slip' | 'bump' | 'wobble' | 'plop' | 'chime' | 'boing';

export interface Step {
  at: number;
  attempt: number;
  claw: ClawPose;
  toys: ToyPose[];
  /** 조작판 시계(3·2·1·0). null 이면 꺼짐. */
  timer: number | null;
  /** 조이스틱 기울기 · 버튼 눌림. */
  stick: -1 | 0 | 1;
  button: boolean;
  say: Say;
  who: number | null;
  /** 상자 가운데 큰 글씨. key 는 새로 뜬 단계 번호. */
  callout: { text: string; tone: 'count' | 'bad' | 'close' | 'hit' | 'win'; key: number } | null;
}

export interface Attempt {
  kind: AttemptKind;
  /** 집게가 노린 인형. */
  target: number;
  /** double 에서 딸려 올라온 인형. */
  extra: number | null;
  /** 이 기회가 시작한 시각(ms). */
  startMs: number;
}

export interface ClawPlan {
  attempts: Attempt[];
  steps: Step[];
  sounds: [ms: number, cue: ClawCue][];
  /** 당첨 인형이 튀어나와 반짝인 뒤 — 여기서 onSpinEnd 를 부른다. */
  endMs: number;
}

/* 시간(ms). 길이 계산은 claw.test.ts 가 모든 조합을 돌려 7.2초 안인지 본다. */
export const MOVE_MS = 460;
/** 마지막 기회는 3·2·1 을 세며 옮긴다. */
export const FINAL_MOVE_MS = 780;
export const DROP_MS = 360;
export const GRAB_MS = 180;
export const LIFT_MS = 400;
export const CARRY_MS = 440;
export const FALL_MS = 300;
const RIM_FALL_MS = 250;
const TEETER_MS = 380;
const FINAL_TEETER_MS = 460;
const BACK_MS = 240;
const HOLD_MS = 160;
const KNOCK_MS = 340;
const IN_MS = 280;
const POP_MS = 480;
const SETTLE_MS = 300;
export const MAX_END_MS = 7200;

/** 앞 기회 사건의 가중치. 같은 사건은 연달아 나오지 않는다. */
export const PRE_WEIGHTS: [PreKind, number][] = [
  ['slip', 0.26],
  ['edge', 0.2],
  ['weak', 0.18],
  ['double', 0.18],
  ['nudge', 0.18],
];
export const FINAL_WEIGHTS: [FinalKind, number][] = [
  ['clean', 0.4],
  ['double', 0.3],
  ['teeter', 0.3],
];
/** 기회가 세 번일 확률(나머지는 두 번). 시간이 모자라면 두 번으로 줄인다. */
export const THREE_CHANCE = 0.55;
/** 힘 약한 집게가 당첨 인형을 스칠 확률 — 잡힐 듯 말 듯. */
const WEAK_ON_WINNER = 0.4;
/** 첫 기회는 이 중에서 — 당첨 아닌 인형이 거의 뽑힐 뻔한 장면이 판마다 하나는 있다. */
const FAKEOUTS: PreKind[] = ['slip', 'edge', 'double', 'nudge'];

function weighted<T>(items: [T, number][], rng: () => number): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r < 0) return v;
  }
  return items[items.length - 1][0];
}

const pick = <T>(xs: readonly T[], rng: () => number): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))];

/** 앞 기회 한 번의 길이(ms). */
export function preDuration(kind: PreKind): number {
  const head = MOVE_MS + DROP_MS + GRAB_MS;
  switch (kind) {
    case 'slip':
      return head + LIFT_MS * 0.55 + FALL_MS + HOLD_MS;
    case 'weak':
      return head + LIFT_MS * 0.8 + HOLD_MS;
    case 'double':
      return head + LIFT_MS * 0.8 + FALL_MS + HOLD_MS;
    case 'nudge':
      return head + LIFT_MS * 0.4 + FALL_MS + KNOCK_MS + HOLD_MS;
    case 'edge':
      return head + LIFT_MS + CARRY_MS * 0.8 + RIM_FALL_MS + TEETER_MS + BACK_MS + HOLD_MS * 0.7;
  }
}

/** 마지막 기회의 길이(ms) — 튀어나와 반짝이기까지. */
export function finalDuration(kind: FinalKind): number {
  const head = FINAL_MOVE_MS + DROP_MS + GRAB_MS + LIFT_MS;
  const into = kind === 'teeter' ? CARRY_MS * 0.82 + RIM_FALL_MS + FINAL_TEETER_MS : CARRY_MS + 120;
  return head + into + IN_MS + 120 + POP_MS + SETTLE_MS;
}

/** 상자 안 거리(폭 % 기준) — 높이 % 는 aspect 로 나눠 폭 단위로. */
function dist(layout: ClawLayout, a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / layout.aspect);
}

/** 더미 위에 얹힌 자리 — x 근처 인형들 윗면에 올라앉는다. 출구 옆 자리(아깝다·툭)에 쓴다. */
function restOn(layout: ClawLayout, poses: { x: number; y: number }[], x: number, skip: number[]): { x: number; y: number } {
  let surface = layout.floor;
  poses.forEach((p, i) => {
    if (skip.includes(i)) return;
    if (Math.abs(p.x - x) < layout.size * 0.8) surface = Math.min(surface, p.y - layout.toyH * 0.5);
  });
  return { x, y: surface - layout.toyH * 0.2 };
}

/**
 * 기회 두세 번의 사건·시각·자세.
 *
 * 1) 마지막 기회 사건을 먼저 정하고, 남은 시간(MAX_END_MS 안) 안에서 앞 기회를 하나나 둘 뽑는다.
 *    첫 기회는 FAKEOUTS(당첨 아닌 인형이 거의 뽑힐 뻔) 중 하나다.
 * 2) 앞 기회는 당첨 아닌 인형을 노린다. weak 만 당첨 인형을 스칠 수 있는데 그래도 들리지 않는다.
 *    nudge 는 당첨 인형을 출구 쪽으로 굴려 둔다 — 자리만 바뀌고 당첨은 그대로다.
 * 3) 마지막 기회만 당첨 인형을 잡아 출구에 넣는다. 들어간 인형은 튀어나와 가운데서 반짝인다.
 * 4) 한 곳뿐이면 null — 뽑을 것 없이 바로 뽑힌 모습을 보인다.
 */
export function clawPlan(layout: ClawLayout, winnerIndex: number, rng: () => number = Math.random): ClawPlan | null {
  const count = layout.toys.length;
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) others.push(i);

  // ── 사건 고르기 ──
  let finalKind = weighted(FINAL_WEIGHTS, rng);
  if (finalKind === 'double' && others.length < 1) finalKind = 'clean';
  let budget = MAX_END_MS - finalDuration(finalKind) - 40;
  const want = rng() < THREE_CHANCE ? 2 : 1;
  const pres: PreKind[] = [];
  for (let k = 0; k < want; k += 1) {
    const pool = PRE_WEIGHTS.filter(
      ([kd]) =>
        (k > 0 || FAKEOUTS.includes(kd)) &&
        !pres.includes(kd) &&
        preDuration(kd) <= budget &&
        (kd !== 'double' || others.length >= 2) &&
        // 툭은 판에 한 번 — 당첨 인형이 두 번 구르면 어지럽다.
        (kd !== 'nudge' || !pres.includes('nudge')),
    );
    if (pool.length === 0) break;
    const kd = weighted(pool, rng);
    pres.push(kd);
    budget -= preDuration(kd);
  }

  // ── 자세 각본 ──
  const L = layout;
  const home = L.home;
  const poses: ToyPose[] = L.toys.map((t) => ({ x: t.x, y: t.y, rot: t.rot, scale: 1, state: 'pile', ms: 0, ease: 'move' }));
  const grabY = (p: { y: number }) => p.y - L.toyH * 0.42;
  const heldY = (clawY: number) => clawY + L.toyH * 0.42;

  interface Patch {
    claw?: Partial<ClawPose>;
    toys?: [number, Partial<ToyPose>][];
    say?: Say;
    who?: number | null;
    timer?: number | null;
    stick?: -1 | 0 | 1;
    button?: boolean;
    callout?: { text: string; tone: NonNullable<Step['callout']>['tone'] } | null;
    attempt?: number;
  }
  const patches: { t: number; seq: number; p: Patch }[] = [];
  const sounds: [number, ClawCue][] = [];
  let seq = 0;
  const at = (t: number, p: Patch, ...cues: ClawCue[]) => {
    patches.push({ t: Math.round(t), seq: (seq += 1), p });
    for (const c of cues) sounds.push([Math.round(t), c]);
  };
  /** 지금까지 각본에서 인형 i 가 쉬는 자리(옮겨 간 뒤 자리). */
  const rest = poses.map((p) => ({ x: p.x, y: p.y, rot: p.rot }));
  let clawX = home.x;
  let t = 0;
  const used = new Set<number>();

  const nearestOther = (from: number, exclude: number[]): number | null => {
    let best: number | null = null;
    let bd = Infinity;
    for (const i of others) {
      if (exclude.includes(i)) continue;
      const d = dist(L, rest[i], rest[from]);
      if (d < bd) [best, bd] = [i, d];
    }
    return best;
  };

  /** 조이스틱으로 옮기기 — 살짝 지나쳤다가 되돌아온다. 마지막엔 3·2·1 을 크게 센다. */
  const move = (x: number, final: boolean, attempt: number, target: number) => {
    const total = final ? FINAL_MOVE_MS : MOVE_MS;
    const dir: -1 | 1 = x >= clawX ? 1 : -1;
    const over = Math.min(100 - L.size * 0.5, Math.max(L.size * 0.5, x + dir * L.size * 0.22));
    const third = total / 3;
    at(
      t,
      {
        attempt,
        claw: { x: over, y: home.y, open: 0, ms: total * 0.64, ease: 'move', swing: false },
        stick: dir,
        timer: 3,
        button: false,
        say: final ? 'count' : 'move',
        who: target,
        callout: final ? { text: '3', tone: 'count' } : null,
      },
      'whirr',
      ...(final ? (['beep'] as ClawCue[]) : []),
    );
    at(t + third, { timer: 2, callout: final ? { text: '2', tone: 'count' } : undefined }, ...(final ? (['beep'] as ClawCue[]) : []));
    at(
      t + third * 2,
      { timer: 1, stick: (-dir) as -1 | 1, claw: { x, ms: total * 0.33, ease: 'move' }, callout: final ? { text: '1', tone: 'count' } : undefined },
      ...(final ? (['beep'] as ClawCue[]) : []),
    );
    t += total;
    clawX = x;
  };
  /** 버튼 — 시계가 0 이 되면 집게가 내려간다. */
  const drop = (target: number, final: boolean) => {
    at(
      t,
      {
        claw: { y: grabY(rest[target]), open: 1, ms: DROP_MS, ease: 'drop' },
        stick: 0,
        timer: 0,
        button: true,
        say: final ? 'final-drop' : 'drop',
        callout: null,
      },
      'whirr',
    );
    t += DROP_MS;
  };
  const held = (second = false): Partial<ToyPose> => ({
    x: clawX + (second ? L.size * 0.34 : 0),
    y: heldY(home.y) + (second ? L.toyH * 0.48 : 0),
    rot: second ? 16 : 0,
    state: 'held',
    ms: LIFT_MS,
    ease: 'lift',
  });
  const fallHome = (i: number, ms = FALL_MS): [number, Partial<ToyPose>] => [i, { ...rest[i], state: 'fall', ms, ease: 'fall' }];

  const attempts: Attempt[] = [];

  // 앞 기회들
  pres.forEach((kind, k) => {
    const fresh = others.filter((i) => !used.has(i));
    const pool = fresh.length ? fresh : others;
    let target = pick(pool, rng);
    if (kind === 'weak' && rng() < WEAK_ON_WINNER) target = winnerIndex;
    if (kind === 'nudge') {
      // 당첨 인형 바로 옆 인형이 미끄러져 떨어지며 툭 친다.
      target = nearestOther(winnerIndex, []) ?? target;
    }
    let extra: number | null = null;
    if (kind === 'double') {
      extra = nearestOther(target, [target]);
      if (extra === null) kind = 'slip';
    }
    used.add(target);
    if (extra !== null) used.add(extra);
    attempts.push({ kind, target, extra, startMs: t });

    move(rest[target].x, false, k, target);
    drop(target, false);
    // 철컥 — 힘이 약하면 반만 오므린다.
    at(
      t,
      {
        claw: { open: kind === 'weak' ? 0.55 : 0, ms: GRAB_MS * 0.8, ease: 'move' },
        button: false,
        say: kind === 'weak' ? 'weak-grab' : kind === 'double' ? 'double-grab' : 'grab',
        who: target,
        callout: kind === 'double' ? { text: '두 개!', tone: 'hit' } : { text: '철컥!', tone: 'hit' },
        toys: kind === 'weak' ? [[target, { state: 'wiggle', ms: 0 }]] : [],
      },
      'clank',
    );
    t += GRAB_MS;
    const lift0 = t;
    const liftClaw: Partial<ClawPose> = { y: home.y, ms: kind === 'weak' ? LIFT_MS * 0.8 : LIFT_MS, ease: 'lift' };

    if (kind === 'weak') {
      at(t, { claw: liftClaw, say: 'weak-miss', who: target, callout: { text: '스윽…', tone: 'bad' } }, 'whirr');
      t += LIFT_MS * 0.8;
      at(t, { toys: [[target, { state: 'pile' }]] });
      t += HOLD_MS;
      return;
    }

    const lifted: [number, Partial<ToyPose>][] = [[target, held()]];
    if (extra !== null) lifted.push([extra, held(true)]);
    at(t, { claw: liftClaw, toys: lifted, say: kind === 'double' ? 'double-grab' : 'lift', who: target, callout: null }, 'whirr');

    if (kind === 'slip') {
      t = lift0 + LIFT_MS * 0.55;
      at(t, { toys: [fallHome(target)], say: 'slip', callout: { text: '앗!', tone: 'bad' } }, 'slip');
      t += FALL_MS;
      at(t, { toys: [[target, { state: 'land', ms: 0 }]] }, 'bump');
      t += HOLD_MS;
    } else if (kind === 'double') {
      const ex = extra as number;
      const dropT = lift0 + LIFT_MS * 0.35;
      at(dropT, { toys: [fallHome(ex)], say: 'double-drop', who: ex, callout: { text: '툭', tone: 'bad' } }, 'slip');
      at(dropT + FALL_MS, { toys: [[ex, { state: 'land', ms: 0 }]] }, 'bump');
      t = lift0 + LIFT_MS * 0.8;
      at(t, { toys: [fallHome(target)], say: 'double-slip', who: target, callout: { text: '앗!', tone: 'bad' } }, 'slip');
      t += FALL_MS;
      at(t, { toys: [[target, { state: 'land', ms: 0 }]] }, 'bump');
      t += HOLD_MS;
    } else if (kind === 'nudge') {
      t = lift0 + LIFT_MS * 0.4;
      at(t, { toys: [fallHome(target)], say: 'slip', callout: { text: '앗!', tone: 'bad' } }, 'slip');
      t += FALL_MS;
      // 떨어진 인형이 당첨 인형을 툭 — 출구 쪽 더미 위로 굴러간다.
      const spot = restOn(L, rest,L.chuteW + L.size * 0.62, [winnerIndex]);
      rest[winnerIndex] = { x: spot.x, y: spot.y, rot: -14 };
      at(
        t,
        {
          toys: [
            [target, { state: 'land', ms: 0 }],
            [winnerIndex, { ...rest[winnerIndex], state: 'roll', ms: KNOCK_MS, ease: 'pop' }],
          ],
          say: 'nudge',
          who: winnerIndex,
          callout: { text: '툭!', tone: 'close' },
        },
        'bump',
        'boing',
      );
      t += KNOCK_MS;
      at(t, { toys: [[winnerIndex, { state: 'pile', ms: 0 }]] });
      t += HOLD_MS;
    } else {
      // edge: 출구로 옮기다 흔들 — 문턱에 떨어져 휘청이다 더미 쪽으로 넘어간다.
      t = lift0 + LIFT_MS;
      at(t, { claw: { x: home.x, ms: CARRY_MS, ease: 'move', swing: true }, toys: [[target, { x: home.x, ms: CARRY_MS, ease: 'move' }]], say: 'carry', who: target }, 'whirr');
      clawX = home.x;
      t += CARRY_MS * 0.8;
      at(
        t,
        {
          toys: [[target, { x: L.chuteW + L.size * 0.08, y: L.chuteTop - L.toyH * 0.42, rot: -22, state: 'fall', ms: RIM_FALL_MS, ease: 'fall' }]],
          say: 'edge',
          callout: null,
        },
        'slip',
      );
      t += RIM_FALL_MS;
      at(t, { claw: { open: 1, ms: 200, swing: false }, toys: [[target, { state: 'teeter', ms: 0 }]], callout: { text: '아깝다!', tone: 'close' } }, 'wobble');
      t += TEETER_MS;
      const spot = restOn(L, rest,L.chuteW + L.size * 0.7, [target]);
      rest[target] = { x: spot.x, y: spot.y, rot: 18 };
      at(t, { claw: { open: 0, ms: 200 }, toys: [fallHome(target, BACK_MS)], say: 'edge-back' });
      t += BACK_MS;
      at(t, { toys: [[target, { state: 'land', ms: 0 }]] }, 'bump');
      t += HOLD_MS * 0.7;
    }
  });

  // 마지막 기회 — 당첨 인형.
  const fin = pres.length;
  let extra: number | null = null;
  if (finalKind === 'double') extra = nearestOther(winnerIndex, []);
  if (extra === null && finalKind === 'double') finalKind = 'clean';
  attempts.push({ kind: finalKind, target: winnerIndex, extra, startMs: t });
  move(rest[winnerIndex].x, true, fin, winnerIndex);
  drop(winnerIndex, true);
  at(
    t,
    {
      claw: { open: 0, ms: GRAB_MS * 0.8, ease: 'move' },
      button: false,
      say: finalKind === 'double' ? 'double-grab' : 'grab',
      who: winnerIndex,
      callout: finalKind === 'double' ? { text: '두 개!', tone: 'hit' } : { text: '철컥!', tone: 'hit' },
    },
    'clank',
  );
  t += GRAB_MS;
  const lift0 = t;
  const lifted: [number, Partial<ToyPose>][] = [[winnerIndex, held()]];
  if (extra !== null) lifted.push([extra, held(true)]);
  at(t, { claw: { y: home.y, ms: LIFT_MS, ease: 'lift' }, toys: lifted, say: 'final-lift', who: winnerIndex, callout: null }, 'whirr');
  if (extra !== null) {
    const dropT = lift0 + LIFT_MS * 0.4;
    at(dropT, { toys: [fallHome(extra)], say: 'double-drop', who: extra, callout: { text: '툭', tone: 'bad' } }, 'slip');
    at(dropT + FALL_MS, { toys: [[extra, { state: 'land', ms: 0 }]] }, 'bump');
  }
  t = lift0 + LIFT_MS;
  at(t, { claw: { x: home.x, ms: CARRY_MS, ease: 'move', swing: true }, toys: [[winnerIndex, { x: home.x, ms: CARRY_MS, ease: 'move' }]], say: 'final-carry', who: winnerIndex }, 'whirr');
  clawX = home.x;
  const inPose: Partial<ToyPose> = { x: L.chuteW * 0.5, y: L.floor - L.toyH * 0.5, rot: 8, state: 'fall', ms: IN_MS, ease: 'fall' };
  if (finalKind === 'teeter') {
    t += CARRY_MS * 0.82;
    at(t, { toys: [[winnerIndex, { x: L.chuteW + L.size * 0.02, y: L.chuteTop - L.toyH * 0.42, rot: -24, state: 'fall', ms: RIM_FALL_MS, ease: 'fall' }]], say: 'teeter' }, 'slip');
    t += RIM_FALL_MS;
    at(t, { claw: { open: 1, ms: 200, swing: false }, toys: [[winnerIndex, { state: 'teeter', ms: 0 }]], callout: { text: '들어가라…!', tone: 'close' } }, 'wobble');
    t += FINAL_TEETER_MS;
    at(t, { toys: [[winnerIndex, inPose]], say: 'drop-in', callout: { text: '쏙!', tone: 'hit' } }, 'plop');
  } else {
    t += CARRY_MS;
    at(t, { claw: { open: 1, ms: 160, swing: false } });
    t += 120;
    at(t, { toys: [[winnerIndex, inPose]], say: 'drop-in', callout: { text: '쏙!', tone: 'hit' } }, 'plop');
  }
  t += IN_MS;
  at(t, { toys: [[winnerIndex, { state: 'chute', ms: 0 }]], claw: { open: 0, ms: 240 } });
  t += 120;
  // 튀어나와 가운데에서 크게 — 이름표 전체가 보인다.
  const scale = Math.min(2.6, Math.max(1.6, 36 / L.size));
  at(
    t,
    {
      toys: [[winnerIndex, { x: 50, y: 50, rot: 0, scale, state: 'won', ms: POP_MS, ease: 'pop' }]],
      say: 'won',
      who: winnerIndex,
      callout: { text: '뽑았어요!', tone: 'win' },
      timer: null,
    },
    'boing',
    'chime',
  );
  t += POP_MS + SETTLE_MS;
  const endMs = Math.round(t);

  // ── 접기: 같은 시각 패치를 합쳐 단계마다 전체 모습을 남긴다 ──
  patches.sort((a, b) => a.t - b.t || a.seq - b.seq);
  const steps: Step[] = [];
  let cur: Step = {
    at: 0,
    attempt: 0,
    claw: { x: home.x, y: home.y, open: 0, ms: 0, ease: 'move', swing: false },
    toys: poses,
    timer: null,
    stick: 0,
    button: false,
    say: 'move',
    who: null,
    callout: null,
  };
  for (const { t: pt, p } of patches) {
    const same = steps.length > 0 && steps[steps.length - 1].at === pt;
    const base = same ? steps[steps.length - 1] : cur;
    const toys = p.toys && p.toys.length ? base.toys.slice() : base.toys;
    for (const [i, tp] of p.toys ?? []) toys[i] = { ...toys[i], ...tp };
    const next: Step = {
      at: pt,
      attempt: p.attempt ?? base.attempt,
      claw: p.claw ? { ...base.claw, ...p.claw } : base.claw,
      toys,
      timer: p.timer !== undefined ? p.timer : base.timer,
      stick: p.stick ?? base.stick,
      button: p.button ?? base.button,
      say: p.say ?? base.say,
      who: p.who !== undefined ? p.who : base.who,
      callout:
        p.callout === undefined ? base.callout : p.callout === null ? null : { ...p.callout, key: same ? steps.length - 1 : steps.length },
    };
    if (same) steps[steps.length - 1] = next;
    else steps.push(next);
    cur = next;
  }
  sounds.sort((a, b) => a[0] - b[0]);
  return { attempts, steps, sounds, endMs };
}

/** ms 시각의 단계 번호(그 시각까지 시작한 마지막 단계). */
export function stepAt(plan: ClawPlan, ms: number): number {
  let k = 0;
  for (let i = 0; i < plan.steps.length; i += 1) if (plan.steps[i].at <= ms) k = i;
  return k;
}
