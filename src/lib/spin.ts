/**
 * 돌림판·슬롯의 착지 계산.
 *
 * 핀볼은 lib/pinball.ts, 사다리는 lib/ladder.ts 가 "목표 칸으로 가는 길" 을
 * 들고 있고 테스트가 지킨다. 돌림판과 슬롯만 컴포넌트 안에 인라인이었고,
 * 그래서 슬롯이 두 판째부터 안 도는 걸 테스트가 못 잡았다. 여기로 뺀다.
 *
 * 어느 함수도 당첨을 고르지 않는다. winnerIndex 를 받아서 어디에 멈출지만
 * 계산한다.
 */

/** 돌림판 바늘은 12시. 당첨 칸 가운데가 거기 오도록 원판을 돌린다. */
export function wheelAngle(winnerIndex: number, count: number, turns: number): number {
  if (count <= 0) return 0;
  const slice = 360 / count;
  return turns * 360 + (360 - (winnerIndex * slice + slice / 2));
}

/**
 * 당첨 라벨이 바늘에서 몇 도 떨어져 멈추는가. 0 이어야 한다.
 *
 * -180..180 으로 접어서 반환한다 — 359도와 1도는 둘 다 바늘 바로 옆이다.
 */
export function wheelLabelOffset(winnerIndex: number, count: number, turns: number): number {
  if (count <= 0) return 0;
  const slice = 360 / count;
  const mid = winnerIndex * slice + slice / 2;
  const at = (((mid + wheelAngle(winnerIndex, count, turns)) % 360) + 360) % 360;
  return at > 180 ? at - 360 : at;
}

/**
 * 돌림판 라벨을 뒤집어야 하는가.
 *
 * 읽히는 방향은 라벨의 **화면 각도**(mid + 원판 회전)가 정한다. 안 돌아간
 * 상태의 mid 로만 판단하면, 원판이 멈춘 뒤 당첨 라벨이 바늘 밑에서 거꾸로
 * 선다 — 후보 5곳이면 mid 가 36·108·180·252·324 라 셋이 (90, 270) 안이고,
 * 실측으로 6판 중 4판이 거꾸로였다. 후보 1곳이면 mid 가 180 이라 매번이다.
 *
 * 당첨 칸은 항상 화면 0도로 오므로 여기서 false 가 나온다.
 */
export function wheelLabelFlipped(index: number, count: number, angle: number): boolean {
  if (count <= 0) return false;
  const slice = 360 / count;
  const mid = index * slice + slice / 2;
  const at = (((mid + angle) % 360) + 360) % 360;
  return at > 90 && at < 270;
}

/**
 * 슬롯 릴의 되감을 위치와 멈출 위치.
 *
 * 위치는 "이어 붙인 목록에서 가운데 칸에 보이는 인덱스" 다. 목표를 절대값으로
 * 잡으면 두 판째부터 릴이 선다 — 같은 곳이 또 당첨되면 이동량이 0이고, 다른
 * 곳이면 한두 칸만 기어가거나 뒤로 간다. 그래서 돌리기 직전에 같은 그림을
 * 주는 첫 바퀴 위치(home)로 되감고, 거기서 항상 앞으로 loops 바퀴를 돈다.
 */
export function slotStops(
  current: number,
  winnerIndex: number,
  count: number,
  loops: number,
): { home: number; target: number } {
  if (count <= 0) return { home: 0, target: 0 };
  const home = ((current % count) + count) % count;
  const forward = (((winnerIndex - home) % count) + count) % count;
  return { home, target: home + loops * count + forward };
}

/** 슬롯이 붙여 둘 목록의 반복 횟수. target + 1 까지 실재해야 한다. */
export function slotReelCopies(loops: number): number {
  return loops + 3;
}
