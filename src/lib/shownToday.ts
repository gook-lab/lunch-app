/**
 * "오늘 나온 곳 빼기" — 같은 날 게임에서 이미 뽑힌 가게를 다음 판 후보에서 뺀다.
 *
 * 후보가 적으면 몇 판 안에 같은 가게가 또 나온다(7곳이면 5판 안에 겹칠 확률 85%).
 * 확률은 균등한데 "특정 집만 나온다" 로 읽혔다(10/15 사용자). 원하는 사람만 켠다.
 *
 * 이 브라우저에만 남는다. 정한 결정(visits)과 달리 공유 상태가 아니다 — 남이 돌린 판까지
 * 빼면 내 화면 후보가 이유 없이 줄어든다. 날이 바뀌면 처음부터.
 */
import type { DayId } from './date';

const SHOWN_KEY = 'lunch-app:shown';
const SKIP_KEY = 'lunch-app:skip-shown';

interface Stored {
  day: DayId;
  ids: string[];
}

export function readShown(day: DayId): string[] {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    if (!raw) return [];
    const s = JSON.parse(raw) as Stored;
    return s.day === day && Array.isArray(s.ids) ? s.ids.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 뽑힌 가게를 더한 목록을 돌려주고 저장한다. 저장이 막혀도 돌려준 값은 이번 방문 동안 쓴다. */
export function addShown(day: DayId, prev: readonly string[], id: string): string[] {
  const ids = prev.includes(id) ? [...prev] : [...prev, id];
  try {
    localStorage.setItem(SHOWN_KEY, JSON.stringify({ day, ids } satisfies Stored));
  } catch {
    // 시크릿 창. 이번 방문 동안만.
  }
  return ids;
}

export function readSkipShown(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeSkipShown(on: boolean): void {
  try {
    if (on) localStorage.setItem(SKIP_KEY, '1');
    else localStorage.removeItem(SKIP_KEY);
  } catch {
    // 시크릿 창. 이번 방문 동안만.
  }
}

export interface WithoutShown<T> {
  /** 이번 판 후보. */
  list: T[];
  /** 오늘 나와서 뺀 곳 수. 0 이면 안 뺐다. */
  skipped: number;
  /** 다 나와서(남은 곳이 min 보다 적어서) 처음부터 다시 도는 중. */
  restarted: boolean;
}

/**
 * 오늘 나온 곳을 뺀 후보. 빼고 나서 min 곳보다 적게 남으면 빼지 않는다 —
 * 게임은 2곳 이상이어야 돌고, 한 곳만 남기면 게임이 아니라 통보다.
 */
export function withoutShown<T extends { id: string }>(
  candidates: readonly T[],
  shown: readonly string[],
  min: number,
): WithoutShown<T> {
  const set = new Set(shown);
  const rest = candidates.filter((c) => !set.has(c.id));
  const skipped = candidates.length - rest.length;
  if (skipped === 0) return { list: [...candidates], skipped: 0, restarted: false };
  if (rest.length < min) return { list: [...candidates], skipped: 0, restarted: true };
  return { list: rest, skipped, restarted: false };
}
