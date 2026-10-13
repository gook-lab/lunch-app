/**
 * 예측 표 정리 — 화면에 쓸 모양으로. 서비스·화면과 떼어 테스트한다.
 */
import type { Vote } from '../services/predictions';

/** 후보별 표 수, 많은 순(같으면 후보 순서). 후보에 없는 가게 표는 뺀다. */
export function tally(votes: Vote[], candidateIds: string[]): { placeId: string; count: number; names: string[] }[] {
  const order = new Map(candidateIds.map((id, i) => [id, i]));
  const by = new Map<string, string[]>();
  for (const v of votes) {
    if (!order.has(v.placeId)) continue;
    by.set(v.placeId, [...(by.get(v.placeId) ?? []), v.name]);
  }
  return [...by.entries()]
    .map(([placeId, names]) => ({ placeId, count: names.length, names }))
    .sort((a, b) => b.count - a.count || order.get(a.placeId)! - order.get(b.placeId)!);
}

/** 당첨을 맞힌 사람 이름. */
export function winnersOf(votes: Vote[], placeId: string): string[] {
  return votes.filter((v) => v.placeId === placeId).map((v) => v.name);
}

const NAME_KEY = 'lunch-app:nickname';

export function savedName(): string {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    window.localStorage.setItem(NAME_KEY, name);
  } catch {
    // 기억 못 해도 이번엔 쓴다.
  }
}
