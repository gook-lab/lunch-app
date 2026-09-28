/**
 * 핀볼 — 핀 삼각형을 타고 내려가 당첨 칸으로 떨어진다.
 *
 * 구슬 레이스(lib/race.ts)와 접근이 반대다. 레이스는 물리를 실제로 돌리고
 * 원하는 결과가 나온 시드를 골랐다. 핀볼은 물리가 없다 — 경로를 역산한다.
 *
 *  1. 당첨은 호출하는 쪽이 균등 난수로 이미 정했다 (winnerIndex).
 *  2. 오른쪽으로 꺾는 횟수가 정확히 winnerIndex 가 되도록 좌/우 배열을 만든다.
 *  3. 그 배열을 섞는다. 어느 행에서 꺾는지는 매번 달라지고, 도착 칸은 같다.
 *
 * 왜 이게 공정한가: 확률은 1번에서 이미 결정됐고 2~3번은 그 결과를 보여주는
 * 방법일 뿐이다. 핀에 물리를 넣어 굴리면 가운데 칸이 유리해지는데(이항분포),
 * 그러면 화면에 적어 둔 "어느 쪽으로 돌려도 확률은 같습니다" 가 거짓이 된다.
 */

/** 판 폭. 화면 좌표와 같은 단위다. */
export const BOARD_W = 320;
const CENTER_X = BOARD_W / 2;
const PEG_TOP = 18;
const ROW_H_MAX = 26;
const ROW_SPAN = 210;
const BINS_GAP = 16;
const SVG_BOTTOM = 18;
/** 공이 핀 위에 얹혀 보이도록 띄우는 양. */
const BALL_LIFT = 7;

export interface PinballGeometry {
  /** 칸 하나의 폭. */
  binW: number;
  /** 핀 행 수. 후보 수 − 1. */
  rows: number;
  rowH: number;
  pegTop: number;
  /** 칸이 시작하는 y. */
  binsTop: number;
  /** svg viewBox 높이. */
  svgH: number;
  /** 행 r, 행 안에서 k 번째 핀의 좌표. */
  pegCount: number;
}

export interface Peg {
  x: number;
  y: number;
}

export interface PinballPoint {
  x: number;
  y: number;
  /** 이 점에서 부딪힌 핀 번호. 출발점과 도착점은 -1. */
  peg: number;
}

export interface PinballRun {
  geometry: PinballGeometry;
  pegs: Peg[];
  /** 출발 → 핀들 → 당첨 칸. */
  points: PinballPoint[];
  /** 각 행에서 오른쪽으로 꺾는가. true 개수 === winnerIndex. */
  rights: boolean[];
}

export function pinballGeometry(count: number): PinballGeometry {
  const n = Math.max(count, 1);
  const rows = Math.max(n - 1, 0);
  const rowH = rows > 0 ? Math.min(ROW_H_MAX, ROW_SPAN / rows) : 0;
  const binsTop = PEG_TOP + rows * rowH + BINS_GAP;
  return {
    binW: BOARD_W / n,
    rows,
    rowH,
    pegTop: PEG_TOP,
    binsTop,
    svgH: binsTop + SVG_BOTTOM,
    pegCount: (rows * (rows + 1)) / 2,
  };
}

/** 행 r 의 k 번째 핀 좌표. k 는 0..r. */
export function pegAt(geometry: PinballGeometry, row: number, k: number): Peg {
  return {
    x: CENTER_X + (k - row / 2) * geometry.binW,
    y: geometry.pegTop + row * geometry.rowH,
  };
}

/** 삼각형 전체. 번호는 위에서 아래로, 행 안에서는 왼쪽부터다. */
export function buildPegs(geometry: PinballGeometry): Peg[] {
  const pegs: Peg[] = [];
  for (let row = 0; row < geometry.rows; row += 1) {
    for (let k = 0; k <= row; k += 1) pegs.push(pegAt(geometry, row, k));
  }
  return pegs;
}

/** x 좌표가 몇 번 칸인지. 기하와 경로가 어긋나지 않는지 검사하는 데도 쓴다. */
export function binFromX(x: number, geometry: PinballGeometry, count: number): number {
  const index = Math.floor(x / geometry.binW);
  return Math.min(Math.max(index, 0), Math.max(count - 1, 0));
}

/**
 * 당첨 칸으로 떨어지는 경로를 만든다.
 *
 * random 을 받는 이유는 테스트다. 기본값은 Math.random 이고, 섞는 순서만
 * 바뀌므로 어떤 난수를 줘도 도착 칸은 winnerIndex 그대로다.
 */
export function buildPinballRun(
  count: number,
  winnerIndex: number,
  random: () => number = Math.random,
): PinballRun | null {
  if (count <= 0 || winnerIndex < 0 || winnerIndex >= count) return null;

  const geometry = pinballGeometry(count);
  const pegs = buildPegs(geometry);

  // 오른쪽으로 꺾을 횟수를 winnerIndex 개 만들고 섞는다.
  const rights = Array.from({ length: geometry.rows }, (_, i) => i < winnerIndex);
  for (let i = rights.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [rights[i], rights[j]] = [rights[j], rights[i]];
  }

  const points: PinballPoint[] = [{ x: CENTER_X, y: -6, peg: -1 }];
  let k = 0;
  for (let row = 0; row < geometry.rows; row += 1) {
    const peg = pegAt(geometry, row, k);
    points.push({ x: peg.x, y: peg.y - BALL_LIFT, peg: (row * (row + 1)) / 2 + k });
    if (rights[row]) k += 1;
  }
  // k 는 이제 오른쪽으로 꺾은 횟수 = winnerIndex 다.
  points.push({
    x: (winnerIndex + 0.5) * geometry.binW,
    y: geometry.binsTop + 8,
    peg: -1,
  });

  return { geometry, pegs, points, rights };
}
