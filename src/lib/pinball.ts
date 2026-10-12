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

/**
 * 블랙홀. 반지름 안에 들어온 구슬을 가운데 세로줄 쪽으로 끌어당긴다.
 * 가로로만 당긴다 — 세로까지 당기면 구슬이 궤도를 돌며 영영 안 빠질 수 있다.
 */
export interface Well {
  x: number;
  y: number;
  r: number;
  /** 스텝당 가로 가속(가운데에서 반지름만큼 떨어졌을 때). */
  k: number;
}

/** 가속 구간(폭포). 사각형 안에서 아래로 더 민다. */
export interface Zone {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 스텝당 추가 세로 가속. */
  ay: number;
}

/** 웜홀. from 에 닿으면 to 로 옮겨 간다. 속도는 그대로다. */
export interface Portal {
  from: { x: number; y: number };
  to: { x: number; y: number };
  r: number;
}

/**
 * 회전 고리(룰렛·위성 궤도). 반지름 R 원 위에 핀 n 개가 일정한 속도로 돈다.
 * 스텝 t 의 각도는 phase + omega * t + 2πk/n — 회전 막대처럼 시드와 무관하다.
 */
export interface Orbiter {
  x: number;
  y: number;
  R: number;
  n: number;
  /** 핀 반지름. */
  r: number;
  omega: number;
  phase: number;
}

/** t 스텝일 때 회전 고리 핀들의 위치. 물리와 그리기가 같이 쓴다. */
export function orbiterPegs(o: Orbiter, t: number): { x: number; y: number }[] {
  return Array.from({ length: o.n }, (_, k) => {
    const a = o.phase + o.omega * t + (Math.PI * 2 * k) / o.n;
    return { x: o.x + Math.cos(a) * o.R, y: o.y + Math.sin(a) * o.R };
  });
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
  wells: Well[];
  zones: Zone[];
  portals: Portal[];
  orbiters: Orbiter[];
  /** 구간 이름표(그리는 쪽이 판 가운데에 옅게 쓴다). */
  labels: { text: string; y: number }[];
}

/**
 * 판 테마. 물리 규칙은 같고 코스와 장치, 그림이 다르다. 어느 테마든 출발(1구간)과
 * 깔때기·출구(14구간)는 같아서 결승선과 경기 길이 감각이 그대로다.
 * 당첨은 테마와 무관하다 — 어느 판이든 1등 구슬과 당첨 구슬의 이름표를 맞바꾼다.
 */
export type PinballTheme = 'classic' | 'space' | 'jungle' | 'casino';
export const PINBALL_THEMES: { id: PinballTheme; label: string; icon: string }[] = [
  { id: 'classic', label: '기본', icon: '🎱' },
  { id: 'space', label: '우주', icon: '🪐' },
  { id: 'jungle', label: '정글', icon: '🌴' },
  { id: 'casino', label: '카지노', icon: '🎰' },
];

/** 테마 코스를 짓는 도구. 모든 배치는 좌우 짝으로 들어가 판이 늘 대칭이다. */
function builder() {
  const course: Course = { walls: [], pegs: [], spinners: [], wells: [], zones: [], portals: [], orbiters: [], labels: [] };
  const C = COURSE_W / 2;
  const pair = (dx: number, y: number, r: number, bumper = false) => {
    course.pegs.push({ x: C - dx, y, r, bumper });
    if (dx !== 0) course.pegs.push({ x: C + dx, y, r, bumper });
  };
  const wallPair = (x1: number, y1: number, x2: number, y2: number, kind: Wall['kind'] = 'rail') => {
    course.walls.push({ x1, y1, x2, y2, kind });
    course.walls.push({ x1: COURSE_W - x1, y1, x2: COURSE_W - x2, y2, kind });
  };
  const notch = (y: number) => {
    wallPair(0, y, 9, y + 9, 'post');
    wallPair(9, y + 9, 0, y + 18, 'post');
  };
  /** 엇갈린 핀밭 네 줄(가로 36px, 줄 28px). */
  const field = (y: number) => {
    for (const yy of [y, y + 56]) for (const dx of [0, 36, 72]) pair(dx, yy, PEG_R - 2);
    for (const yy of [y + 28, y + 84]) for (const dx of [18, 54]) pair(dx, yy, PEG_R - 2);
  };
  /** 큰 Λ 사선 막대 한 쌍과 가운데 기둥. */
  const lambda = (y: number) => {
    wallPair(16, y + 28, 40, y);
    wallPair(64, y, 86, y + 24);
    pair(0, y + 48, PEG_R);
  };
  /** 서로 반대편으로 보내는 웜홀 한 쌍. 왼쪽 입구 → 오른쪽 출구, 오른쪽 입구 → 왼쪽 출구. */
  const portalPair = (dx: number, y: number, drop: number, r = 11) => {
    course.portals.push({ from: { x: C - dx, y }, to: { x: C + dx, y: y + drop }, r });
    course.portals.push({ from: { x: C + dx, y }, to: { x: C - dx, y: y + drop }, r });
  };
  const label = (text: string, y: number) => course.labels.push({ text, y });

  /** 1구간 — 갈매기 막대 두 줄. 출발 줄이 여기서 갈린다. 모든 테마가 같다. */
  const start = () => {
    for (const x0 of [24, 52, 80]) wallPair(x0, 82, x0 + 10, 72, 'post');
    for (const x0 of [40, 74]) wallPair(x0, 112, x0 + 10, 122, 'post');
    notch(140);
  };
  /** 13·14구간 — 풍차 두 개, 깔때기와 출구 막대. 모든 테마가 같다. */
  const finish = () => {
    course.spinners.push({ x: C - 46, y: 1600, half: 22, omega: 0.055, phase: 0 });
    course.spinners.push({ x: C + 46, y: 1600, half: 22, omega: -0.055, phase: Math.PI });
    wallPair(0, 1638, C - 15, 1772);
    wallPair(C - 15, 1772, C - 15, 1814);
    course.spinners.push({ x: C, y: 1745, half: 28, omega: 0.12, phase: Math.PI / 2 });
  };
  return { course, C, pair, wallPair, notch, field, lambda, portalPair, label, start, finish };
}

export function buildCourse(theme: PinballTheme = 'classic'): Course {
  if (theme === 'space') return buildSpace();
  if (theme === 'jungle') return buildJungle();
  if (theme === 'casino') return buildCasino();
  return buildClassic();
}

function buildClassic(): Course {
  const { course, C, label } = builder();
  const { walls, pegs, spinners } = course;
  const LABELS: [string, number][] = [
    ['1', 150], ['2', 262], ['3', 370], ['4', 560], ['5', 710], ['6', 830], ['7', 932],
    ['8', 1075], ['9', 1222], ['10', 1310], ['11', 1458], ['12', 1562],
  ];
  for (const [t, y] of LABELS) label(t, y);
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

  // 8 — 회전 고리. 핀 여섯 개가 원을 그리며 돈다. 안으로 들어간 구슬은 돌던 핀에
  //     쳐서 밖으로 튕겨 나간다(10/12 "핀볼 맵 고도화"). 예전엔 5구간과 같은 핀밭이었다.
  course.orbiters.push({ x: C, y: 1000, R: 30, n: 6, r: 5, omega: 0.045, phase: 0 });
  pair(78, 980, PEG_R - 1);
  pair(78, 1030, PEG_R - 1);
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

  // 11 — 갈림길과 가속 레인. 가운데 칸막이가 길을 둘로 가르고, 양쪽 레인은
  //      아래로 더 민다. 예전엔 세 번째 핀밭이었다.
  wallPair(C, 1336, C, 1404);
  course.zones.push({ x1: 14, y1: 1340, x2: C - 6, y2: 1404, ay: 0.12 });
  course.zones.push({ x1: C + 6, y1: 1340, x2: COURSE_W - 14, y2: 1404, ay: 0.12 });
  pair(52, 1360, PEG_R - 2);
  pair(36, 1392, PEG_R - 2);
  pair(0, 1424, PEG_R);
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
  //      출구 위 회전 막대가 줄 선 구슬을 흔들어 막판 순위가 뒤집힌다. 막대는 길게(반지름 28)
  //      두고 출구 목 바로 위에 내려, 세로로 설 때 끝이 출구 목에 걸친다(10/9 사용자 스케치,
  //      "빠지는 구간에 겹쳐서"). 가로로 누우면 깔때기를 거의 막아 구슬이 줄을 선다.
  //      y 1724·반지름 28, y 1752·반지름 24·빠른 회전은 구슬이 끼어 완주 테스트가 깨졌다.
  wallPair(0, 1638, C - 15, 1772);
  wallPair(C - 15, 1772, C - 15, 1814);
  spinners.push({ x: C, y: 1745, half: 28, omega: 0.12, phase: Math.PI / 2 });

  return course;
}

function buildSpace(): Course {
  const b = builder();
  const { course, C, pair, notch, field, lambda, portalPair, label, start, finish } = b;
  start();
  // 2 — 소행성대. 크기가 제각각인 바위.
  label('소행성대', 160);
  pair(30, 186, 8);
  pair(0, 206, 10, true);
  pair(66, 226, 6);
  pair(22, 256, 5);
  pair(80, 270, 5);
  notch(282);
  // 3 — 블랙홀. 가운데로 빨려 들었다가 아래 행성 범퍼에 흩어진다.
  label('블랙홀', 316);
  course.wells.push({ x: C, y: 360, r: 64, k: 0.09 });
  pair(56, 330, 4);
  pair(82, 372, 5);
  pair(0, 408, 10, true);
  notch(420);
  // 4 — 웜홀. 왼쪽으로 들어가면 오른쪽 아래로, 오른쪽이면 왼쪽 아래로 나온다.
  label('웜홀', 452);
  portalPair(66, 476, 64);
  pair(0, 486, 7);
  pair(34, 512, 4);
  pair(0, 548, 5);
  notch(566);
  // 5 — 성운 핀밭
  label('성운', 590);
  field(604);
  notch(714);
  // 6 — 행성 범퍼
  pair(50, 762, 14, true);
  pair(0, 802, 14, true);
  pair(86, 790, 5);
  // 7 — 위성 궤도. 핀 다섯 개가 원을 돈다.
  label('위성 궤도', 846);
  course.orbiters.push({ x: C, y: 900, R: 34, n: 5, r: 6, omega: 0.05, phase: 0 });
  pair(84, 900, 5);
  notch(944);
  // 8 — 작은 블랙홀과 별 핀
  course.wells.push({ x: C, y: 1020, r: 56, k: 0.07 });
  pair(36, 990, 4);
  pair(72, 1024, 4);
  pair(0, 1060, 7, true);
  notch(1076);
  // 9 — 웜홀 한 번 더(멀리 건너뛴다)
  label('웜홀', 1100);
  portalPair(60, 1124, 66);
  pair(0, 1136, 6);
  pair(28, 1166, 4);
  notch(1206);
  // 10 — 혜성 풍차 셋
  course.spinners.push({ x: C - 60, y: 1250, half: 18, omega: 0.07, phase: 0 });
  course.spinners.push({ x: C, y: 1250, half: 18, omega: -0.07, phase: Math.PI / 2 });
  course.spinners.push({ x: C + 60, y: 1250, half: 18, omega: 0.07, phase: Math.PI });
  notch(1290);
  // 11 — 별똥별 사선
  label('별똥별', 1310);
  lambda(1332);
  pair(52, 1410, 5);
  notch(1440);
  // 12 — 달 궤도
  course.orbiters.push({ x: C, y: 1510, R: 28, n: 4, r: 6, omega: -0.06, phase: Math.PI / 4 });
  pair(78, 1500, 5);
  pair(78, 1540, 5);
  notch(1556);
  finish();
  return course;
}

function buildJungle(): Course {
  const { course, C, pair, wallPair, notch, field, lambda, label, start, finish } = builder();
  start();
  // 2 — 통나무 미끄럼틀. 양쪽 벽에서 가운데로 기운 통나무.
  label('통나무', 160);
  wallPair(0, 176, 56, 204);
  pair(0, 236, 9, true);
  pair(70, 250, 5);
  notch(270);
  // 3 — 덩굴 그네. 길고 느린 회전 막대 둘이 반대로 흔든다.
  label('덩굴', 296);
  course.spinners.push({ x: C - 50, y: 322, half: 24, omega: 0.04, phase: 0 });
  course.spinners.push({ x: C + 50, y: 322, half: 24, omega: -0.04, phase: Math.PI });
  pair(0, 346, 6);
  notch(362);
  // 4 — 나무숲 핀밭
  label('나무숲', 386);
  field(400);
  notch(510);
  // 5 — 폭포. 가운데 물길은 아래로 세게 민다. 양쪽 길엔 바위.
  label('폭포', 532);
  wallPair(58, 548, 58, 640);
  course.zones.push({ x1: 64, y1: 548, x2: COURSE_W - 64, y2: 640, ay: 0.22 });
  pair(74, 576, 5);
  pair(74, 618, 5);
  pair(0, 660, 8, true);
  notch(676);
  // 6 — 정글짐
  label('정글짐', 700);
  field(714);
  notch(820);
  // 7 — 코코넛 범퍼
  pair(56, 852, 12, true);
  pair(0, 888, 12, true);
  pair(84, 900, 5);
  // 8 — 지붕 통나무. 가운데 꼭대기에서 양쪽으로 굴러 내린다. 꼭대기는 범퍼로 덮는다 —
  //     통나무 두 끝 사이 틈(10px)에 구슬이 얹혀 경기가 안 끝났다.
  pair(0, 924, 7, true);
  wallPair(C - 10, 934, 40, 962);
  pair(84, 952, 5);
  notch(980);
  // 9 — 양쪽 폭포와 가운데 바위
  label('폭포', 1004);
  course.zones.push({ x1: 4, y1: 1016, x2: 50, y2: 1090, ay: 0.18 });
  course.zones.push({ x1: COURSE_W - 50, y1: 1016, x2: COURSE_W - 4, y2: 1090, ay: 0.18 });
  pair(0, 1030, 9, true);
  pair(30, 1066, 5);
  pair(0, 1100, 5);
  notch(1116);
  // 10 — 덩굴 셋
  course.spinners.push({ x: C - 60, y: 1180, half: 18, omega: 0.06, phase: 0 });
  course.spinners.push({ x: C, y: 1180, half: 18, omega: -0.06, phase: Math.PI / 2 });
  course.spinners.push({ x: C + 60, y: 1180, half: 18, omega: 0.06, phase: Math.PI });
  pair(30, 1222, 5);
  pair(84, 1236, 5);
  notch(1250);
  // 11 — 나무숲 한 번 더
  field(1280);
  notch(1390);
  // 12 — 통나무 사선
  lambda(1440);
  pair(52, 1518, 5);
  notch(1546);
  finish();
  return course;
}

function buildCasino(): Course {
  const { course, C, pair, wallPair, notch, field, lambda, label, start, finish } = builder();
  start();
  // 2 — 슬롯 범퍼 줄
  label('슬롯', 160);
  pair(56, 190, 11, true);
  pair(0, 190, 11, true);
  pair(28, 230, 6);
  pair(84, 230, 6);
  notch(250);
  // 3 — 룰렛. 핀 여덟 개 고리가 돌고 가운데 축이 튕긴다.
  label('룰렛', 266);
  course.orbiters.push({ x: C, y: 330, R: 40, n: 8, r: 5, omega: 0.05, phase: 0 });
  pair(0, 330, 10, true);
  pair(86, 330, 5);
  notch(384);
  // 4 — 칩 더미
  label('칩', 404);
  field(418);
  notch(524);
  // 5 — 잭팟 레인. 칸막이 기둥 사이로 줄을 선다.
  label('잭팟', 548);
  wallPair(40, 564, 40, 600, 'post');
  wallPair(72, 564, 72, 600, 'post');
  wallPair(C, 564, C, 600, 'post');
  pair(56, 622, 5);
  pair(16, 640, 5);
  notch(652);
  // 6 — 주사위 범퍼 마름모
  pair(40, 690, 12, true);
  pair(0, 726, 12, true);
  pair(40, 762, 12, true);
  pair(80, 726, PEG_R);
  notch(786);
  // 7 — 작은 룰렛, 반대로 돈다
  label('룰렛', 812);
  course.orbiters.push({ x: C, y: 860, R: 34, n: 6, r: 5, omega: -0.06, phase: 0 });
  pair(0, 860, 8, true);
  pair(84, 860, 5);
  notch(906);
  // 8 — 슬링샷
  wallPair(24, 930, 24, 990);
  pair(0, 960, PEG_R - 2);
  wallPair(34, 1010, 34, 1046);
  wallPair(34, 1046, 60, 1058);
  wallPair(34, 1010, 60, 1058, 'sling');
  notch(1080);
  // 9 — 카드 핀밭
  label('카드', 1100);
  field(1114);
  notch(1220);
  // 10 — 회전 칩 셋
  course.spinners.push({ x: C - 60, y: 1260, half: 18, omega: 0.07, phase: 0 });
  course.spinners.push({ x: C, y: 1260, half: 18, omega: -0.07, phase: Math.PI / 2 });
  course.spinners.push({ x: C + 60, y: 1260, half: 18, omega: 0.07, phase: Math.PI });
  notch(1296);
  // 11 — 슬롯 범퍼 줄 한 번 더
  pair(56, 1330, 11, true);
  pair(0, 1330, 11, true);
  pair(28, 1370, 6);
  pair(84, 1370, 6);
  notch(1392);
  // 12 — 마지막 룰렛과 사선
  course.orbiters.push({ x: C, y: 1440, R: 30, n: 6, r: 5, omega: 0.06, phase: 0 });
  pair(84, 1440, 5);
  lambda(1488);
  notch(1556);
  finish();
  return course;
}

const COURSES = new Map<PinballTheme, Course>();
function courseFor(theme: PinballTheme): Course {
  let c = COURSES.get(theme);
  if (!c) {
    c = buildCourse(theme);
    COURSES.set(theme, c);
  }
  return c;
}

/** 이 수를 넘으면 출발 줄을 여러 줄로 나눈다. 20개까지는 예전 한 줄 배치 그대로다. */
const ONE_ROW_MAX = 20;
/** 한 줄에 서는 구슬 수(여러 줄일 때). 칸 16px — 구슬 지름 14px 보다 넓다. */
const PER_ROW = 12;
/** 한 판에 굴릴 수 있는 구슬 수 상한. 넘으면 출발 줄이 출발 구간을 넘친다. */
export const MAX_MARBLES = 36;

/**
 * 출발 자리 slot(0..count-1)의 가운데. 시뮬레이션과 게이트 그림이 같이 쓴다.
 * 20개까지는 한 줄, 그 위로는 12개씩 여러 줄(위 줄부터).
 */
export function startSpot(slot: number, count: number): { x: number; y: number; lane: number } {
  if (count <= ONE_ROW_MAX) {
    const lane = COURSE_W / (count + 1);
    return { x: lane * (slot + 1), y: 20, lane };
  }
  const row = Math.floor(slot / PER_ROW);
  const inRow = Math.min(PER_ROW, count - row * PER_ROW);
  const lane = COURSE_W / (inRow + 1);
  return { x: lane * ((slot % PER_ROW) + 1), y: 12 + row * 16, lane };
}

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
export function simulateRace(count: number, seed: number, untilWinner = false, theme: PinballTheme = 'classic'): RaceResult {
  const random = seededRandom(seed);
  const COURSE = courseFor(theme);

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
    const spot = startSpot(lanes[i], count);
    x[i] = spot.x + (random() - 0.5) * spot.lane * 0.4;
    // 한 줄이면 예전과 같은 높이 흩어짐(같은 시드 = 같은 경기). 여러 줄이면 줄 높이를 지킨다.
    y[i] = count <= ONE_ROW_MAX ? 14 + random() * 12 : spot.y + random() * 3;
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

      // 가속 구간(폭포)
      for (const z of COURSE.zones) {
        if (x[i] >= z.x1 && x[i] <= z.x2 && y[i] >= z.y1 && y[i] <= z.y2) vy[i] += z.ay;
      }
      // 블랙홀 — 가운데 세로줄 쪽으로만 당긴다
      for (const w of COURSE.wells) {
        const dx = w.x - x[i];
        const dy = w.y - y[i];
        if (dx * dx + dy * dy < w.r * w.r) vx[i] += (dx / w.r) * w.k * 4;
      }

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

      // 회전 고리 — 회전 막대처럼, 핀이 움직이는 속도를 빼고 튕긴 뒤 다시 더한다.
      for (const o of COURSE.orbiters) {
        for (const p of orbiterPegs(o, step)) {
          const dx = x[i] - p.x;
          const dy = y[i] - p.y;
          const dist = Math.hypot(dx, dy);
          const min = MARBLE_R + o.r;
          if (dist >= min || dist === 0) continue;
          const nx = dx / dist;
          const ny = dy / dist;
          x[i] = p.x + nx * min;
          y[i] = p.y + ny * min;
          const pvx = -o.omega * (p.y - o.y);
          const pvy = o.omega * (p.x - o.x);
          const rvx = vx[i] - pvx;
          const rvy = vy[i] - pvy;
          const vn = rvx * nx + rvy * ny;
          if (vn >= 0) continue;
          vx[i] = rvx - (1 + RESTITUTION) * vn * nx + pvx;
          vy[i] = rvy - (1 + RESTITUTION) * vn * ny + pvy;
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

      // 웜홀 — 입구에 닿으면 출구로. 출구는 늘 입구보다 아래라 되돌아 들어가지 않는다.
      for (const pt of COURSE.portals) {
        const dx = x[i] - pt.from.x;
        const dy = y[i] - pt.from.y;
        if (dx * dx + dy * dy < pt.r * pt.r) {
          x[i] = pt.to.x;
          y[i] = pt.to.y;
          vy[i] = Math.max(vy[i], 1);
          break;
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
export function raceForWinner(
  count: number,
  target: number,
  seed: number,
  theme: PinballTheme = 'classic',
): RaceResult | null {
  if (count <= 0 || target < 0 || target >= count) return null;
  const race = simulateRace(count, seed, false, theme);
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
