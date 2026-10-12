/**
 * 핀볼 공 개수 — 가게마다 구슬을 몇 개 굴릴지.
 *
 * 개수는 확률이다. 공을 3개 넣은 가게는 1개인 가게보다 세 배 잘 걸린다.
 * 당첨은 여전히 App 의 spin() 이 정한다 — 핀볼일 때만 개수에 비례해 뽑고(pickWeighted),
 * 핀볼은 그 가게의 구슬 중 하나가 1등 하는 경기를 보여 준다. 다른 게임은 늘 균등이다.
 *
 * 개수는 이번 방문 동안만 쓴다(새로고침하면 다 1개). 동료 화면과 공유하지 않는다.
 */

/** 가게 하나에 넣을 수 있는 공 수. */
export const MAX_BALLS_EACH = 5;

/** 후보 순서대로 공 개수. 안 정한 가게는 1개. */
export function ballCountsFor(ids: string[], counts: Record<string, number>): number[] {
  return ids.map((id) => clampBalls(counts[id] ?? 1));
}

export function clampBalls(n: number): number {
  return Math.max(1, Math.min(MAX_BALLS_EACH, Math.round(n)));
}

/** 구슬마다 어느 가게인지(후보 번호). [2, 1] → [0, 0, 1]. */
export function marblesFor(counts: number[]): number[] {
  return counts.flatMap((n, i) => Array<number>(n).fill(i));
}

/**
 * 개수에 비례해 하나를 고른다. 모두 같으면 Math.floor(random() * n) 과 같은 결과다 —
 * 기본(전부 1개) 핀볼이 다른 게임과 똑같이 균등하다.
 */
export function pickWeighted(weights: number[], random: () => number): number {
  const total = weights.reduce((a, w) => a + w, 0);
  if (total <= 0) return 0;
  let r = random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** 당첨 가게의 구슬 중 하나(그 구슬이 1등 하는 경기를 보여 준다). */
export function winnerMarble(marbles: number[], place: number, random: () => number): number {
  const mine = marbles.flatMap((p, m) => (p === place ? [m] : []));
  return mine[Math.floor(random() * mine.length)] ?? -1;
}
