import { describe, expect, it } from 'vitest';
import { recentNote } from '../lib/messages';
import { selectCandidates, type Place } from '../lib/candidates';

const note = (recentlyVisitedCount: number, excludedRecent: boolean, releasedCount = 0) =>
  recentNote({ recentlyVisitedCount, releasedCount, excludedRecent });

describe('recentNote — 목록 머리말', () => {
  it('제외를 켰으면 빠진다고 말한다', () => {
    expect(note(7, true)).toBe('최근 1주에 간 7곳은 오늘 고르지 않아요');
  });
  it('제외를 껐으면 빠진다고 말하지 않는다', () => {
    expect(note(7, false)).not.toContain('고르지 않아요');
    expect(note(7, false)).toContain('7곳도 오늘 함께 골라요');
  });
  it('최근 방문이 없으면 "0곳은 빠집니다" 대신 없음이라고 한다', () => {
    expect(note(0, true)).toBe('최근 1주에 간 곳이 없어요');
    expect(note(0, false)).toBe('최근 1주에 간 곳이 없어요');
  });
  it('다시 넣은 곳은 빠진 수에서 뺀다', () => {
    expect(note(4, true, 1)).toBe('최근 1주에 간 3곳은 오늘 고르지 않아요 · 1곳은 다시 넣었어요');
  });
  it('전부 다시 넣었으면 고르지 않는다고 하지 않는다', () => {
    expect(note(2, true, 2)).toBe('가게가 모자라서 최근 1주에 간 2곳도 오늘 함께 골라요');
  });

  it('selectCandidates 결과 그대로 — 도보·메뉴로 걸러진 곳은 세지 않는다', () => {
    const mk = (id: string, walkMin: number, category = '한식'): Place => ({
      id, name: id, category, lat: 0, lng: 0, walkMin, kakaoPlaceId: id, active: true, createdBy: 'u',
    });
    const places = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => mk(id, 5)).concat(mk('far', 20), mk('cn', 5, '중식'));
    // 최근 1주 안에 a·b·far·cn 을 갔다. far 는 도보 밖, cn 은 메뉴 밖이라 오늘 판과 상관없다.
    const visits = [
      { id: '20261013', placeId: 'a' },
      { id: '20261012', placeId: 'b' },
      { id: '20261011', placeId: 'far' },
      { id: '20261010', placeId: 'cn' },
    ];
    const filters = { maxWalkMin: 10, categories: ['한식'], excludeRecent: true };
    expect(recentNote(selectCandidates(places, visits, filters, '20261014'))).toBe('최근 1주에 간 2곳은 오늘 고르지 않아요');
    // 후보가 모자라 둘 다 다시 넣으면 "고르지 않아요" 라고 하지 않는다.
    const few = selectCandidates(places.filter((p) => p.id !== 'f' && p.id !== 'g'), visits, filters, '20261014');
    expect(few.releasedCount).toBe(2);
    expect(recentNote(few)).toBe('가게가 모자라서 최근 1주에 간 2곳도 오늘 함께 골라요');
  });
});
