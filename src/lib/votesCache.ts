/**
 * 지난 날 예측 표 보관 — 예측왕(주·달)이 화면을 열 때마다 날짜 수만큼 다시 읽던 것을 줄인다.
 *
 * 지난 날 표는 규칙상 바뀌지 않는다(firestore.rules: 쓰기는 오늘만). 그래서 한 번 읽으면
 * 이 기기에 두고 다시 쓴다. 어제 표만은 두지 않는다 — 기기 시계가 서버보다 늦으면 어제가
 * 서버에선 아직 오늘이라 표가 더 들어올 수 있다. 이번 달이 아닌 날은 꺼낼 때 지운다.
 */
import { dayIdBefore, type DayId } from './date';
import type { Vote } from '../services/types';

const PREFIX = 'lunch-app:votes:v1:';

/** 이 날 표를 두어도 되는가. 그저께부터다. */
export const cacheable = (day: DayId, today: DayId) => day < dayIdBefore(today, 1);

const keyOf = (scope: string, day: DayId) => `${PREFIX}${scope}:${day}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readCachedVotes(scope: string, day: DayId, store = storage()): Vote[] | null {
  try {
    const raw = store?.getItem(keyOf(scope, day));
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as Vote[]) : null;
  } catch {
    return null;
  }
}

export function writeCachedVotes(scope: string, day: DayId, today: DayId, votes: Vote[], store = storage()) {
  if (!cacheable(day, today)) return;
  try {
    store?.setItem(keyOf(scope, day), JSON.stringify(votes));
  } catch {
    // 꽉 찼거나 막혔으면 그냥 다음에 다시 읽는다.
  }
}

/** keep 에 없는 날의 보관분을 지운다. 달이 바뀌면 지난달 것이 빠진다. */
export function pruneCachedVotes(scope: string, keep: readonly DayId[], store = storage()) {
  try {
    if (!store) return;
    const head = `${PREFIX}${scope}:`;
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(head) && !keep.includes(k.slice(head.length))) stale.push(k);
    }
    for (const k of stale) store.removeItem(k);
  } catch {
    // 못 지우면 다음에.
  }
}
