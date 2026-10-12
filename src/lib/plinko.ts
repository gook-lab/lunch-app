/**
 * 플링코 경로 생성 — 순수 함수.
 *
 * 공이 핀을 맞히며 내려갈 때 오른쪽 이동 횟수를 정한다.
 * 오른쪽 이동 횟수 = winnerIndex 가 되도록 좌/우 배열을 만들어 섞는다.
 */

/**
 * winnerIndex 에 도착하는 좌/우 배열을 만든다.
 * 행 수는 후보 수 − 1 (핀은 경로 분기점).
 * 가게 수가 n이면 행이 n−1 개, 도착 칸이 n 개.
 *
 * @param winnerIndex 도착할 칸 (0 ~ n−1)
 * @param rows 핀 행 수 (n−1)
 * @returns 좌/우 배열. 'R'은 오른쪽 이동 1회.
 */
export function createPath(winnerIndex: number, rows: number): ('L' | 'R')[] {
  // 오른쪽 이동 횟수 = winnerIndex
  const rights = winnerIndex;
  const lefts = rows - rights;

  // R과 L을 섞은 배열.
  const path: ('L' | 'R')[] = Array(rights).fill('R').concat(Array(lefts).fill('L'));

  // Fisher-Yates 셔플. 고정 시드가 없으므로 결정론적이 아니지만,
  // 실제로는 컴포넌트가 생성 후 바로 쓰므로 (같은 run 안에서 안 바뀜) 문제없다.
  for (let i = path.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [path[i], path[j]] = [path[j], path[i]];
  }

  return path;
}

/**
 * 경로를 따라 공의 (x, y) 궤적을 계산한다.
 * @param path 좌/우 배열
 * @param width 게임판 폭
 * @param pinSpacing 핀 간격
 * @returns 각 핀에서의 (x, y) 위치 배열
 */
export function tracePath(path: ('L' | 'R')[], width: number, pinSpacing: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  let x = width / 2; // 시작: 가운데
  let y = 0;

  positions.push({ x, y });

  for (const direction of path) {
    y += pinSpacing;
    if (direction === 'R') {
      x += pinSpacing / 2;
    } else {
      x -= pinSpacing / 2;
    }
    positions.push({ x, y });
  }

  return positions;
}

/**
 * 주어진 행에서 활성 핀들의 위치 (도착 칸 바로 위, 중심 위치).
 * 행 i (0~rows-1)의 핀은 가운데를 중심으로 i+1 개.
 */
export function pinsForRow(row: number, width: number, pinSpacing: number): { x: number; y: number; r: number }[] {
  const count = row + 1;
  const y = (row + 1) * pinSpacing; // 행 0은 y=pinSpacing, 행 1은 y=2*pinSpacing, ...
  const radius = 4;

  const pins: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    // i번째 핀: 가운데(width/2)를 중심으로, 양쪽으로 i개씩 배치.
    // 중심: width/2 + (i - (count-1)/2) * pinSpacing/2
    const x = width / 2 + (i - (count - 1) / 2) * (pinSpacing / 2);
    pins.push({ x, y, r: radius });
  }

  return pins;
}
