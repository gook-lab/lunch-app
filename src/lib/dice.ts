/**
 * 주사위 굴림 — 순수 함수.
 *
 * 보드 둘레에 n 칸이 있을 때, 현재 위치에서 목표까지의 거리를 1~6 눈으로 나눈다.
 * 마지막 눈이 정확히 목표에 도착하도록 계산한다.
 */

/**
 * 보드 한 변의 칸 수. n = ⌈n/4⌉ + 1.
 * 예: 4곳 → 2칸/변 + 1 = 3칸/변, 12곳 → 3칸/변 + 1 = 4칸/변.
 */
export function boardSize(placeCount: number): number {
  return Math.ceil(placeCount / 4) + 1;
}

/**
 * 거리를 1~6 눈으로 나누고, 마지막 눈이 정확히 도착하도록 한다.
 * 한 바퀴는 placeCount 칸.
 * 거리 0이면 한 바퀴 (placeCount).
 */
export function diceRolls(distance: number, placeCount: number): number[] {
  // 정규화: 0이면 한 바퀴
  let target = distance === 0 ? placeCount : distance % placeCount;
  if (target === 0) target = placeCount;

  const rolls: number[] = [];
  let remaining = target;
  let maxRolls = 6; // 최대 6 굴림

  while (remaining > 0 && maxRolls > 0) {
    if (remaining <= 6) {
      // 마지막 굴림: 정확히 도착
      rolls.push(remaining);
      remaining = 0;
    } else {
      // 중간 굴림: 1~6 난수, 하지만 남은 거리와 남은 굴림 고려
      const minEyes = Math.max(1, Math.ceil(remaining - 6 * (maxRolls - 1)) || 1);
      const maxEyes = Math.min(6, remaining);
      const eyes = minEyes + Math.floor(Math.random() * (maxEyes - minEyes + 1));
      rolls.push(eyes);
      remaining -= eyes;
    }
    maxRolls -= 1;
  }

  // 만약 remaining > 0이면 (거리가 36을 넘었을 때) 여전히 도착 못 함.
  // 하지만 요청서에서 "최대 굴림 수는 6"이라고 했으므로, 최대 36칸.
  // placeCount ≤ 20이므로 한 바퀴 20칸. 거리 0은 20칸, 최악은 36칸. 적절하다.

  return rolls;
}

/**
 * 각 굴림 후 위치를 계산한다.
 * @param rolls 주사위 눈 배열
 * @param startPos 출발 위치 (0 ~ placeCount-1)
 * @param placeCount 보드 칸 수
 * @returns 각 굴림 후의 위치 배열
 */
export function positions(rolls: number[], startPos: number, placeCount: number): number[] {
  const result: number[] = [];
  let pos = startPos;

  for (const eyes of rolls) {
    pos = (pos + eyes) % placeCount;
    result.push(pos);
  }

  return result;
}
