/**
 * 플링코 — 공 하나가 삼각형 핀을 맞으며 내려가 아래 칸 하나에 들어간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 경로를 거꾸로 만든다. 후보가 n 곳이면
 * 핀은 n − 1 줄이고 줄마다 공이 왼쪽이나 오른쪽으로 반 칸 꺾인다. 오른쪽으로 꺾인
 * 횟수가 곧 도착 칸 번호라, 오른쪽 winnerIndex 번 · 왼쪽 나머지를 섞으면 어느 순서든
 * 그 칸에 떨어진다. 순서는 판 번호 난수로 섞어 판마다 다른 길로 보인다.
 */

export type Turn = 'L' | 'R';

/** winnerIndex 칸으로 가는 꺾임 순서. 길이 = 후보 수 − 1. */
export function plinkoPath(winnerIndex: number, count: number, random: () => number = Math.random): Turn[] {
  const rows = Math.max(0, count - 1);
  const rights = Math.max(0, Math.min(rows, winnerIndex));
  const path: Turn[] = [...Array<Turn>(rights).fill('R'), ...Array<Turn>(rows - rights).fill('L')];
  for (let i = path.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [path[i], path[j]] = [path[j], path[i]];
  }
  return path;
}

/** 경로의 도착 칸(오른쪽으로 꺾인 횟수). */
export function landingSlot(path: Turn[]): number {
  return path.filter((t) => t === 'R').length;
}

/**
 * 공이 맞는 핀 차례. hits[r] = r 번째 줄에서 맞는 핀 번호(0..r).
 * 줄 r 에는 핀이 r + 1 개 있고, 공은 그때까지 오른쪽으로 꺾인 횟수 번째 핀에 떨어진다.
 */
export function pinHits(path: Turn[]): number[] {
  const hits: number[] = [];
  let rights = 0;
  for (let r = 0; r < path.length; r += 1) {
    hits.push(rights);
    if (path[r] === 'R') rights += 1;
  }
  return hits;
}
