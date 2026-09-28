/**
 * 구슬 레이스 — 핀볼 판을 굴러 내려가 먼저 도착한 구슬이 당첨.
 *
 * 확률 문제부터 짚는다. 물리 레이스는 출발 위치와 판 모양 때문에 **균등하지
 * 않다.** 가운데에서 출발한 구슬이 더 자주 이긴다. 그대로 쓰면 화면에 적어 둔
 * "어느 쪽으로 돌려도 확률은 같습니다" 가 거짓말이 된다.
 *
 * 그래서 순서를 뒤집는다.
 *  1. 당첨을 균등 난수로 먼저 뽑는다 (다른 모드와 똑같이).
 *  2. 그 구슬이 1등으로 들어오는 시드를 찾는다 (seedForWinner).
 *  3. 그 시드의 경기를 그대로 재생한다.
 *
 * 물리는 조작하지 않는다. 실제로 일어난 여러 경기 중 하나를 고를 뿐이다.
 * 구슬이 벽을 뚫거나 갑자기 빨라지는 일은 없다.
 */

/** 판 크기. 화면 좌표와 같은 단위를 쓴다. */
export const BOARD_W = 320;
export const BOARD_H = 330;

const MARBLE_R = 8;
const PEG_R = 7;
const GRAVITY = 0.42;
const RESTITUTION = 0.62;
const FRICTION = 0.995;
const MAX_SPEED = 9;
/** 결승선. 그리는 쪽도 이 값을 써야 구슬이 선 위에 멈춘 것으로 보인다. */
export const FINISH_Y = BOARD_H - 20;
const MAX_STEPS = 1400;

export interface Peg {
  x: number;
  y: number;
}

export interface RaceResult {
  /** frames[t][i] = 시각 t 에서 i 번 구슬의 위치. */
  frames: { x: number; y: number }[][];
  /** 들어온 순서(구슬 번호). 완주하지 못한 구슬은 뒤에 붙는다. */
  order: number[];
  winner: number;
  /**
   * 당첨 구슬이 결승선에 닿은 프레임.
   * 재생은 여기서 끝낸다 — 끝까지 재생하면 1등이 한참 전에 들어와 김이 샌다.
   */
  winnerFrame: number;
}

/** 재현 가능한 난수 (mulberry32). 같은 시드는 항상 같은 경기를 만든다. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 핀 배치. 시드와 무관하게 항상 같다 — 실제 핀볼 기계처럼 판은 고정이고
 * 구슬의 출발 미세차이만 달라진다.
 */
export function buildPegs(): Peg[] {
  const pegs: Peg[] = [];
  const rows = 9;
  const top = 54;
  const gapY = (FINISH_Y - top - 24) / rows;

  // 핀이 성글면 구슬이 그냥 떨어진다. 구슬 지름(16) + 핀 지름(14) 이
  // 가로 간격의 절반은 되도록 촘촘하게 깐다.
  //
  // 좌우 대칭으로 깐다. 한쪽으로만 엇갈리게 깔면 판이 기울어서 특정 레인이
  // 구조적으로 불리해진다 — 실제로 그렇게 깔았더니 오른쪽 끝 레인이
  // 600 시드 중 한 번도 못 이겼다.
  const cols = 8;
  const gapX = BOARD_W / cols;

  for (let row = 0; row < rows; row += 1) {
    const staggered = row % 2 === 1;
    const offset = staggered ? gapX / 2 : 0;
    for (let col = 0; col < cols; col += 1) {
      const x = gapX / 2 + col * gapX + offset;
      if (x > BOARD_W - PEG_R) continue;
      pegs.push({ x, y: top + row * gapY });
    }
  }
  return pegs;
}

const PEGS = buildPegs();

/** 시드 하나로 경기를 끝까지 돌린다. 물리는 여기서만 일어난다. */
export function simulateRace(count: number, seed: number): RaceResult {
  const random = rng(seed);
  const lane = BOARD_W / (count + 1);

  const x = new Array<number>(count);
  const y = new Array<number>(count);
  const vx = new Array<number>(count);
  const vy = new Array<number>(count);
  const done = new Array<boolean>(count).fill(false);

  // 출발 레인을 시드로 섞는다. 판이 아무리 대칭이어도 레인마다 유불리가
  // 남는데, 구슬을 레인에 고정하면 그 유불리가 특정 구슬에 눌어붙는다.
  // 섞어 두면 어떤 구슬이든 어떤 레인에서 출발할 수 있다.
  const lanes = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }

  for (let i = 0; i < count; i += 1) {
    x[i] = lane * (lanes[i] + 1) + (random() - 0.5) * lane * 0.5;
    y[i] = 18 + random() * 14;
    vx[i] = (random() - 0.5) * 1.6;
    vy[i] = 0;
  }

  const frames: { x: number; y: number }[][] = [];
  const order: number[] = [];
  let winnerFrame = 0;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    for (let i = 0; i < count; i += 1) {
      if (done[i]) continue;

      vy[i] += GRAVITY;
      vx[i] *= FRICTION;

      const speed = Math.hypot(vx[i], vy[i]);
      if (speed > MAX_SPEED) {
        vx[i] = (vx[i] / speed) * MAX_SPEED;
        vy[i] = (vy[i] / speed) * MAX_SPEED;
      }

      x[i] += vx[i];
      y[i] += vy[i];

      // 벽
      if (x[i] < MARBLE_R) {
        x[i] = MARBLE_R;
        vx[i] = Math.abs(vx[i]) * RESTITUTION;
      } else if (x[i] > BOARD_W - MARBLE_R) {
        x[i] = BOARD_W - MARBLE_R;
        vx[i] = -Math.abs(vx[i]) * RESTITUTION;
      }

      // 핀
      for (const peg of PEGS) {
        const dx = x[i] - peg.x;
        const dy = y[i] - peg.y;
        const dist = Math.hypot(dx, dy);
        const min = MARBLE_R + PEG_R;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        // 겹친 만큼 밀어낸다
        x[i] = peg.x + nx * min;
        y[i] = peg.y + ny * min;
        // 법선 방향 속도만 뒤집는다
        const vn = vx[i] * nx + vy[i] * ny;
        vx[i] = (vx[i] - 2 * vn * nx) * RESTITUTION;
        vy[i] = (vy[i] - 2 * vn * ny) * RESTITUTION;
      }

      if (y[i] >= FINISH_Y) {
        y[i] = FINISH_Y;
        done[i] = true;
        order.push(i);
        if (order.length === 1) winnerFrame = frames.length;
      }
    }

    // 구슬끼리 충돌. 없으면 구슬이 서로 겹쳐 지나가 핀볼로 안 보인다.
    // 질량이 같다고 보고 법선 방향 속도를 교환한다.
    for (let i = 0; i < count; i += 1) {
      if (done[i]) continue;
      for (let j = i + 1; j < count; j += 1) {
        if (done[j]) continue;

        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const dist = Math.hypot(dx, dy);
        const min = MARBLE_R * 2;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;

        // 겹친 만큼 반씩 밀어낸다
        const push = (min - dist) / 2;
        x[i] -= nx * push;
        y[i] -= ny * push;
        x[j] += nx * push;
        y[j] += ny * push;

        // 서로 멀어지는 중이면 튕길 필요가 없다
        const rel = (vx[j] - vx[i]) * nx + (vy[j] - vy[i]) * ny;
        if (rel > 0) continue;

        const impulse = -(1 + RESTITUTION) * rel * 0.5;
        vx[i] -= impulse * nx;
        vy[i] -= impulse * ny;
        vx[j] += impulse * nx;
        vy[j] += impulse * ny;
      }
    }

    frames.push(Array.from({ length: count }, (_, i) => ({ x: x[i], y: y[i] })));

    if (order.length === count) break;
  }

  // 완주 못 한 구슬은 아래에 있는 순서대로 뒤에 붙인다.
  if (order.length < count) {
    const rest = Array.from({ length: count }, (_, i) => i)
      .filter((i) => !order.includes(i))
      .sort((a, b) => y[b] - y[a]);
    order.push(...rest);
  }

  return { frames, order, winner: order[0], winnerFrame };
}

/**
 * target 구슬이 1등으로 들어오는 시드를 찾는다.
 *
 * 물리를 건드리지 않고 "그 결과가 나온 경기" 를 고르는 방식이라, 당첨 확률은
 * 호출하는 쪽의 균등 난수가 그대로 결정한다.
 *
 * 못 찾으면 null 을 돌려준다 — 호출하는 쪽이 다른 연출로 넘어가야 한다.
 */
export function seedForWinner(
  count: number,
  target: number,
  maxSeeds = 600,
  startSeed = 1,
): number | null {
  if (count <= 0 || target < 0 || target >= count) return null;
  if (count === 1) return startSeed;

  for (let s = startSeed; s < startSeed + maxSeeds; s += 1) {
    if (simulateRace(count, s).winner === target) return s;
  }
  return null;
}
