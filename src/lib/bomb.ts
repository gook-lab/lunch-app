/**
 * 폭탄 돌리기 — 폭탄이 자리마다 시계 방향으로 돈다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 폭탄이 출발점에서 당첨 자리까지 돌 때
 * 각 자리마다 머물 시간을 정해 연출 길이를 조절한다. 마지막 자리는 항상
 * winnerIndex 다. 폭탄은 지난 판 자리에서 출발한다(startSeat).
 *
 * 두 바퀴·14걸음 이상 돌고, 전체 4.2~5.7초, 마지막 한 칸에서만 뜸을 들인다.
 */

export interface Hop {
  seat: number;
  delayMs: number;
}

/** 폭탄이 적어도 이만큼은 넘어가야 돌고 도는 맛이 난다. 두 곳이면 일곱 바퀴쯤. */
const MIN_STEPS = 14;
/** 마지막 뜸(당첨 바로 앞 → 당첨). 다른 어느 칸보다 길다. */
const LAST_MIN_MS = 650;

/**
 * 폭탄 홉 일정표. 첫 홉은 출발 자리(0ms), 마지막 홉은 항상 winnerIndex.
 * startSeat 는 지난 판에서 폭탄이 터진 곳(처음엔 0).
 *
 * 1) 걸음 수 = 출발→당첨 거리 + 바퀴 × 자리 수 (두 바퀴 이상, 14걸음 이상)
 * 2) 전체 길이 4.2~5.7초 중 하나를 고르고
 * 3) 간격은 빠르게 시작해 점점 느려지며(80 → 420 비율), 마지막 한 칸만 가장 길게 뜸을 들인다.
 */
export function bombHops(
  count: number,
  startSeat: number,
  winnerIndex: number,
  rng: () => number = Math.random,
): Hop[] {
  if (count < 2) return [];
  const distance = (((winnerIndex - startSeat) % count) + count) % count;
  const minLaps = Math.max(2, Math.ceil((MIN_STEPS - distance) / count));
  const laps = minLaps + Math.floor(rng() * 2);
  const steps = distance + laps * count;

  const total = 4200 + Math.floor(rng() * 1500);
  const weights = Array.from({ length: steps - 1 }, (_, j) => 80 + 340 * Math.pow(j / Math.max(1, steps - 2), 1.6));
  const weightSum = weights.reduce((a, w) => a + w, 0);
  // 마지막 뜸은 나머지 중 가장 긴 칸보다 30% 길게. 두 번 맞추면 수렴한다.
  let last = LAST_MIN_MS;
  let scale = (total - last) / weightSum;
  for (let k = 0; k < 3; k += 1) {
    last = Math.max(LAST_MIN_MS, Math.round(Math.max(...weights) * scale * 1.3));
    scale = (total - last) / weightSum;
  }
  const gaps = [...weights.map((w) => Math.max(1, Math.round(w * scale))), last];

  const hops: Hop[] = [{ seat: startSeat, delayMs: 0 }];
  let at = 0;
  for (let i = 0; i < steps; i += 1) {
    at += gaps[i];
    hops.push({ seat: (startSeat + i + 1) % count, delayMs: at });
  }
  return hops;
}
