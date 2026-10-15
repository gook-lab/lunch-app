/**
 * 주사위 말판 — 가게가 판 둘레 칸이 되고, 말이 주사위 눈만큼 시계 방향으로 간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 지금 칸에서 당첨 칸까지의 거리를 1~6 눈 몇 번으로
 * 나누되 마지막 눈에 정확히 도착하게 거꾸로 짠다. 거리 0 이면 한 바퀴 돈다.
 * 굴림은 많아야 6번(36칸) — 연출 잠금 상한 30초 안에 끝나야 한다.
 */

export const MAX_ROLLS = 6;

/** 판 한 변의 칸 수. 둘레 칸 수 4(side − 1) 가 후보 수 이상이 되게. */
export function boardSide(count: number): number {
  return Math.max(2, Math.ceil(count / 4) + 1);
}

/** 말이 도는 둘레 칸 수. 후보보다 많으면 남는 칸은 빈 칸(쉬어 가는 칸)이다. */
export function trackLength(count: number): number {
  return 4 * (boardSide(count) - 1);
}

/**
 * k 번째 가게가 놓이는 둘레 칸. 가게를 둘레에 고르게 흩는다 — 앞에서부터 채우면
 * 후보 5곳일 때 아래·왼쪽 변이 통째로 비어 판이 끊겨 보였다.
 */
export function placeCell(k: number, count: number): number {
  return Math.floor((k * trackLength(count)) / count);
}

/** 둘레 k 번째 칸(0 = 왼쪽 위, 시계 방향)의 격자 자리. 1부터 센다(CSS grid). */
export function perimeterCell(k: number, side: number): { row: number; col: number } {
  const e = side - 1;
  if (k < e) return { row: 1, col: k + 1 };
  if (k < 2 * e) return { row: k - e + 1, col: side };
  if (k < 3 * e) return { row: side, col: side - (k - 2 * e) };
  return { row: side - (k - 3 * e), col: 1 };
}

/** from 칸에서 to 칸까지 시계 방향 거리. 같은 칸이면 한 바퀴(count). */
export function distanceTo(from: number, to: number, count: number): number {
  const d = (((to - from) % count) + count) % count;
  return d === 0 ? count : d;
}

/**
 * 거리를 1~6 눈으로 나눈다. 마지막 눈에 정확히 도착한다.
 * 굴림 수는 사람 눈에 자연스럽게(평균 3.5칸) 정하되 MAX_ROLLS 를 넘지 않는다.
 */
export function diceRolls(distance: number, random: () => number = Math.random): number[] {
  const d = Math.max(1, Math.min(distance, MAX_ROLLS * 6));
  const rolls = Math.max(Math.ceil(d / 6), Math.min(MAX_ROLLS, Math.round(d / 3.5) || 1));
  const out: number[] = [];
  let left = d;
  for (let i = 0; i < rolls; i += 1) {
    const after = rolls - i - 1;
    // 남은 굴림으로 채울 수 있는 범위 안에서만 고른다(나중 굴림은 1~6).
    const lo = Math.max(1, left - after * 6);
    const hi = Math.min(6, left - after);
    const eyes = after === 0 ? left : lo + Math.floor(random() * (hi - lo + 1));
    out.push(eyes);
    left -= eyes;
  }
  return out;
}

/* ───────── 던지기 연출(컵 흔들기 · 쾅 · 벽 튕김 · 모서리 · 부딪힘 · 슬로모션) ─────────
 *
 * 한 판에 주사위 여러 개를 컵에 넣고 달그락달그락 흔들다 쾅 엎는다. 주사위는 판 위 펠트(벽이 있는
 * 상자) 안에서 벽에 튕기며 구르다 멈추고, 눈의 합만큼 말이 간다. 사건은 판마다 시드로 정한다.
 *   edge  — 한 개가 모서리로 서서 "설까 말까…" 흔들리다 넘어간다. 서 있는 동안 보이는 눈(가짜)은
 *           되도록 다른 가게 칸에 닿는 눈이다(아깝다).
 *   knock — 먼저 멈춘 주사위(가짜 눈)를 뒤에 온 주사위가 툭 쳐서 한 번 더 넘어간다.
 *   slow  — 마지막으로 멈추는 주사위는 슬로모션이다.
 *
 * 눈의 합은 언제나 거리(당첨 칸까지)다. 가짜 눈은 잠깐 보일 뿐 합에 들어가지 않는다 — 사건이
 * 당첨을 바꾸지 않는다. 당첨은 App 이 정했고(winnerIndex) 여기선 그 칸까지 가는 눈만 나눈다.
 *
 * 좌표는 펠트 상자 비(0~1)다. 주사위 자세(pose)는 CSS `rotateX(rx) rotateY(ry)` 각(도)이고,
 * 면 배치는 1 앞 · 6 뒤 · 3 오른쪽 · 4 왼쪽 · 2 위 · 5 아래(Dice.css 와 같다).
 */

export interface Pose {
  rx: number;
  ry: number;
}

/** 옆면(1·3·4·6)을 앞으로 돌리는 rotateY 각. */
const SIDE_Y: Record<number, number> = { 1: 0, 4: 90, 6: 180, 3: 270 };
const NORMALS: Record<number, [number, number, number]> = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  3: [1, 0, 0],
  4: [-1, 0, 0],
  2: [0, -1, 0],
  5: [0, 1, 0],
};

/** 자세 → 면마다 보는 사람 쪽(z) 성분. 1 이면 정면, cos 45° 면 모서리로 비스듬히. */
export function faceZ(pose: Pose): Record<number, number> {
  const ax = (pose.rx * Math.PI) / 180;
  const ay = (pose.ry * Math.PI) / 180;
  const out: Record<number, number> = {};
  for (const [f, [x, y, z]] of Object.entries(NORMALS)) {
    // rotateY 먼저(오른쪽 변환이 점에 먼저 걸린다), 그다음 rotateX.
    const z1 = -x * Math.sin(ay) + z * Math.cos(ay);
    const z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
    out[Number(f)] = z2;
  }
  return out;
}

/** 지금 정면(보는 사람 쪽)에 있는 면. */
export function frontFace(pose: Pose): number {
  const z = faceZ(pose);
  return Number(Object.keys(z).reduce((a, b) => (z[Number(a)] >= z[Number(b)] ? a : b)));
}

/** face 의 이웃 면(마주 보는 면과 자기 자신을 뺀 넷). */
export function neighborFaces(face: number): number[] {
  return [1, 2, 3, 4, 5, 6].filter((f) => f !== face && f !== 7 - face);
}

/**
 * face 를 정면으로 보이는 자세와, 이웃 면 near 를 정면으로 보이는 자세. 두 자세는 한 축으로만
 * 90° 다르다 — 그 사이를 이으면 한 모서리를 축으로 넘어가고, 가운데(45°)가 모서리로 선 모습이다.
 */
export function facePoses(face: number, near?: number): { final: Pose; near: Pose } {
  if (face in SIDE_Y) {
    const y = SIDE_Y[face];
    const options: Pose[] = [
      { rx: 0, ry: y + 90 },
      { rx: 0, ry: y - 90 },
      { rx: -90, ry: y },
      { rx: 90, ry: y },
    ];
    const n = options.find((p) => near !== undefined && frontFace(p) === near) ?? options[0];
    return { final: { rx: 0, ry: y }, near: n };
  }
  const rx = face === 2 ? -90 : 90;
  const y = near !== undefined && near in SIDE_Y ? SIDE_Y[near] : 0;
  return { final: { rx, ry: y }, near: { rx: 0, ry: y } };
}

export interface DieThrow {
  face: number;
  /** 컵에서 튀어나오는 시각 · 구르기를 멈추는 시각(ms). */
  startMs: number;
  settleMs: number;
  /** 출발점과 펼친 도착점(벽 반사를 펴 놓은 좌표). 접으면 실제 자리다(foldInto). */
  x0: number;
  y0: number;
  ux: number;
  uy: number;
  /** 구르는 동안 더 도는 바퀴 수(축마다)와 화면 안 회전(도). */
  spinX: number;
  spinY: number;
  rz0: number;
  rz: number;
  /** 통통 튀는 횟수. */
  hops: number;
  final: Pose;
  /** 구르기를 멈췄을 때 자세 — 보통은 final, 모서리면 45°, 부딪힐 주사위면 가짜 눈. */
  rest: Pose;
  /** 슬로모션(마지막에 멈추는 주사위) — 더 오래, 더 끈적하게 멈춘다. */
  slow: boolean;
}

export interface DicePlan {
  from: number;
  target: number;
  track: number;
  distance: number;
  faces: number[];
  /** 주사위 한 변(펠트 폭 비)과 벽 안쪽 여백. */
  size: number;
  margin: number;
  /** 컵 흔들기 끝 · 쾅(컵이 엎어짐) · 컵이 들려 주사위가 쏟아짐. */
  shakeMs: number;
  slamMs: number;
  openMs: number;
  dice: DieThrow[];
  /** 모서리로 선 주사위: 멈춘 뒤(settleMs) tipMs 까지 흔들리다 endMs 에 넘어간다. fakeCell 은 가짜 눈이면 닿을 칸. */
  edge: { die: number; fake: number; fakeCell: number; tipMs: number; endMs: number } | null;
  /** 부딪힘: hitter 가 멈추는 순간(atMs) target 이 밀리며 가짜 눈에서 진짜 눈으로 넘어간다. */
  knock: { hitter: number; target: number; fake: number; fakeCell: number; atMs: number; endMs: number; dx: number; dy: number } | null;
  /** 슬로모션 구간과 그때 카메라가 다가가는 주사위. */
  slowDie: number;
  slowFromMs: number;
  slowToMs: number;
  /** 다 멈춤 · 합 보여 주기 · 말 출발. */
  rolledMs: number;
  sumMs: number;
  walkMs: number;
  /** 말이 k+1 번째 칸에 닿는 시각. 길이는 distance. */
  steps: number[];
  arriveMs: number;
  endMs: number;
  /** 벽에 부딪히는 시각(소리). */
  hits: number[];
}

/** 펠트 상자 안(여백 m)으로 반사해 접는다. */
export function foldInto(u: number, m: number): number {
  const len = 1 - 2 * m;
  const v = (u - m) / len;
  const w = ((v % 2) + 2) % 2;
  return m + (w <= 1 ? w : 2 - w) * len;
}

/** 접었을 때 end 가 되도록 벽에 k 번 튕기는 펼친 좌표. */
function unfold(end: number, k: number, dir: 1 | -1, m: number): number {
  const len = 1 - 2 * m;
  const q = (end - m) / len;
  if (k === 0) return end;
  const v = dir > 0 ? k + (k % 2 ? 1 - q : q) : -k + (k % 2 ? -q : q);
  return m + v * len;
}

/** 합이 d 인 주사위 k 개(각 1~6). k ≤ d ≤ 6k 여야 한다. */
export function splitDice(d: number, k: number, random: () => number): number[] {
  const out: number[] = [];
  let left = d;
  for (let i = 0; i < k; i += 1) {
    const after = k - i - 1;
    const lo = Math.max(1, left - after * 6);
    const hi = Math.min(6, left - after);
    const eyes = after === 0 ? left : lo + Math.floor(random() * (hi - lo + 1));
    out.push(eyes);
    left -= eyes;
  }
  return out;
}

/**
 * 말이 출발할 칸. 보통은 지난 판 자리(home)다. 주사위 여섯 개(36칸)로 못 닿는 먼 거리거나
 * 거리가 1 인데 한 바퀴를 더 돌면 36칸을 넘는 큰 판(후보 33곳~)이면, 닿는 자리에서 출발한다.
 */
export function throwFrom(home: number, target: number, track: number): number {
  const reach = MAX_ROLLS * 6;
  const d = distanceTo(home, target, track);
  const lap = d < 2 ? d + track : d;
  if (lap <= reach) return ((home % track) + track) % track;
  const back = d < 2 ? 2 : reach;
  return (((target - back) % track) + track) % track;
}

/** 이 판에 던지는 주사위 수. 둘 이상이어야 부딪힐 수 있다. */
export function diceCount(distance: number): number {
  return Math.min(MAX_ROLLS, Math.max(2, Math.ceil(distance / 6)));
}

/** 연출 길이 상한·하한(ms). App 의 연출 잠금(30초)보다 한참 짧고, 다른 게임과 비슷하게. */
export const DICE_MIN_MS = 4600;
export const DICE_MAX_MS = 7100;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 한 판의 일정. from 칸에서 target 칸까지(시계 방향) 가는 눈을 주사위 여러 개로 나눠 던진다.
 * 거리가 1이면(주사위 두 개로는 못 만든다) 한 바퀴 더 돈다. isPlace 는 가게가 있는 칸인지 —
 * 가짜 눈을 "아깝다" 칸으로 고르는 데만 쓴다.
 */
export function dicePlan(
  from: number,
  target: number,
  track: number,
  random: () => number,
  isPlace: (cell: number) => boolean = () => false,
): DicePlan {
  let distance = distanceTo(from, target, track);
  if (distance < 2) distance += track;
  const k = diceCount(distance);
  const faces = splitDice(distance, k, random);
  const size = k >= 4 ? 0.14 : 0.17;
  // 벽 안쪽 여백 — 슬로모션 띠(위아래 6%)에 주사위가 가리지 않게 넉넉히.
  const margin = size / 2 + 0.06;

  const shakeMs = Math.round(950 + random() * 250);
  const slamMs = shakeMs + 150;
  const openMs = slamMs + 200;

  // 사건 고르기.
  let edgeOn = random() < 0.45;
  let knockOn = random() < 0.4;
  if (edgeOn && knockOn && k < 3) {
    if (random() < 0.5) edgeOn = false;
    else knockOn = false;
  }
  const order = Array.from({ length: k }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const edgeDie = edgeOn ? order[0] : -1;
  const knockTarget = knockOn ? order[edgeOn ? 1 : 0] : -1;
  const knockHitter = knockOn ? order[edgeOn ? 2 : 1] : -1;

  /** 이웃 면 중 가짜 눈. 다른 가게 칸에 닿는 눈을 먼저 고른다. */
  const pickFake = (die: number) => {
    const face = faces[die];
    const options = neighborFaces(face).map((g) => ({ g, cell: (from + distance - face + g) % track }));
    const other = options.filter((o) => o.cell !== target % track);
    const near = other.filter((o) => isPlace(o.cell));
    const pool = near.length > 0 ? near : other.length > 0 ? other : options;
    return pool[Math.floor(random() * pool.length)];
  };

  // 멈출 자리. 서로 겹치지 않게 흩는다(부딪힘은 두 주사위를 붙여 둔다).
  const ends: { x: number; y: number }[] = new Array(k);
  const free = (p: { x: number; y: number }) => ends.every((e) => !e || Math.hypot(e.x - p.x, e.y - p.y) > size * 1.45);
  const inBox = (p: { x: number; y: number }) => p.x >= margin && p.x <= 1 - margin && p.y >= margin && p.y <= 1 - margin;
  const randomPoint = () => ({ x: lerp(margin, 1 - margin, random()), y: lerp(margin, 1 - margin, random()) });
  let knockDir = { x: 1, y: 0 };
  if (knockOn) {
    for (let tries = 0; tries < 40; tries += 1) {
      const t = randomPoint();
      const a = random() * Math.PI * 2;
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      const h = { x: t.x + dir.x * size * 1.08, y: t.y + dir.y * size * 1.08 };
      const pushed = { x: t.x - dir.x * 0.07, y: t.y - dir.y * 0.07 };
      if (inBox(h) && inBox(pushed)) {
        ends[knockTarget] = t;
        ends[knockHitter] = h;
        knockDir = dir;
        break;
      }
    }
    if (!ends[knockTarget]) {
      ends[knockTarget] = { x: 0.4, y: 0.5 };
      ends[knockHitter] = { x: 0.4 + size * 1.08, y: 0.5 };
    }
  }
  for (let i = 0; i < k; i += 1) {
    if (ends[i]) continue;
    let p = randomPoint();
    for (let tries = 0; tries < 60 && !free(p); tries += 1) p = randomPoint();
    if (!free(p)) p = { x: lerp(margin, 1 - margin, (i + 0.5) / k), y: i % 2 ? 0.3 : 0.7 };
    ends[i] = p;
  }

  // 구르기.
  const dice: DieThrow[] = faces.map((face, i) => {
    const x0 = 0.5 + (random() - 0.5) * 0.08;
    const y0 = 0.5 + (random() - 0.5) * 0.08;
    let kx = Math.floor(random() * 3);
    const ky = Math.floor(random() * 3);
    if (kx + ky === 0) kx = 1;
    const sx: 1 | -1 = random() < 0.5 ? 1 : -1;
    const sy: 1 | -1 = random() < 0.5 ? 1 : -1;
    const startMs = openMs + i * 60;
    const poses = facePoses(face);
    return {
      face,
      startMs,
      settleMs: Math.round(startMs + 900 + random() * 250),
      x0,
      y0,
      ux: unfold(ends[i].x, kx, sx, margin),
      uy: unfold(ends[i].y, ky, sy, margin),
      spinX: 1 + Math.floor(random() * 2),
      spinY: 1 + Math.floor(random() * 2),
      rz0: (random() < 0.5 ? -1 : 1) * (200 + random() * 300),
      rz: (random() - 0.5) * 30,
      hops: kx + ky + 1,
      final: poses.final,
      rest: poses.final,
      slow: false,
    };
  });

  let knock: DicePlan['knock'] = null;
  if (knockOn) {
    const t = dice[knockTarget];
    const h = dice[knockHitter];
    const fake = pickFake(knockTarget);
    const poses = facePoses(t.face, fake.g);
    t.final = poses.final;
    t.rest = poses.near;
    t.settleMs = Math.round(t.startMs + 650 + random() * 130);
    const atMs = Math.round(t.settleMs + 320 + random() * 140);
    h.settleMs = atMs;
    knock = {
      hitter: knockHitter,
      target: knockTarget,
      fake: fake.g,
      fakeCell: fake.cell,
      atMs,
      endMs: atMs + 300,
      dx: -knockDir.x * 0.07,
      dy: -knockDir.y * 0.07,
    };
  }

  /** 주사위마다 마지막으로 움직임이 끝나는 시각. */
  const doneAt = (i: number) => (knock && i === knock.target ? knock.endMs : dice[i].settleMs);

  let edge: DicePlan['edge'] = null;
  let slowFromMs: number;
  let slowToMs: number;
  let slowDie: number;
  if (edgeOn) {
    const e = dice[edgeDie];
    const fake = pickFake(edgeDie);
    const poses = facePoses(e.face, fake.g);
    e.final = poses.final;
    e.rest = { rx: (poses.final.rx + poses.near.rx) / 2, ry: (poses.final.ry + poses.near.ry) / 2 };
    const others = dice.map((_, i) => i).filter((i) => i !== edgeDie);
    const lastOther = Math.max(...others.map(doneAt));
    e.settleMs = Math.max(e.settleMs, lastOther + 150);
    e.slow = true;
    const tipMs = Math.round(e.settleMs + 850 + random() * 250);
    edge = { die: edgeDie, fake: fake.g, fakeCell: fake.cell, tipMs, endMs: tipMs + 340 };
    slowDie = edgeDie;
    slowFromMs = e.settleMs - 300;
    slowToMs = edge.endMs + 120;
  } else {
    const last = dice.map((_, i) => i).reduce((a, b) => (doneAt(b) > doneAt(a) ? b : a), 0);
    slowDie = last;
    if (knock && last === knock.target) {
      slowFromMs = knock.atMs - 450;
      slowToMs = knock.endMs + 120;
    } else {
      const d = dice[last];
      d.settleMs += 550;
      d.slow = true;
      slowFromMs = d.settleMs - 800;
      slowToMs = d.settleMs + 120;
    }
  }

  const rolledMs = Math.max(...dice.map((_, i) => doneAt(i)), edge?.endMs ?? 0);
  const sumMs = rolledMs + 280;
  const walkMs = sumMs + 520;
  const SPOT = 700;
  const slowSteps = distance >= 3 ? 1.6 : 0;
  const room = DICE_MAX_MS - SPOT - walkMs;
  const stepMs = Math.max(45, Math.min(300, 1500 / (distance + slowSteps), room / (distance + slowSteps)));
  const steps: number[] = [];
  let t = walkMs;
  for (let s = 1; s <= distance; s += 1) {
    t += distance >= 3 && s > distance - 2 ? stepMs * 1.8 : stepMs;
    steps.push(Math.round(t));
  }
  const arriveMs = steps[steps.length - 1];
  const plan: DicePlan = {
    from,
    target,
    track,
    distance,
    faces,
    size,
    margin,
    shakeMs,
    slamMs,
    openMs,
    dice,
    edge,
    knock,
    slowDie,
    slowFromMs,
    slowToMs,
    rolledMs,
    sumMs,
    walkMs,
    steps,
    arriveMs,
    endMs: arriveMs + SPOT,
    hits: [],
  };

  // 너무 짧으면 컵을 더 오래 흔든다(뒤 일정을 통째로 민다).
  const pad = Math.max(0, DICE_MIN_MS - plan.endMs);
  if (pad > 0) shiftPlan(plan, pad);
  plan.hits = wallHits(plan);
  return plan;
}

/** 컵 흔들기를 pad 만큼 늘리고 그 뒤 일정을 모두 민다. */
function shiftPlan(plan: DicePlan, pad: number) {
  plan.shakeMs += pad;
  plan.slamMs += pad;
  plan.openMs += pad;
  for (const d of plan.dice) {
    d.startMs += pad;
    d.settleMs += pad;
  }
  if (plan.edge) {
    plan.edge.tipMs += pad;
    plan.edge.endMs += pad;
  }
  if (plan.knock) {
    plan.knock.atMs += pad;
    plan.knock.endMs += pad;
  }
  plan.slowFromMs += pad;
  plan.slowToMs += pad;
  plan.rolledMs += pad;
  plan.sumMs += pad;
  plan.walkMs += pad;
  plan.steps = plan.steps.map((s) => s + pad);
  plan.arriveMs += pad;
  plan.endMs += pad;
}

const tumbleEase = (x: number, slow: boolean) => 1 - (1 - x) ** (slow ? 3.2 : 2.2);

/** 벽에 닿는 시각들. 펼친 좌표가 벽 칸(정수)을 넘는 순간이다. */
function wallHits(plan: DicePlan): number[] {
  const out: number[] = [];
  const len = 1 - 2 * plan.margin;
  for (const d of plan.dice) {
    for (const [a, b] of [
      [d.x0, d.ux],
      [d.y0, d.uy],
    ]) {
      const va = (a - plan.margin) / len;
      const vb = (b - plan.margin) / len;
      const lo = Math.min(va, vb);
      const hi = Math.max(va, vb);
      for (let c = Math.ceil(lo); c <= Math.floor(hi); c += 1) {
        if (c === va || c === vb) continue;
        const e = (c - va) / (vb - va);
        // e = 1 − (1 − x)^p → x = 1 − (1 − e)^(1/p)
        const x = 1 - (1 - e) ** (1 / (d.slow ? 3.2 : 2.2));
        out.push(Math.round(d.startMs + x * (d.settleMs - d.startMs)));
      }
    }
  }
  return out.sort((a, b) => a - b);
}

export interface DieFrame {
  /** 컵 밖으로 나왔는가. */
  out: boolean;
  x: number;
  y: number;
  pose: Pose;
  rz: number;
  /** 튀어 오른 높이(0~1). 크기·그림자로 그린다. */
  lift: number;
  /** 모서리로 서서 흔들리는 중. */
  teeter: boolean;
}

/** i 번째 주사위의 ms 시각 모습. */
export function dieAt(plan: DicePlan, i: number, ms: number): DieFrame {
  const d = plan.dice[i];
  const m = plan.margin;
  if (ms < d.startMs) return { out: false, x: d.x0, y: d.y0, pose: d.rest, rz: d.rz0, lift: 0, teeter: false };
  if (ms < d.settleMs) {
    const e = tumbleEase((ms - d.startMs) / (d.settleMs - d.startMs), d.slow);
    return {
      out: true,
      x: foldInto(lerp(d.x0, d.ux, e), m),
      y: foldInto(lerp(d.y0, d.uy, e), m),
      pose: { rx: d.rest.rx + d.spinX * 360 * (1 - e), ry: d.rest.ry + d.spinY * 360 * (1 - e) },
      rz: d.rz + d.rz0 * (1 - e),
      lift: (1 - e) * Math.abs(Math.sin(Math.PI * e * d.hops)),
      teeter: false,
    };
  }
  let x = foldInto(d.ux, m);
  let y = foldInto(d.uy, m);
  const k = plan.knock;
  if (k && k.target === i && ms >= k.atMs) {
    const u = clamp01((ms - k.atMs) / (k.endMs - k.atMs));
    const e = 1 - (1 - u) ** 2;
    x += k.dx * e;
    y += k.dy * e;
    return {
      out: true,
      x,
      y,
      pose: { rx: lerp(d.rest.rx, d.final.rx, e), ry: lerp(d.rest.ry, d.final.ry, e) },
      rz: d.rz + 12 * e,
      lift: Math.sin(Math.PI * u) * 0.5,
      teeter: false,
    };
  }
  const g = plan.edge;
  if (g && g.die === i) {
    if (ms < g.tipMs) {
      // 모서리 축으로 흔들린다 — 점점 크게, 넘어가기 직전 가장 크게.
      const s = (ms - d.settleMs) / (g.tipMs - d.settleMs);
      const amp = 4 + 10 * s;
      const w = Math.sin(((ms - d.settleMs) / 1000) * Math.PI * 2 * 2.4) * amp;
      const ax = Math.sign(d.final.rx - d.rest.rx);
      const ay = Math.sign(d.final.ry - d.rest.ry);
      return { out: true, x, y, pose: { rx: d.rest.rx + ax * w, ry: d.rest.ry + ay * w }, rz: d.rz, lift: 0, teeter: true };
    }
    const u = clamp01((ms - g.tipMs) / (g.endMs - g.tipMs));
    // 처음엔 천천히, 끝에서 쿵 — 넘어지는 모양.
    const e = u * u;
    return {
      out: true,
      x,
      y,
      pose: { rx: lerp(d.rest.rx, d.final.rx, e), ry: lerp(d.rest.ry, d.final.ry, e) },
      rz: d.rz,
      lift: 0,
      teeter: false,
    };
  }
  return { out: true, x, y, pose: d.rest, rz: d.rz, lift: 0, teeter: false };
}

/** 말이 지금 서 있는 둘레 칸. */
export function pawnAt(plan: DicePlan, ms: number): number {
  let n = 0;
  while (n < plan.steps.length && plan.steps[n] <= ms) n += 1;
  return (plan.from + n) % plan.track;
}

export type DicePhase = 'shake' | 'slam' | 'roll' | 'sum' | 'walk' | 'spot';

export function dicePhase(plan: DicePlan, ms: number): DicePhase {
  if (ms < plan.shakeMs) return 'shake';
  if (ms < plan.openMs) return 'slam';
  if (ms < plan.sumMs) return 'roll';
  if (ms < plan.walkMs) return 'sum';
  if (ms < plan.arriveMs) return 'walk';
  return 'spot';
}
