/**
 * 토너먼트 대진표.
 *
 * 우승은 대진표가 정하지 않는다. App 이 균등 난수로 이미 정한 winner 를 받아,
 * 그 가게가 모든 경기를 이기는 대진표를 만든다. 대진 순서는 섞고, 우승과
 * 상관없는 경기는 random 으로 가른다 — 보여 주는 내용만 매번 달라진다.
 *
 * 후보 수가 2의 거듭제곱이 아니면 첫 판에 빈자리(null)가 생긴다. 빈자리와
 * 붙은 가게는 부전승으로 올라간다.
 */
export type Entry = number | null;

export interface Bracket {
  /** rounds[r] = r 번째 판의 출전 순서. 2개씩 짝지어 붙는다. 마지막 판은 [우승]. */
  rounds: Entry[][];
}

/** 이 판 출전 수(빈자리 포함)를 이름으로. 2 는 결승. */
export function roundName(size: number): string {
  return size <= 2 ? '결승' : `${size}강`;
}

export function buildBracket(count: number, winner: number, random: () => number): Bracket {
  if (count <= 0 || winner < 0 || winner >= count) return { rounds: [] };
  if (count === 1) return { rounds: [[winner]] };

  let size = 2;
  while (size < count) size *= 2;

  const order: number[] = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  /*
   * 빈자리는 짝마다 한 칸씩 흩어 둔다. 몰아 두면 빈자리끼리 붙는 짝이 생겨
   * 아무도 안 올라간다. size < 2*count 라 빈자리 수는 짝 수보다 적다.
   */
  const byes = size - count;
  const first: Entry[] = [];
  let k = 0;
  for (let pair = 0; pair < size / 2; pair += 1) {
    first.push(order[k++]);
    first.push(pair < byes ? null : order[k++]);
  }

  const rounds: Entry[][] = [first];
  let current = first;
  while (current.length > 1) {
    const next: Entry[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const a = current[i];
      const b = current[i + 1];
      if (a === null || b === null) next.push(a ?? b);
      else if (a === winner || b === winner) next.push(winner);
      else next.push(random() < 0.5 ? a : b);
    }
    rounds.push(next);
    current = next;
  }
  return { rounds };
}

/** 이 가게가 몇 번째 판까지 살아남았나. 우승이면 rounds.length - 1. */
export function reachedRound(bracket: Bracket, entry: number): number {
  let last = -1;
  bracket.rounds.forEach((round, r) => {
    if (round.includes(entry)) last = r;
  });
  return last;
}

/* ───────── 연출 일정 ───────── */

/**
 * 맞대결 모양. 누가 이기는지는 대진표가 이미 정했고, 이건 힘 게이지가 어떻게 흔들리다 끝나는지만 정한다.
 *
 * - comeback: 진 쪽이 먼저 크게 앞서다가 이긴 쪽이 뒤집는다("역전!").
 * - seesaw: 이긴 쪽이 앞서다 뒤집히고 다시 뒤집는다("역전!" → "재역전!"). 결승만.
 * - close: 0.5 언저리에서 엎치락뒤치락하다 끝에 갈린다("막상막하!" → "간발의 차!").
 * - rout: 이긴 쪽이 처음부터 밀어붙인다("압도적!"). 4강만 — 결승은 늘 아슬아슬하게.
 */
export type FightKind = 'comeback' | 'seesaw' | 'close' | 'rout';

/** 게이지 점의 자리(싸움 구간 비율). 마지막 점이 K.O. 다. */
export const GAUGE_AT = [0, 0.3, 0.6, 0.85, 1] as const;

/** 이긴 쪽 힘(0~1)의 본 모양. 마지막은 늘 1 — 이긴 쪽이 끝까지 민다. */
const GAUGE: Record<FightKind, number[]> = {
  comeback: [0.5, 0.3, 0.18, 0.62, 1],
  seesaw: [0.5, 0.78, 0.22, 0.6, 1],
  close: [0.5, 0.56, 0.45, 0.53, 1],
  rout: [0.5, 0.74, 0.88, 0.94, 1],
};

/** 사건 비율. 결승은 압승이 없다. */
export const FINAL_FIGHTS: [FightKind, number][] = [
  ['comeback', 0.36],
  ['seesaw', 0.32],
  ['close', 0.32],
];
export const SEMI_FIGHTS: [FightKind, number][] = [
  ['comeback', 0.36],
  ['close', 0.3],
  ['rout', 0.34],
];
/** 빠른 판(4강 앞)에서 한 경기가 "진 쪽이 먼저 앞서다 뒤집히는" 비율. */
export const FAKE_RATE = 0.55;

export interface Shout {
  atMs: number;
  text: string;
  tone: 'swap' | 'close' | 'rout' | 'ko';
}

export interface Feature {
  /** 이 판에서 몇 번째 짝인지(round[2m] 대 round[2m+1]). */
  match: number;
  kind: FightKind;
  /** 카드가 쾅 들어오는 시각(판 시작과 같다). */
  slamMs: number;
  /** 눈싸움 시작(결승만). 아니면 null. */
  stareMs: number | null;
  /** 게이지가 움직이기 시작하는 시각 · K.O. 시각. */
  fightMs: number;
  koMs: number;
  /** 컷신이 빠지는 시각. 결승은 트로피로 바로 넘어가므로 null. */
  outMs: number | null;
  /** 이긴 쪽 힘 — GAUGE_AT 자리마다. 마지막은 1. */
  gauge: number[];
  /** 앞선 쪽이 뒤집힌 시각(역전). 처음 앞서는 쪽이 정해지는 순간은 넣지 않는다. */
  swaps: number[];
  /** 화면 가운데 외침. 마지막은 K.O.(또는 간발의 차). */
  shouts: Shout[];
}

export interface RoundPlan {
  round: number;
  startMs: number;
  /** 모든 경기가 맞부딪치는 시각 · 결과가 나는 시각 · 판이 끝나는 시각. */
  clashMs: number;
  resultMs: number;
  endMs: number;
  /** 컷신으로 크게 보여 주는 경기. 4강·결승에만 있다. */
  feature: Feature | null;
  /** 빠른 판에서 진 쪽이 잠깐 앞서 보이는 경기(역전 연출). */
  fake: { match: number; atMs: number } | null;
}

export interface TournamentPlan {
  rounds: RoundPlan[];
  /** 트로피를 드는 시각 · 끝(onSpinEnd). */
  trophyMs: number;
  endMs: number;
}

/** 4강 컷신 한 판 · 트로피를 들고 끝나기까지. */
const SEMI_MS = 1500;
const TROPHY_MS = 1100;
/** 카드가 쾅 들어와 자리 잡기까지 · 결승 K.O. 뒤 숨 돌리기. */
const SLAM_MS = 380;
const KO_HOLD_MS = 450;

function pick<T>(table: [T, number][], rng: () => number): T {
  const sum = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * sum;
  for (const [v, w] of table) {
    r -= w;
    if (r < 0) return v;
  }
  return table[table.length - 1][0];
}

/** 진짜 경기(빈자리 없는 짝)의 번호들. */
export function realMatches(round: Entry[]): number[] {
  const out: number[] = [];
  for (let m = 0; m < round.length / 2; m += 1) if (round[2 * m] !== null && round[2 * m + 1] !== null) out.push(m);
  return out;
}

/** 게이지가 0.5 를 넘나드는 자리(싸움 구간 비율). 처음 앞서는 쪽이 정해지는 순간은 빼고, 뒤집힌 순간만. */
export function gaugeSwaps(gauge: number[]): number[] {
  const out: number[] = [];
  let lead = 0;
  for (let k = 1; k < gauge.length; k += 1) {
    const a = gauge[k - 1];
    const b = gauge[k];
    const sb = Math.sign(b - 0.5);
    if (sb !== 0 && lead !== 0 && sb !== lead) {
      const f = (0.5 - a) / (b - a);
      out.push(GAUGE_AT[k - 1] + (GAUGE_AT[k] - GAUGE_AT[k - 1]) * f);
    }
    if (sb !== 0) lead = sb;
  }
  return out;
}

function feature(
  round: Entry[],
  kind: FightKind,
  rng: () => number,
  t0: number,
  stare: number | null,
  fight: number,
  out: number | null,
): Feature {
  const real = realMatches(round);
  const match = real[Math.floor(rng() * real.length)];
  // 가운데 점만 살짝 흔든다. 막상막하는 0.5 를 넘나드는 모양이 깨지지 않게 그대로 둔다.
  const gauge = GAUGE[kind].map((v, k) =>
    k === 0 || k === GAUGE_AT.length - 1 || kind === 'close' ? v : Math.round((v + (rng() - 0.5) * 0.06) * 1000) / 1000,
  );
  const stareMs = stare === null ? null : t0 + SLAM_MS;
  const fightMs = Math.round(t0 + SLAM_MS + (stare ?? 0));
  const koMs = fightMs + fight;
  const swaps = gaugeSwaps(gauge).map((f) => Math.round(fightMs + f * fight));
  const shouts: Shout[] = [];
  if (kind === 'comeback') shouts.push({ atMs: swaps[0], text: '역전!', tone: 'swap' });
  if (kind === 'seesaw') {
    shouts.push({ atMs: swaps[0], text: '역전!', tone: 'swap' });
    shouts.push({ atMs: swaps[1], text: '재역전!', tone: 'swap' });
  }
  if (kind === 'close') shouts.push({ atMs: swaps[0], text: '막상막하!', tone: 'close' });
  if (kind === 'rout') shouts.push({ atMs: Math.round(fightMs + fight * 0.45), text: '압도적!', tone: 'rout' });
  shouts.push({ atMs: koMs, text: kind === 'close' ? '간발의 차!' : 'K.O.!', tone: 'ko' });
  return { match, kind, slamMs: t0, stareMs, fightMs, koMs, outMs: out === null ? null : koMs + out, gauge, swaps, shouts };
}

/**
 * 판마다 언제 무엇을 보여 줄지. 결과는 bracket 이 이미 정했다 — 여기서는 시각과 연출 모양만 고른다.
 * 사건은 승패를 바꾸지 않는다. 게이지 마지막 값은 언제나 "이긴 쪽 1" 이다.
 *
 * - 4강(판이 둘 이상이면 결승 바로 앞 판)은 한 경기를 컷신으로 크게: 카드가 쾅 → 게이지 싸움 → K.O.
 *   어느 경기를 크게 볼지는 무작위 — 우승 가게 경기만 고르면 결과가 미리 보인다.
 * - 그보다 앞 판(빠른 판)은 모든 경기가 한 번에 맞부딪치고, 절반 남짓은 한 경기에서 진 쪽이 먼저 앞서 보인다.
 * - 결승은 눈싸움을 길게 하고 게이지가 꼭 한 번 이상 흔들린다(압승 없음). 그다음 트로피.
 *
 * 길이: 1판(2곳) 약 4.6~4.9초 · 5판(17~20곳) 약 7초. 상한 capMs.
 */
export function tournamentPlan(bracket: Bracket, rng: () => number, capMs: number): TournamentPlan {
  const matchRounds = Math.max(0, bracket.rounds.length - 1);
  if (matchRounds === 0) return { rounds: [], trophyMs: 0, endMs: 0 };

  const final = matchRounds - 1;
  const semi = matchRounds >= 2 ? matchRounds - 2 : -1;
  const quickCount = Math.max(0, matchRounds - 2);
  // 결승: 판이 적을수록 눈싸움·싸움을 길게 — 2곳이면 결승 하나가 전부다.
  const stare = matchRounds === 1 ? 1100 : 650;
  const fight = matchRounds === 1 ? 1500 : 1100;
  const finalMs = SLAM_MS + stare + fight + KO_HOLD_MS;
  const fixed = (semi >= 0 ? SEMI_MS : 0) + finalMs + TROPHY_MS;
  const quick = quickCount === 0 ? 0 : Math.min(650, Math.max(420, (capMs - 300 - fixed) / quickCount));
  // 눈싸움 길이를 판마다 조금씩 — 남는 시간 안에서만.
  const room = Math.max(0, Math.min(250, capMs - fixed - quick * quickCount));
  const extraStare = Math.round(rng() * room);

  const rounds: RoundPlan[] = [];
  let t = 0;
  for (let r = 0; r < matchRounds; r += 1) {
    const round = bracket.rounds[r];
    const real = realMatches(round);
    if (r === final) {
      const f = feature(round, pick(FINAL_FIGHTS, rng), rng, t, stare + extraStare, fight, null);
      rounds.push({ round: r, startMs: t, clashMs: f.fightMs, resultMs: f.koMs, endMs: f.koMs + KO_HOLD_MS, feature: f, fake: null });
      t = f.koMs + KO_HOLD_MS;
    } else if (r === semi && real.length > 0) {
      const f = feature(round, pick(SEMI_FIGHTS, rng), rng, t, null, 750, 250);
      rounds.push({ round: r, startMs: t, clashMs: f.fightMs, resultMs: f.koMs, endMs: t + SEMI_MS, feature: f, fake: null });
      t += SEMI_MS;
    } else {
      // 빠른 판. (4강인데 진짜 경기가 없으면 — 빈자리뿐인 판은 생기지 않지만 — 같은 길이의 빠른 판으로.)
      const d = r === semi ? SEMI_MS : quick;
      const fake =
        real.length > 0 && rng() < FAKE_RATE
          ? { match: real[Math.floor(rng() * real.length)], atMs: Math.round(t + d * 0.46) }
          : null;
      rounds.push({
        round: r,
        startMs: Math.round(t),
        clashMs: Math.round(t + d * 0.28),
        resultMs: Math.round(t + d * 0.7),
        endMs: Math.round(t + d),
        feature: null,
        fake,
      });
      t += d;
    }
  }
  const trophyMs = Math.round(t);
  return { rounds, trophyMs, endMs: Math.min(capMs, trophyMs + TROPHY_MS) };
}

/**
 * 연출 단계.
 * 빠른 판: list(대진이 뜬다) · clash(맞부딪침) · fake(진 쪽이 앞서 보임) · result(승패).
 * 컷신 판: slam(카드 쾅) · stare(눈싸움, 결승만) · fight(게이지) · shout(역전 외침) · ko · out(컷신 빠짐).
 * 끝: trophy.
 */
export type CuePhase = 'list' | 'clash' | 'fake' | 'result' | 'slam' | 'stare' | 'fight' | 'shout' | 'ko' | 'out' | 'trophy';

export interface Cue {
  atMs: number;
  round: number;
  phase: CuePhase;
  /** shout 일 때 feature.shouts 의 몇 번째인지. */
  shout?: number;
}

/** 일정을 시각 순 단계 목록으로 편다. 첫 단계는 0ms, 마지막은 trophy. */
export function tournamentCues(plan: TournamentPlan): Cue[] {
  const cues: Cue[] = [];
  for (const rp of plan.rounds) {
    const f = rp.feature;
    if (f) {
      cues.push({ atMs: f.slamMs, round: rp.round, phase: 'slam' });
      if (f.stareMs !== null) cues.push({ atMs: f.stareMs, round: rp.round, phase: 'stare' });
      cues.push({ atMs: f.fightMs, round: rp.round, phase: 'fight' });
      f.shouts.forEach((s, k) => {
        if (s.tone !== 'ko') cues.push({ atMs: s.atMs, round: rp.round, phase: 'shout', shout: k });
      });
      cues.push({ atMs: f.koMs, round: rp.round, phase: 'ko' });
      if (f.outMs !== null) cues.push({ atMs: f.outMs, round: rp.round, phase: 'out' });
    } else {
      cues.push({ atMs: rp.startMs, round: rp.round, phase: 'list' });
      cues.push({ atMs: rp.clashMs, round: rp.round, phase: 'clash' });
      if (rp.fake) cues.push({ atMs: rp.fake.atMs, round: rp.round, phase: 'fake' });
      cues.push({ atMs: rp.resultMs, round: rp.round, phase: 'result' });
    }
  }
  cues.push({ atMs: plan.trophyMs, round: plan.rounds.length, phase: 'trophy' });
  // 같은 시각이면 넣은 순서(판·단계 순)를 지킨다 — sort 는 안정 정렬이다.
  return cues.sort((a, b) => a.atMs - b.atMs);
}
