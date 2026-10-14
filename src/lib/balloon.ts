/**
 * 풍선 터뜨리기 — 풍선이 하나씩 터지고 마지막 하나가 남는다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 당첨이 아닌 풍선을 터뜨릴 순서와
 * 시각만 정한다. 당첨 풍선은 절대 터지지 않고, 나머지는 모두 정확히 한 번씩 터진다.
 *
 * 간격은 처음 빠르게(약 120ms) 시작해 남은 풍선이 적을수록 느려지고, 마지막 둘
 * 사이에 가장 길게 뜸을 들인다. 마지막 풍선이 터지는 시각은 3.7~6.3초 안이다.
 * 후보가 적으면 간격이 통째로 늘어난다 — 두 곳이면 한 번 터지는 데 3.7초쯤 걸린다.
 */

export interface Pop {
  /** 터지는 풍선(후보 인덱스). */
  index: number;
  /** 시작부터 터지기까지(ms). */
  delayMs: number;
}

/** 마지막 풍선이 터지는 시각의 범위. 테스트는 3500~6500 을 본다(반올림 여유). */
const MIN_TOTAL = 3700;
const MAX_TOTAL = 6300;
/** 처음 간격 → 마지막 간격. 20곳이면 거의 그대로 쓰고, 적으면 같은 비율로 늘린다. */
const FIRST_GAP = 120;
const LAST_GAP = 900;

/** 판의 열 수. 휴대폰(390px)에서 20개도 겹치지 않게 가로를 조금 더 넓게 잡는다. */
export function balloonColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
}

/**
 * 풍선이 터지는 순서와 시각. 길이는 count - 1 이고, 당첨(winnerIndex)은 들어 있지 않다.
 *
 * 1) 당첨이 아닌 인덱스를 rng 로 섞는다(Fisher–Yates).
 * 2) 간격 j(0 → 첫 풍선이 j=0)는 FIRST_GAP + (LAST_GAP − FIRST_GAP)·(j/(m−1))³ 비율 —
 *    앞쪽은 따다닥, 끝에서 크게 느려진다.
 * 3) 전체를 3.7~6.3초 안의 길이로 같은 비율로 늘리거나 줄인다.
 */
export function popOrder(count: number, winnerIndex: number, rng: () => number = Math.random): Pop[] {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return [];

  const order: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) order.push(i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const m = order.length;
  const weights =
    m === 1
      ? [LAST_GAP]
      : Array.from({ length: m }, (_, j) => FIRST_GAP + (LAST_GAP - FIRST_GAP) * Math.pow(j / (m - 1), 3));
  const natural = weights.reduce((a, w) => a + w, 0);
  const total = Math.min(MAX_TOTAL, Math.max(MIN_TOTAL, natural * (0.9 + rng() * 0.2)));
  const scale = total / natural;

  let at = 0;
  return order.map((index, j) => {
    at += Math.max(1, Math.round(weights[j] * scale));
    return { index, delayMs: at };
  });
}
