// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { compactGameIds, readRecentGames, rememberGame } from './gameRecents';

describe('최근 게임', () => {
  beforeEach(() => localStorage.clear());

  it('최근 사용 순서로 세 개까지만 기억한다', () => {
    let recent = rememberGame('wheel', []);
    recent = rememberGame('ladder', recent);
    recent = rememberGame('wheel', recent);
    recent = rememberGame('claw', recent);
    recent = rememberGame('fishing', recent);
    expect(recent).toEqual(['fishing', 'claw', 'wheel']);
    expect(readRecentGames(new Set(['wheel', 'claw', 'fishing']))).toEqual(recent);
  });

  it('현재 게임, 최근 게임, 추천 게임을 중복 없이 여섯 개로 줄인다', () => {
    expect(compactGameIds('ladder', ['wheel', 'claw'], ['archery', 'wheel', 'fishing', 'cards'])).toEqual([
      'ladder',
      'wheel',
      'claw',
      'archery',
      'fishing',
      'cards',
    ]);
  });
});
