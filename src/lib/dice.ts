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
