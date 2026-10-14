/**
 * 폭탄 돌리기 — 폭탄이 자리마다 시계 방향으로 돈다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 폭탄이 출발점에서 당첨 자리까지 돌 때
 * 각 자리마다 머물 시간을 정해 연출 길이를 조절한다. 마지막 자리는 항상
 * winnerIndex 다. 폭탄은 지난 판 자리에서 출발한다(startSeat).
 *
 * 최소 2바퀴(당첨이 아닌 곳 3곳 이상일 때), 정체감을 주기 위해 당첨 전
 * 자리에 의도적 긴장 멈춤. 총 연출 길이는 3500~6500ms.
 */

export interface Hop {
  seat: number;
  delayMs: number;
}

/**
 * 폭탄 홉 일정표. 마지막 홉은 항상 winnerIndex.
 * startSeat 는 지난 판에서 폭탄이 터진 곳(처음엔 0).
 */
export function bombHops(
  count: number,
  startSeat: number,
  winnerIndex: number,
  rng: () => number = Math.random,
): Hop[] {
  if (count < 2) return [];

  // hops[hopCount-1].seat 이 winnerIndex 여야 한다.
  // (startSeat + hopCount - 1) % count === winnerIndex
  // hopCount % count === (winnerIndex - startSeat + 1) % count

  const remainder = ((winnerIndex - startSeat + 1) % count + count) % count;

  // hopCount = remainder + k*count, where k >= 2 ensures >= 2*count total hops.
  const minK = remainder === 0 ? 2 : 2;
  const actualRemainder = remainder === 0 ? count : remainder;

  // 난수로 추가 바퀴 더하기 (2~5바퀴 정도).
  const extraLaps = Math.floor(rng() * 3.5);
  const k = minK + extraLaps;
  const hopCount = actualRemainder + k * count;

  // 각 홉의 머무름 시간(ms).
  const delays: number[] = [];
  const hesitationSeat = (winnerIndex - 1 + count) % count;

  for (let i = 0; i < hopCount; i += 1) {
    const progress = i / hopCount;
    // 지수 이징: 80 → 450ms 범위.
    let delay = 80 + (Math.pow(progress, 1.5) * (450 - 80));

    // 당첨 전 자리에 의도적 긴장 멈춤 (500ms).
    const seatAtStep = (startSeat + i) % count;
    if (seatAtStep === hesitationSeat && i < hopCount - 1) {
      delay = 500;
    }

    delays.push(Math.round(delay));
  }

  // 총 연출 길이 계산.
  let totalMs = delays.reduce((a, d) => a + d, 0);

  // 3500~6500ms 범위 안에 맞게 조정 (rounding error 허용범위 포함).
  if (totalMs < 3490 || totalMs > 6500) {
    const targetMs = Math.max(3500, Math.min(6500, totalMs));
    const scale = targetMs / totalMs;
    delays.forEach((_, i) => {
      delays[i] = Math.round(delays[i] * scale);
    });
  }

  // 호프 목록 생성 — 누적 시간 계산.
  // 각 홉의 delayMs 는 그 자리에 도착하는 시간이다.
  // 마지막 홉(hops[hopCount-1])은 winnerIndex 이고, 그 홉의 delayMs + delays[hopCount-1] 이 폭탄이 터지는 시간이다.
  const hops: Hop[] = [];
  let currentSeat = startSeat;
  let accumulatedMs = 0;

  for (let i = 0; i < hopCount; i += 1) {
    hops.push({ seat: currentSeat, delayMs: accumulatedMs });
    accumulatedMs += delays[i];
    currentSeat = (currentSeat + 1) % count;
  }

  return hops;
}
