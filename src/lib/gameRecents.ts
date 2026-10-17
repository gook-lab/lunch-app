import type { GameMode } from '../components/games/types';

const KEY = 'lunch-app:recent-games';
const LIMIT = 3;

export function readRecentGames(valid: ReadonlySet<GameMode>): GameMode[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.filter((id): id is GameMode => typeof id === 'string' && valid.has(id as GameMode)).slice(0, LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberGame(mode: GameMode, recent: readonly GameMode[]): GameMode[] {
  const next = [mode, ...recent.filter((id) => id !== mode)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장소가 막혀도 이번 화면의 최근 게임 순서는 유지한다.
  }
  return next;
}

export function compactGameIds(
  current: GameMode,
  recent: readonly GameMode[],
  recommended: readonly GameMode[],
  limit = 6,
  pinned: readonly GameMode[] = [],
): GameMode[] {
  const list = [...new Set([current, ...recent, ...recommended])].slice(0, limit);
  // 고정 게임(핀볼·토너먼트)은 최근 게임에 밀려 접힌 목록에서 사라지지 않게 맨 뒤 자리와 바꾼다.
  for (const id of pinned) {
    if (list.includes(id)) continue;
    const at = list.findLastIndex((x) => x !== current && !pinned.includes(x));
    if (at >= 0) list[at] = id;
  }
  return list;
}
