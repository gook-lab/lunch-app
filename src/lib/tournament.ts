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
