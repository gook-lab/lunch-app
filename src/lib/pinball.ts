/**
 * 핀볼 — 이름 붙은 구슬들이 코스를 굴러 내려가 먼저 도착한 구슬이 당첨.
 *
 * 확률 문제부터 짚는다. 물리 레이스는 출발 위치와 판 모양 때문에 **균등하지
 * 않다.** 그대로 쓰면 화면에 적어 둔 "어느 쪽으로 돌려도 확률은 같습니다" 가
 * 거짓말이 된다.
 *
 * 그래서 순서를 뒤집는다.
 *  1. 당첨을 균등 난수로 먼저 뽑는다 (다른 모드와 똑같이).
 *  2. 그 구슬이 1등으로 들어오는 시드를 찾는다 (seedForWinner).
 *  3. 그 시드의 경기를 그대로 재생한다.
 *
 * 물리는 조작하지 않는다. 실제로 일어난 여러 경기 중 하나를 고를 뿐이다.
 * 구슬이 벽을 뚫거나 갑자기 빨라지는 일은 없다.
 *
 * 코스는 위에서 내려다본 핀볼대다 — 롤오버 레인, 팝 범퍼, 오르빗 레인,
 * 슬링샷, 인레인과 드레인. 핀을 줄지어 박은 예전 판은 두 번이나
 * "단조롭다" 는 평을 들었다. 벽은 선분이라 점-선분 최단거리로 충돌을 보고,
 * 구슬끼리도 부딪친다.
 */
import { seededRandom } from './random';

/** 구슬이 굴러가는 코스 폭. 캔버스는 이보다 넓고, 남는 오른쪽이 순위판이다. */
export const COURSE_W = 208;
export const BOARD_H = 372;

const MARBLE_R = 7;
const PEG_R = 6;
const WALL_R = 3;
/*
 * 속도 감각. 예전 값(중력 0.4, 최고속 8.5)은 1등이 52프레임(0.9초) 만에
 * 들어와서, 재생을 4초로 늘리면 0.22배 슬로모션이 됐다. 출발 직후 정지
 * 구간이 0.7초나 늘어나 "초반에 멈춰 있다" 로 보였다. 지금은 코스가 길고
 * 장애물이 많아 실제 경기 자체가 2~4초이고, 거의 그대로 재생한다.
 */
const GRAVITY = 0.16;
const RESTITUTION = 0.6;
const FRICTION = 0.997;
const MAX_SPEED = 5.2;
/** 출발 때 아래로 미는 속도. 0 이면 처음 몇 프레임이 제자리처럼 보인다. */
const LAUNCH_VY = 1.6;
/** 결승선. 그리는 쪽도 이 값을 써야 구슬이 선 위에 멈춘 것으로 보인다. */
export const FINISH_Y = BOARD_H - 16;
const MAX_STEPS = 3000;

export interface Peg {
  x: number;
  y: number;
  r: number;
  /** 범퍼. 맞으면 튕겨 나온다(반발계수 1 초과). */
  bumper?: boolean;
}

/** 범퍼 반발계수. 1 을 넘어서 맞은 구슬이 더 빨라진다(최고속 제한은 받는다). */
const BUMPER_BOUNCE = 1.15;

/** 지그재그 벽 한 조각. */
export interface Wall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /**
   * rail = 금속 가이드(그냥 튕김), sling = 슬링샷 고무(차낸다),
   * post = 레인 칸막이(짧은 기둥).
   */
  kind?: 'rail' | 'sling' | 'post';
}

/** 슬링샷 반발계수와 최소 차내기 속도. */
const SLING_BOUNCE = 1.1;
const SLING_KICK = 2.6;

export interface MarbleAt {
  x: number;
  y: number;
}

export interface RaceResult {
  /** frames[t][i] = 시각 t 에서 i 번 구슬의 위치. */
  frames: MarbleAt[][];
  /** frames[t] 시점의 순위(구슬 번호). 순위판이 실시간으로 이걸 읽는다. */
  standings: number[][];
  /** 최종 순서(구슬 번호). 완주하지 못한 구슬은 뒤에 붙는다. */
  order: number[];
  winner: number;
  /** 당첨 구슬이 결승선에 닿은 프레임. 재생은 여기서 끝낸다. */
  winnerFrame: number;
}

/**
 * 코스. 시드와 무관하게 항상 같다 — 실제 핀볼 기계처럼 판은 고정이고
 * 구슬의 출발 미세차이만 달라진다.
 *
 * 벽은 좌우 대칭으로 깐다. 한쪽으로만 기울이면 특정 레인이 구조적으로
 * 불리해진다 — 예전 균일 핀밭에서 오른쪽 끝 구슬이 600 시드 중 한 번도
 * 못 이긴 적이 있다.
 */
export function buildCourse(): { walls: Wall[]; pegs: Peg[] } {
  const walls: Wall[] = [];
  const pegs: Peg[] = [];
  const C = COURSE_W / 2;
  /** 가운데 기준 좌우 대칭으로 한 쌍. dx=0 이면 하나만. */
  /*
   * 틈 규칙: 두 장애물 사이(반지름 빼고) 틈은 구슬 지름 14px 보다 넉넉해야
   * 한다. 좁으면 구슬이 그 주머니에 얹혀 경기가 안 끝난다 — 첫 탑다운 판에서
   * 다섯 군데가 그랬다(pinball.test.ts "전원 완주").
   */
  const pair = (dx: number, y: number, r: number, bumper = false) => {
    pegs.push({ x: C - dx, y, r, bumper });
    if (dx !== 0) pegs.push({ x: C + dx, y, r, bumper });
  };
  const wallPair = (x1: number, y1: number, x2: number, y2: number, kind: Wall['kind'] = 'rail') => {
    walls.push({ x1, y1, x2, y2, kind });
    walls.push({ x1: COURSE_W - x1, y1, x2: COURSE_W - x2, y2, kind });
  };

  // 롤오버 레인 — 맨 위 칸막이 넷이 다섯 레인을 만든다. 출발 줄이 여기서 갈린다.
  for (const x of [28, 78]) wallPair(x, 36, x, 54, 'post');

  // 오르빗 레인 — 양쪽 벽을 따라 내려가는 좁은 길. 들어가면 빠르게 떨어진다.
  wallPair(24, 78, 24, 168);

  // 팝 범퍼 — 삼각 배치. 맞으면 튕겨 순위가 뒤집힌다.
  pair(32, 104, 12, true);
  pair(0, 136, 12, true);

  // 범퍼 밑 기둥과 램프 입구 가이드
  pair(52, 150, PEG_R - 1);
  wallPair(44, 182, 70, 196);

  // 스탠드업 타깃 — 가운데 작은 기둥 둘. 셋을 붙여 두면 사이(6px)에 구슬이 얹혀 멈췄다.
  pair(16, 214, PEG_R - 2);

  // 슬링샷 — 인레인 옆 삼각형. 빗변 고무가 구슬을 가운데로 차낸다.
  wallPair(30, 238, 30, 280);
  wallPair(30, 280, 58, 292);
  wallPair(30, 238, 58, 292, 'sling');

  // 인레인과 드레인 — 양쪽 가이드가 가운데 배수구로 모은다(플리퍼 자리).
  wallPair(0, 300, 72, 334);
  pair(0, 318, PEG_R - 2);

  return { walls, pegs };
}

const COURSE = buildCourse();

/** 점에서 선분까지의 최단 지점. */
function closestOnSegment(px: number, py: number, w: Wall) {
  const dx = w.x2 - w.x1;
  const dy = w.y2 - w.y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: w.x1, y: w.y1 };
  let t = ((px - w.x1) * dx + (py - w.y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: w.x1 + t * dx, y: w.y1 + t * dy };
}

/** 시드 하나로 경기를 끝까지 돌린다. 물리는 여기서만 일어난다. */
export function simulateRace(count: number, seed: number): RaceResult {
  const random = seededRandom(seed);
  const lane = COURSE_W / (count + 1);

  const x = new Array<number>(count);
  const y = new Array<number>(count);
  const vx = new Array<number>(count);
  const vy = new Array<number>(count);
  const done = new Array<boolean>(count).fill(false);

  // 출발 레인을 시드로 섞는다. 판이 아무리 대칭이어도 레인마다 유불리가
  // 남는데, 구슬을 레인에 고정하면 그 유불리가 특정 구슬에 눌어붙는다.
  const lanes = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }

  for (let i = 0; i < count; i += 1) {
    x[i] = lane * (lanes[i] + 1) + (random() - 0.5) * lane * 0.4;
    y[i] = 14 + random() * 12;
    vx[i] = (random() - 0.5) * 1.4;
    vy[i] = LAUNCH_VY + random() * 0.6;
  }

  const frames: MarbleAt[][] = [];
  const standings: number[][] = [];
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

      // 바깥 벽
      if (x[i] < MARBLE_R) {
        x[i] = MARBLE_R;
        vx[i] = Math.abs(vx[i]) * RESTITUTION;
      } else if (x[i] > COURSE_W - MARBLE_R) {
        x[i] = COURSE_W - MARBLE_R;
        vx[i] = -Math.abs(vx[i]) * RESTITUTION;
      }

      // 벽 (선분)
      for (const wall of COURSE.walls) {
        const near = closestOnSegment(x[i], y[i], wall);
        const dx = x[i] - near.x;
        const dy = y[i] - near.y;
        const dist = Math.hypot(dx, dy);
        const min = MARBLE_R + WALL_R;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        x[i] = near.x + nx * min;
        y[i] = near.y + ny * min;
        const vn = vx[i] * nx + vy[i] * ny;
        const sling = wall.kind === 'sling';
        const bounce = sling ? SLING_BOUNCE : RESTITUTION;
        vx[i] = (vx[i] - 2 * vn * nx) * bounce;
        vy[i] = (vy[i] - 2 * vn * ny) * bounce;
        if (sling) {
          const out = vx[i] * nx + vy[i] * ny;
          if (out < SLING_KICK) {
            vx[i] += nx * (SLING_KICK - out);
            vy[i] += ny * (SLING_KICK - out);
          }
        }
      }

      // 핀
      for (const peg of COURSE.pegs) {
        const dx = x[i] - peg.x;
        const dy = y[i] - peg.y;
        const dist = Math.hypot(dx, dy);
        const min = MARBLE_R + peg.r;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        x[i] = peg.x + nx * min;
        y[i] = peg.y + ny * min;
        const vn = vx[i] * nx + vy[i] * ny;
        const bounce = peg.bumper ? BUMPER_BOUNCE : RESTITUTION;
        vx[i] = (vx[i] - 2 * vn * nx) * bounce;
        vy[i] = (vy[i] - 2 * vn * ny) * bounce;
        if (peg.bumper) {
          // 범퍼는 최소한 이만큼은 튕긴다. 거의 멈춘 구슬이 범퍼 위에 얹히지 않게.
          const sp = Math.hypot(vx[i], vy[i]);
          if (sp < 2.2) {
            vx[i] += nx * (2.2 - sp);
            vy[i] += ny * (2.2 - sp);
          }
        }
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

        const push = (min - dist) / 2;
        x[i] -= nx * push;
        y[i] -= ny * push;
        x[j] += nx * push;
        y[j] += ny * push;

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

    // 이 시점의 순위. 들어온 구슬이 먼저, 나머지는 아래에 있는 순서다.
    const running = Array.from({ length: count }, (_, i) => i)
      .filter((i) => !done[i])
      .sort((a, b) => y[b] - y[a]);
    standings.push([...order, ...running]);

    if (order.length === count) break;
  }

  if (order.length < count) {
    const rest = Array.from({ length: count }, (_, i) => i)
      .filter((i) => !order.includes(i))
      .sort((a, b) => y[b] - y[a]);
    order.push(...rest);
  }

  return { frames, standings, order, winner: order[0], winnerFrame };
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
