import { describe, expect, it } from 'vitest';
import { recentNote } from '../lib/messages';

describe('recentNote — 목록 머리말', () => {
  it('제외를 켰으면 빠진다고 말한다', () => {
    expect(recentNote(7, true)).toBe('최근 1주에 간 7곳은 오늘 고르지 않아요');
  });
  it('제외를 껐으면 빠진다고 말하지 않는다', () => {
    expect(recentNote(7, false)).not.toContain('빠져요');
    expect(recentNote(7, false)).toContain('7곳도 오늘 함께 골라요');
  });
  it('최근 방문이 없으면 "0곳은 빠집니다" 대신 없음이라고 한다', () => {
    expect(recentNote(0, true)).toBe('최근 1주에 간 곳이 없어요');
    expect(recentNote(0, false)).toBe('최근 1주에 간 곳이 없어요');
  });
});
