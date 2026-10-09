/**
 * 핀볼 — 이름 붙은 구슬들이 코스를 굴러 내려가 먼저 도착한 구슬이 당첨.
 *
 * 확률 문제부터 짚는다. 물리 레이스는 출발 위치와 판 모양 때문에 **균등하지
 * 않다.** 그대로 쓰면 화면에 적어 둔 "어느 쪽으로 돌려도 확률은 같습니다" 가
 * 거짓말이 된다.
 *
 * 그래서 순서를 뒤집는다.
 *  1. 당첨을 균등 난수로 먼저 뽑는다 (다른 모드와 똑같이).
 *  2. 경기를 한 번 돌리고, 1등한 구슬과 당첨 구슬의 이름표를 맞바꾼다
 *     (raceForWinner). 구슬은 이름 말고 다른 점이 없어 맞바꿔도 같은 경기다.
 *  3. 그 경기를 그대로 재생한다.
 *
 * 물리는 조작하지 않는다. 구슬이 벽을 뚫거나 갑자기 빨라지는 일은 없다.
 * 예전에는 이기는 시드를 찾을 때까지 경기를 돌렸다(seedForWinner, 테스트에만
 * 남음). 판이 길어지자 후보 20곳에서 7.9초가 걸려 바꿨다.
 *
 * 코스는 화면보다 긴 마블 레이스 판이다(BOARD_H). 그리는 쪽이 선두를 따라
 * 카메라를 내린다. 위에서부터 갈매기 막대, 큰 사선 막대, 팝 범퍼, 오르빗과
 * 슬링샷, 핀밭, 범퍼 다이아몬드, 풍차 세 개, 핀밭과 사선 막대 한 번 더, 풍차 두 개, 그리고 좁은 출구 하나로 모이는 깔때기와 출구 위
 * 회전 막대. 마지막 깔때기에서 구슬이 한 줄로 서야 해서 막판 순위가 뒤집힌다.
 * 화면 한 장짜리 판은 세 번 "단조롭다" 는 평을 들었다.
 *
 * 벽은 선분이라 점-선분 최단거리로 충돌을 보고, 구슬끼리도 부딪친다.
 * 회전 막대는 스텝마다 각도가 정해진 선분이라 경기는 여전히 시드로 재현된다.
 */
import { seededRandom } from './random';

/** 구슬이 굴러가는 코스 폭. 캔버스는 이보다 넓고, 남는 오른쪽이 순위판이다. */
export const COURSE_W = 208;
/** 판 전체 높이. 화면(그리는 쪽 VIEW_H)보다 길어서 카메라가 따라 내려간다. */
export const BOARD_H = 1840;

const MARBLE_R = 7;
const PEG_R = 6;
const WALL_R = 3;
/*
 * 속도 감각. 예전 값(중력 0.4, 최고속 8.5)은 1등이 52프레임(0.9초) 만에
 * 들어와서, 재생을 4초로 늘리면 0.22배 슬로모션이 됐다. 출발 직후 정지
 * 구간이 0.7초나 늘어나 "초반에 멈춰 있다" 로 보였다. 지금은 코스가 길고
 * 장애물이 많아 실제 경기 자체가 2~4초이고, 거의 그대로 재생한다.
 */
const GRAVITY = 0.2;
const RESTITUTION = 0.6;
const FRICTION = 0.997;
const MAX_SPEED = 5.8;
/** 출발 때 아래로 미는 속도. 0 이면 처음 몇 프레임이 제자리처럼 보인다. */
const LAUNCH_VY = 1.6;
/** 결승선. 그리는 쪽도 이 값을 써야 구슬이 선 위에 멈춘 것으로 보인다. */
export const FINISH_Y = BOARD_H - 16;
const MAX_STEPS = 6000;

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

/**
 * 회전 막대(풍차, 출구 막대). 가운데를 축으로 일정한 속도로 돈다.
 * 스텝 t 의 각도는 phase + omega * t — 시드와 무관하게 늘 같다.
 */
export interface Spinner {
  x: number;
  y: number;
  /** 축에서 끝까지 길이. */
  half: number;
  /** 스텝당 회전(라디안). 부호가 방향. */
  omega: number;
  phase: number;
}

/** t 스텝일 때 회전 막대의 양 끝. 물리와 그리기가 같이 쓴다. */
export function spinnerEnds(sp: Spinner, t: number) {
  const a = sp.phase + sp.omega * t;
  const dx = Math.cos(a) * sp.half;
  const dy = Math.sin(a) * sp.half;
  return { x1: sp.x - dx, y1: sp.y - dy, x2: sp.x + dx, y2: sp.y + dy };
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
export interface Course {
  walls: Wall[];
  pegs: Peg[];
  spinners: Spinner[];
}

export function buildCourse(): Course {
  const walls: Wall[] = [];
  const pegs: Peg[] = [];
  const spinners: Spinner[] = [];
  const C = COURSE_W / 2;
  /*
   * 틈 규칙: 두 장애물 사이(반지름 빼고) 틈은 구슬 지름 14px 보다 넉넉해야
   * 한다. 좁으면 구슬이 그 주머니에 얹혀 경기가 안 끝난다 — 첫 탑다운 판에서
   * 다섯 군데가 그랬다(pinball.test.ts "전원 완주"). 같은 이유로 V 자로 모이는
   * 막대 쌍은 쓰지 않는다(바닥 틈이 좁아진다). 사선 막대는 Λ 로 짝짓는다.
   */
  const pair = (dx: number, y: number, r: number, bumper = false) => {
    pegs.push({ x: C - dx, y, r, bumper });
    if (dx !== 0) pegs.push({ x: C + dx, y, r, bumper });
  };
  const wallPair = (x1: number, y1: number, x2: number, y2: number, kind: Wall['kind'] = 'rail') => {
    walls.push({ x1, y1, x2, y2, kind });
    walls.push({ x1: COURSE_W - x1, y1, x2: COURSE_W - x2, y2, kind });
  };
  /** 옆벽의 톱니. 벽을 타고 곧장 떨어지는 구슬을 한 번씩 튕겨 낸다. */
  const notch = (y: number) => {
    wallPair(0, y, 9, y + 9, 'post');
    wallPair(9, y + 9, 0, y + 18, 'post');
  };

  // 1 — 갈매기 막대 두 줄. 출발 줄이 여기서 갈린다.
  for (const x0 of [24, 52, 80]) wallPair(x0, 82, x0 + 10, 72, 'post');
  for (const x0 of [40, 74]) wallPair(x0, 112, x0 + 10, 122, 'post');
  notch(140);

  // 2 — 큰 사선 막대. 좌우로 크게 휘둘린다. Λ 로 짝을 지어 바닥 틈이 넓다.
  wallPair(18, 210, 44, 180);
  wallPair(68, 180, 88, 204);
  pair(0, 236, PEG_R);
  notch(246);

  // 3 — 팝 범퍼 삼각 배치
  pair(34, 292, 12, true);
  pair(0, 326, 12, true);
  pair(70, 330, PEG_R - 1);

  // 4 — 오르빗 레일과 슬링샷
  wallPair(24, 370, 24, 450);
  pair(0, 410, PEG_R - 2);
  wallPair(34, 476, 34, 516);
  wallPair(34, 516, 60, 528);
  wallPair(34, 476, 60, 528, 'sling');
  notch(556);

  // 5 — 엇갈린 핀밭. 가로 간격 36px, 줄 간격 28px.
  for (const y of [596, 652]) for (const dx of [0, 36, 72]) pair(dx, y, PEG_R - 2);
  for (const y of [624, 680]) for (const dx of [18, 54]) pair(dx, y, PEG_R - 2);
  notch(706);

  // 판을 360px 늘렸다(10/8, "맵을 좀 더 늘려 줘"). 아래 세 구간이 새로 들어갔다.
  // 6 — 넓은 범퍼 삼각. 위쪽 삼각보다 벌려 놓아 좌우로 크게 튄다.
  pair(56, 752, 12, true);
  pair(0, 786, 12, true);
  pair(80, 800, PEG_R);

  // 7 — 큰 Λ 사선 막대 한 번 더. 가운데 기둥이 한가운데 길을 둘로 가른다.
  wallPair(16, 880, 40, 852);
  wallPair(64, 852, 86, 876);
  pair(0, 900, PEG_R);
  notch(916);

  // 8 — 두 번째 엇갈린 핀밭. 결승 직전 구간 앞에서 줄을 한 번 더 섞는다.
  for (const y of [950, 1006]) for (const dx of [0, 36, 72]) pair(dx, y, PEG_R - 2);
  for (const y of [978, 1034]) for (const dx of [18, 54]) pair(dx, y, PEG_R - 2);
  notch(1056);

  // 판을 488px 더 늘렸다(10/9, "핀볼은 재미있는데 좀 더 길게"). 9~12 구간이 새로 들어갔다.
  // 9 — 범퍼 다이아몬드. 세 범퍼가 마름모로 서서 한가운데로 온 구슬을 연달아 튕긴다.
  pair(40, 1110, 12, true);
  pair(0, 1146, 12, true);
  pair(40, 1182, 12, true);
  pair(80, 1146, PEG_R);
  notch(1206);

  // 10 — 풍차 세 개가 한 줄. 이웃끼리 반대로 돈다.
  spinners.push({ x: C - 60, y: 1250, half: 18, omega: 0.07, phase: 0 });
  spinners.push({ x: C, y: 1250, half: 18, omega: -0.07, phase: Math.PI / 2 });
  spinners.push({ x: C + 60, y: 1250, half: 18, omega: 0.07, phase: Math.PI });
  notch(1290);

  // 11 — 세 번째 엇갈린 핀밭
  for (const y of [1330, 1386]) for (const dx of [0, 36, 72]) pair(dx, y, PEG_R - 2);
  for (const y of [1358, 1414]) for (const dx of [18, 54]) pair(dx, y, PEG_R - 2);
  notch(1440);

  // 12 — 마지막 Λ 사선 막대
  wallPair(16, 1500, 40, 1472);
  wallPair(64, 1472, 86, 1496);
  pair(0, 1520, PEG_R);
  notch(1546);

  // 13 — 풍차 두 개. 서로 반대로 돌아 좌우 어느 쪽도 유리하지 않다.
  spinners.push({ x: C - 46, y: 1600, half: 22, omega: 0.055, phase: 0 });
  spinners.push({ x: C + 46, y: 1600, half: 22, omega: -0.055, phase: Math.PI });

  // 14 — 깔때기와 출구. 출구 폭 24px(구슬 14px)라 한 줄로만 빠진다.
  //      출구 위 회전 막대가 줄 선 구슬을 흔들어 막판 순위가 뒤집힌다.
  wallPair(0, 1638, C - 15, 1772);
  wallPair(C - 15, 1772, C - 15, 1814);
  spinners.push({ x: C, y: 1724, half: 17, omega: 0.15, phase: Math.PI / 2 });

  return { walls, pegs, spinners };
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
/**
 * untilWinner: 1등이 들어오는 순간 멈추고 프레임을 쌓지 않는다. 시드를 찾을
 * 때는 누가 1등인지만 알면 되므로 판이 길어져도 탐색 비용이 크게 늘지 않는다.
 */
export function simulateRace(count: number, seed: number, untilWinner = false): RaceResult {
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

      // 회전 막대. 막대 위 접점의 속도를 빼고 튕긴 뒤 다시 더한다 —
      // 돌아가는 막대에 맞으면 그 방향으로 쳐 내진다.
      for (const sp of COURSE.spinners) {
        const seg = spinnerEnds(sp, step);
        const near = closestOnSegment(x[i], y[i], seg);
        const dx = x[i] - near.x;
        const dy = y[i] - near.y;
        const dist = Math.hypot(dx, dy);
        const min = MARBLE_R + WALL_R;
        if (dist >= min || dist === 0) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        x[i] = near.x + nx * min;
        y[i] = near.y + ny * min;
        const svx = -sp.omega * (near.y - sp.y);
        const svy = sp.omega * (near.x - sp.x);
        const rvx = vx[i] - svx;
        const rvy = vy[i] - svy;
        const vn = rvx * nx + rvy * ny;
        if (vn >= 0) continue;
        vx[i] = rvx - (1 + RESTITUTION) * vn * nx + svx;
        vy[i] = rvy - (1 + RESTITUTION) * vn * ny + svy;
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

    if (untilWinner && order.length > 0) break;

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
    if (simulateRace(count, s, true).winner === target) return s;
  }
  return null;
}

/**
 * 당첨 구슬이 1등 하는 경기를 한 번에 만든다.
 *
 * 경기를 한 번 돌리고, 1등한 구슬과 당첨 구슬의 이름표를 맞바꾼다. 구슬끼리는
 * 이름 말고 다른 점이 없으므로 맞바꾼 궤적도 그대로 물리적으로 맞는 경기다.
 * 출발 자리만 바뀌는데, 어느 자리가 누구인지는 화면에서 아무도 모른다.
 *
 * seedForWinner 는 이기는 시드를 찾을 때까지 경기를 수백 번 돌렸다. 판을
 * 1840px 로 늘린 뒤 후보 20곳에서 최악 7.9초가 걸려 출발 게이트가 그만큼
 * 멈춰 있었다(10/9 실측). 이건 늘 경기 한 번이다.
 */
export function raceForWinner(count: number, target: number, seed: number): RaceResult | null {
  if (count <= 0 || target < 0 || target >= count) return null;
  const race = simulateRace(count, seed);
  const a = race.winner;
  if (a === target) return race;
  const swap = (i: number) => (i === a ? target : i === target ? a : i);
  return {
    frames: race.frames.map((f) => {
      const next = f.slice();
      next[a] = f[target];
      next[target] = f[a];
      return next;
    }),
    standings: race.standings.map((s) => s.map(swap)),
    order: race.order.map(swap),
    winner: target,
    winnerFrame: race.winnerFrame,
  };
}
