// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Party } from '../services/parties';

let emit: (list: Party[]) => void = () => {};
const subscribe = vi.fn((_day: string, onList: (list: Party[]) => void) => {
  emit = onList;
  return () => {};
});
vi.mock('../services/parties', () => ({
  subscribeParties: (day: string, onList: (list: Party[]) => void) => subscribe(day, onList),
  partyUid: async () => 'me',
  openParty: vi.fn(),
  joinParty: vi.fn(),
  leaveParty: vi.fn(),
  setPartyStatus: vi.fn(),
  cancelParty: vi.fn(),
  savePartyGame: vi.fn(),
}));

const { useParties } = await import('./useParties');

const mine = (members: string[]): Party => ({
  id: 'me',
  hostUid: 'me',
  category: '면',
  time: '23:59',
  max: 4,
  memo: '',
  status: 'open',
  members: members.map((uid, i) => ({ uid, at: i + 1 })),
  game: null,
});

describe('useParties — 알림', () => {
  beforeEach(() => subscribe.mockClear());

  it('목록이 와도 구독을 다시 걸지 않고, 내 팟에 들어온 사람을 한 번만 알린다', async () => {
    const { result } = renderHook(() => useParties('20261016'));
    await act(async () => {}); // uid
    act(() => emit([mine(['me'])])); // 첫 목록 — 알리지 않는다
    expect(result.current.alerts).toEqual([]);
    act(() => emit([mine(['me', 'a'])]));
    act(() => emit([mine(['me', 'a'])]));
    expect(result.current.alerts.map((a) => a.uid)).toEqual(['a']);
    expect(subscribe).toHaveBeenCalledTimes(1);

    act(() => result.current.dismissAlert(result.current.alerts[0].key));
    expect(result.current.alerts).toEqual([]);
    act(() => emit([mine(['me', 'a'])]));
    expect(result.current.alerts).toEqual([]);
  });
});
