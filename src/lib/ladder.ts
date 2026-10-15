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

/* ───────── 연출 일정(달리기 · 두리번 · 가짜 길 · 커튼) ─────────
 *
 * 줄마다 꼬마 주자가 한 명씩 서고 한꺼번에 내려간다. 사용자가 고른 줄의 주자(내 주자)를
 * 카메라가 따라가고, 다른 주자들은 각자 제 길로 먼저 내려가 바닥에서 기다린다. 내 주자는
 * 가로줄 갈림길에서 두리번거리며 멈칫하고(look), 가로줄이 없는 자리에서 "어? 이쪽이야?" 하고
 * 옆으로 기웃했다 돌아온다(fake — 그 자리에 가짜 가로줄이 깜빡인다). 내 주자가 닿으면 바닥 칸에
 * 커튼이 내려오고, 두구두구 뒤 커튼이 걷히며 칸이 열린다.
 *
 * 사건은 모두 연출이다. 내 주자의 길은 ladderPath 그대로이고(가짜 길에서 꼭 돌아온다), 도착 칸에
 * 놓이는 후보는 revealSlots 가 App 의 당첨(winnerIndex)으로 정한다. 사건이 당첨을 바꾸지 않는다.
 */

/** 그림 좌표에서 열 간격 · 층 높이. 경로 길이를 화면과 같은 비로 재는 데 쓴다. */
export interface LadderGeom {
  colGap: number;
  rowGap: number;
}

export interface LadderBeat {
  /** look: 갈림길에서 두리번 · fake: 없는 가로줄 쪽으로 기웃했다 돌아온다. */
  kind: 'look' | 'fake';
  /** 내 경로 길이 중 어디서(0~1). */
  at: number;
  /** 시작 시각(ms, 판 시작 기준)과 길이. */
  startMs: number;
  ms: number;
  /** fake: 기웃하는 쪽(-1 왼쪽 · 1 오른쪽). look: 다음에 꺾는 쪽. */
  dir: -1 | 1;
  /** fake: 가짜 가로줄 자리(층, 왼쪽 칸). look: 갈림길 층과 지금 칸. */
  row: number;
  col: number;
}

export interface LadderRival {
  start: number;
  /** 바닥에 닿는 시각(ms). */
  finishMs: number;
}

export interface LadderPlan {
  /** 준비 → 출발. */
  goMs: number;
  /** 내 주자가 바닥에 닿는 시각 · 커튼이 다 내려온 시각 · 커튼이 걷히는(칸이 열리는) 시각 · 끝. */
  arriveMs: number;
  curtainMs: number;
  liftMs: number;
  endMs: number;
  /** 내 주자가 실제로 움직이는 시간(멈칫 뺀 것). */
  moveMs: number;
  beats: LadderBeat[];
  rivals: LadderRival[];
  /** 먼저 쏜살같이 내려가는 주자의 출발 칸(없으면 null). */
  leader: number | null;
  /** 내 주자와 거의 나란히 들어오는 주자의 출발 칸(없으면 null). */
  neck: number | null;
}

/** ladderPace 의 역함수 — 진행도 p 에 닿는 시간 비율. */
export function ladderPaceInverse(p: number): number {
  return p < 0.8 ? (p / 0.8) * 0.65 : 0.65 + ((p - 0.8) / 0.2) * 0.35;
}

/** 경로를 그림 좌표 비로 잰 길이와 갈림길(가로로 꺾는 곳)·곧게 지나는 층 자리. */
export function pathMetrics(ladder: Ladder, start: number, geom: LadderGeom) {
  const path = ladderPath(ladder, start);
  const pts = path.map((p) => ({ x: p.col * geom.colGap, y: p.row * geom.rowGap }));
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0) || 1;
  const acc: number[] = [0];
  lens.forEach((l, i) => acc.push(acc[i] + l));

  /** 가로로 꺾기 시작하는 곳. dir 은 꺾는 쪽. */
  const turns: { at: number; row: number; col: number; dir: -1 | 1 }[] = [];
  /** 가로줄 없이 곧게 지나는 층 가운데(가짜 가로줄을 그릴 수 있는 자리). */
  const straights: { at: number; row: number; col: number; dirs: (-1 | 1)[] }[] = [];
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (a.row === b.row) {
      turns.push({ at: acc[i] / total, row: Math.floor(a.row), col: a.col, dir: b.col > a.col ? 1 : -1 });
      continue;
    }
    // 세로 구간 a.row → b.row 안쪽의 층 가운데(r + 0.5).
    for (let r = 0; r < ladder.rows; r += 1) {
      const y = r + 0.5;
      if (y <= a.row + 1e-9 || y >= b.row - 1e-9) continue;
      const dirs: (-1 | 1)[] = [];
      for (const d of [-1, 1] as const) {
        const other = a.col + d;
        if (other < 0 || other >= ladder.columns) continue;
        // 옆 칸에 진짜 가로줄이 붙어 있으면 갈림길처럼 보여 헷갈린다 — 빼 둔다.
        if (ladder.rungs.some((g) => g.row === r && (g.col === other || g.col === other - 1))) continue;
        dirs.push(d);
      }
      if (dirs.length === 0) continue;
      const at = (acc[i] + (y - a.row) * geom.rowGap) / total;
      straights.push({ at, row: r, col: a.col, dirs });
    }
  }
  return { path, pts, lens, total, turns, straights };
}

const between = (random: () => number, lo: number, hi: number) => lo + random() * (hi - lo);

/**
 * 한 판의 일정. durationMs 는 SPIN_MS.ladder 와 같다(App 연출 잠금과 맞춘다).
 * random 은 판 번호 시드 — 같은 판은 같은 연출이다.
 */
export function ladderPlan(
  ladder: Ladder,
  start: number,
  geom: LadderGeom,
  durationMs: number,
  random: () => number,
): LadderPlan {
  const goMs = 450;
  const endMs = durationMs;
  const liftMs = endMs - 800;
  const curtainMs = liftMs - 550;
  const arriveMs = curtainMs - 350;
  const span = arriveMs - goMs;
  const beats: Omit<LadderBeat, 'startMs'>[] = [];

  if (ladder.columns >= 2) {
    const { turns, straights } = pathMetrics(ladder, start, geom);
    // 가짜 길: 판 대부분에서 한 번 "어? 이쪽이야?" — 끝 무렵(아깝다)에 더 자주.
    const fakeable = straights.filter((s) => s.at > 0.12 && s.at < 0.95);
    if (fakeable.length > 0 && random() < 0.75) {
      const late = fakeable.filter((s) => s.at >= 0.6);
      const pool = late.length > 0 && random() < 0.6 ? late : fakeable;
      const s = pool[Math.floor(random() * pool.length)];
      const dir = s.dirs[Math.floor(random() * s.dirs.length)];
      beats.push({ kind: 'fake', at: s.at, ms: Math.round(between(random, 700, 860)), dir, row: s.row, col: Math.min(s.col, s.col + dir) });
    }
    // 두리번: 갈림길 한두 곳에서 멈칫(네 판에 한 판은 안 한다).
    const lookable = turns.filter((t) => t.at > 0.06 && t.at < 0.93 && beats.every((b) => Math.abs(b.at - t.at) > 0.08));
    for (let i = lookable.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [lookable[i], lookable[j]] = [lookable[j], lookable[i]];
    }
    const roll = random();
    const looks = lookable.length === 0 || roll < 0.25 ? 0 : roll < 0.65 ? 1 : 2;
    for (const t of lookable.slice(0, looks)) {
      beats.push({ kind: 'look', at: t.at, ms: Math.round(between(random, 300, 440)), dir: t.dir, row: t.row, col: t.col });
    }
  }
  beats.sort((a, b) => a.at - b.at);
  const paused = beats.reduce((a, b) => a + b.ms, 0);
  const moveMs = span - paused;

  let acc = 0;
  const timed: LadderBeat[] = beats.map((b) => {
    const startMs = goMs + ladderPaceInverse(b.at) * moveMs + acc;
    acc += b.ms;
    return { ...b, startMs };
  });

  // 다른 주자들. 대부분은 내 주자보다 먼저 닿아 바닥에서 기다린다.
  const others = Array.from({ length: ladder.columns }, (_, c) => c).filter((c) => c !== start);
  const rivals: LadderRival[] = others.map((c) => ({ start: c, finishMs: Math.round(goMs + span * between(random, 0.6, 0.9)) }));
  let leader: number | null = null;
  let neck: number | null = null;
  if (rivals.length >= 2 && random() < 0.5) {
    const r = rivals[Math.floor(random() * rivals.length)];
    r.finishMs = Math.round(goMs + span * between(random, 0.42, 0.5));
    leader = r.start;
  }
  const rest = rivals.filter((r) => r.start !== leader);
  if (rest.length > 0 && random() < 0.45) {
    const r = rest[Math.floor(random() * rest.length)];
    r.finishMs = Math.round(arriveMs - between(random, 90, 200));
    neck = r.start;
  }

  return { goMs, arriveMs, curtainMs, liftMs, endMs, moveMs, beats: timed, rivals, leader, neck };
}

/** 내 주자의 진행도(경로 길이 비 0~1)와 지금 하고 있는 멈칫(없으면 null, u 는 멈칫 안 진행 0~1). */
export function runnerAt(plan: LadderPlan, ms: number): { p: number; beat: LadderBeat | null; u: number } {
  if (ms <= plan.goMs) return { p: 0, beat: null, u: 0 };
  if (ms >= plan.arriveMs) return { p: 1, beat: null, u: 0 };
  let paused = 0;
  for (const b of plan.beats) {
    if (ms < b.startMs) break;
    if (ms < b.startMs + b.ms) return { p: b.at, beat: b, u: (ms - b.startMs) / b.ms };
    paused += b.ms;
  }
  const t = Math.min(1, Math.max(0, (ms - plan.goMs - paused) / plan.moveMs));
  return { p: ladderPace(t), beat: null, u: 0 };
}

/** 다른 주자의 진행도(0~1). 처음엔 빠르고 끝에서 살짝 느려진다. */
export function rivalAt(plan: LadderPlan, rival: LadderRival, ms: number): number {
  const x = Math.min(1, Math.max(0, (ms - plan.goMs) / (rival.finishMs - plan.goMs)));
  return 1 - (1 - x) ** 1.35;
}
