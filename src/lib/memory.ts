/**
 * 짝 맞추기(탈락형) — 두 장씩 뒤집어 짝을 맞춘 가게는 빠지고, 끝까지 남은
 * 짝이 오늘 점심이다.
 *
 * 당첨은 App 이 균등 난수로 이미 정했다. 카드는 처음부터 그림이 정해져 있지
 * 않고 뒤집는 순간 정해진다(assignCard). 당첨이 아닌 가게 카드를 먼저 다 쓰고,
 * 당첨 짝은 마지막까지 안 뒤집힌 두 장이 된다. 안 뒤집힌 카드는 서로 구별할
 * 수 없으므로 미리 섞어 엎어 둔 것과 사용자에게 보이는 것이 같다 — 사다리·카드의
 * "가린 칸에 놓기"(lib/ladder.ts revealSlots)와 같은 논리다.
 *
 * "처음 맞춘 짝이 당첨" 규칙은 쓰지 않는다. 기억력 좋은 사람이 이미 본 두 장으로
 * 아무 가게나 맞출 수 있어 당첨을 미리 정해 둘 수가 없다.
 */

/** 판에 까는 짝 수. 12장이면 휴대폰에서 4×3 으로 들어간다. */
export const MEMORY_PAIRS = 6;

/** 카드 앞면. 후보 번호, 아직 안 정했으면 null. */
export type Faces = (number | null)[];

/**
 * 판에 깔 가게(후보 번호). 당첨 + 나머지 후보에서 무작위, 순서도 섞는다.
 * 후보가 MEMORY_PAIRS 보다 많으면 일부만 깐다 — 당첨은 이미 정해졌으니
 * 판에 누가 깔리든 결과는 같다.
 */
export function memoryPlaces(
  count: number,
  winner: number,
  random: () => number,
  pairs = MEMORY_PAIRS,
): number[] {
  const others = Array.from({ length: count }, (_, i) => i).filter((i) => i !== winner);
  shuffle(others, random);
  const picked = [winner, ...others.slice(0, Math.max(0, Math.min(count, pairs) - 1))];
  return shuffle(picked, random);
}

/**
 * 막 뒤집은 카드의 앞면을 정한다. 당첨이 아닌 가게의 남은 장 중에서 고르게
 * 고르고, 그게 다 떨어졌을 때만 당첨이다.
 */
export function assignCard(faces: Faces, places: number[], winner: number, random: () => number): number {
  const pool: number[] = [];
  for (const p of places) {
    if (p === winner) continue;
    const used = faces.filter((f) => f === p).length;
    for (let k = used; k < 2; k += 1) pool.push(p);
  }
  return pool.length > 0 ? pool[Math.floor(random() * pool.length)] : winner;
}

/** 안 정해진 카드가 두 장 이하면 결과가 굳었다 — 남은 건 당첨 짝뿐이다. */
export function isSettled(faces: Faces): boolean {
  return faces.filter((f) => f === null).length <= 2;
}

/** 굳은 판의 남은 카드를 채운다. 당첨이 아닌 장은 이미 다 썼으므로 전부 당첨이다. */
export function settle(faces: Faces, winner: number): number[] {
  return faces.map((f) => (f === null ? winner : f));
}

/** 앞면이 정해졌고 아직 안 빠진 카드 중 짝이 다 보인 것. 자동 진행이 먼저 맞춘다. */
function knownPair(faces: Faces, matched: boolean[]): [number, number] | null {
  const seen = new Map<number, number>();
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    if (f === null || matched[i]) continue;
    const j = seen.get(f);
    if (j !== undefined) return [j, i];
    seen.set(f, i);
  }
  return null;
}

function pickOne(ids: number[], random: () => number): number {
  return ids[Math.floor(random() * ids.length)];
}

/** 자동 진행의 첫 장. 아는 짝이 있으면 그것, 없으면 안 본 카드. */
export function autoFirst(faces: Faces, matched: boolean[], random: () => number): number {
  const pair = knownPair(faces, matched);
  if (pair) return pair[0];
  const live = faces.map((_, i) => i).filter((i) => !matched[i]);
  const unseen = live.filter((i) => faces[i] === null);
  return pickOne(unseen.length > 0 ? unseen : live, random);
}

/** 자동 진행의 둘째 장. 첫 장의 짝을 봤으면 그것, 아니면 안 본 카드. */
export function autoSecond(faces: Faces, matched: boolean[], first: number, random: () => number): number {
  const live = faces.map((_, i) => i).filter((i) => !matched[i] && i !== first);
  const partner = live.find((i) => faces[i] !== null && faces[i] === faces[first]);
  if (partner !== undefined) return partner;
  const unseen = live.filter((i) => faces[i] === null);
  return pickOne(unseen.length > 0 ? unseen : live, random);
}

function shuffle<T>(a: T[], random: () => number): T[] {
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
