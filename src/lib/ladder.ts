/**
 * 사다리타기 — 가로줄을 놓고, 당첨 칸으로 이어지는 출발점을 찾는다.
 *
 * 중요: 결과를 사다리가 정하지 않는다. 당첨은 selectCandidates 위에서 이미
 * 정해져 있고, 여기서는 그 칸에 도착하는 출발점을 역으로 고를 뿐이다.
 * 사다리 경로는 순열이라 목표 칸으로 가는 출발점은 항상 정확히 하나다.
 *
 * 이 규칙을 어기고 연출이 결과를 정하게 두면 "최근 1주 제외" 의 공정성 근거가
 * 무너진다. 모드는 보여주기만 한다.
 */

/** 가로줄 하나. row 번째 층에서 col 과 col+1 을 잇는다. */
export interface Rung {
  row: number;
  col: number;
}

export interface Ladder {
  columns: number;
  rows: number;
  rungs: Rung[];
}

/**
 * 같은 층에 이웃한 가로줄이 겹치지 않게 놓는다(겹치면 경로가 모호해진다).
 * density 는 층마다 줄을 놓을 확률이다.
 */
export function buildLadder(
  columns: number,
  rows: number,
  random: () => number = Math.random,
): Ladder {
  const rungs: Rung[] = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < columns - 1) {
      if (random() < 0.45) {
        rungs.push({ row, col });
        col += 2; // 바로 옆에는 놓지 않는다
      } else {
        col += 1;
      }
    }
  }
  return { columns, rows, rungs };
}

/** start 칸에서 출발해 바닥에 닿는 칸. 내려가면서 만나는 가로줄마다 옆으로 옮긴다. */
export function walkLadder(ladder: Ladder, start: number): number {
  let col = start;
  for (let row = 0; row < ladder.rows; row += 1) {
    const right = ladder.rungs.find((r) => r.row === row && r.col === col);
    if (right) {
      col += 1;
      continue;
    }
    const left = ladder.rungs.find((r) => r.row === row && r.col === col - 1);
    if (left) col -= 1;
  }
  return col;
}

/** 각 출발점이 어느 칸으로 가는지. 길이는 columns, 값은 도착 칸. */
export function ladderMapping(ladder: Ladder): number[] {
  return Array.from({ length: ladder.columns }, (_, i) => walkLadder(ladder, i));
}

/** target 칸에 도착하는 출발점. 순열이므로 반드시 하나 있다. */
export function startForTarget(ladder: Ladder, target: number): number {
  return ladderMapping(ladder).indexOf(target);
}

/**
 * 출발점에서 바닥까지의 경로. 애니메이션이 이 점들을 이어 그린다.
 *
 * 가로줄은 rowY(row + 0.5) 에 그려지므로, 경로도 그 높이까지 내려가서
 * 옆으로 건너간 뒤 다시 내려가야 한다. 대각선으로 이으면 사다리가 아니라
 * 그냥 꺾인 선으로 보인다.
 */
export function ladderPath(ladder: Ladder, start: number): { row: number; col: number }[] {
  const path = [{ row: 0, col: start }];
  let col = start;

  for (let row = 0; row < ladder.rows; row += 1) {
    const right = ladder.rungs.find((r) => r.row === row && r.col === col);
    const left = ladder.rungs.find((r) => r.row === row && r.col === col - 1);
    const next = right ? col + 1 : left ? col - 1 : col;
    if (next === col) continue;

    path.push({ row: row + 0.5, col });
    path.push({ row: row + 0.5, col: next });
    col = next;
  }

  path.push({ row: ladder.rows, col });
  return path;
}

/**
 * 사용자가 누른 자리에 가로줄을 놓거나 뗀다.
 *
 * 같은 층에서 바로 옆 칸 가로줄과 붙으면 경로가 모호해진다(한 점에서 좌우로
 * 동시에 갈 수 있다). 그 자리에는 놓지 않고 그대로 돌려준다.
 */
export function toggleRung(rungs: readonly Rung[], row: number, col: number, columns: number): Rung[] {
  if (col < 0 || col >= columns - 1) return [...rungs];
  const here = rungs.findIndex((r) => r.row === row && r.col === col);
  if (here >= 0) return rungs.filter((_, i) => i !== here);
  const blocked = rungs.some((r) => r.row === row && Math.abs(r.col - col) === 1);
  if (blocked) return [...rungs];
  return [...rungs, { row, col }];
}

/**
 * 가려 둔 바닥 칸에 후보를 놓는다. slots[칸] = 후보 번호.
 *
 * 당첨(winner)은 App 이 균등 난수로 이미 정했다. 경로가 닿은 칸(dest)에
 * 당첨을 놓고, 나머지 칸은 random 으로 섞는다. 바닥은 경로가 닿을 때까지
 * 가려져 있으므로, 미리 섞어 숨겨 둔 것과 확률이 같다 — 사용자가 고른
 * 출발점이나 그은 가로줄이 누가 당첨될지를 바꾸지 못한다.
 */
export function revealSlots(
  count: number,
  dest: number,
  winner: number,
  random: () => number,
): number[] {
  const others = Array.from({ length: count }, (_, i) => i).filter((i) => i !== winner);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const slots: number[] = [];
  let k = 0;
  for (let c = 0; c < count; c += 1) slots.push(c === dest ? winner : others[k++]);
  return slots;
}

/**
 * 시간 → 경로 진행도. 앞 65% 시간에 경로 80% 를 가고, 남은 20% 를 35% 시간 동안
 * 천천히 내려간다. 도착 직전에 느려져야 "어디로 가나" 를 지켜볼 틈이 생긴다.
 * 끝(1)은 1 이라 도착 칸은 그대로다.
 */
export function ladderPace(t: number): number {
  return t < 0.65 ? (t / 0.65) * 0.8 : 0.8 + ((t - 0.65) / 0.35) * 0.2;
}
