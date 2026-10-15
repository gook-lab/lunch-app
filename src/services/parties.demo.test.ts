// @vitest-environment jsdom
/** 점심 팟 (데모) — 규칙이 막는 것을 데모도 막는다. 데모에서만 되는 동작이 있으면 팀용에서 고장으로 읽힌다. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayKST } from '../lib/date';
import { DEMO_UID, loadDemoSample, resetDemo, writeDemo } from './demoStore';
import {
  cancelParty,
  joinParty,
  leaveParty,
  openParty,
  savePartyGame,
  setPartyStatus,
  subscribeParties,
} from './parties.demo';
import type { Party } from './types';

// KST 10:00 — 기본 출발 11:50 이 아직 안 지난 때.
const NOW = new Date(Date.UTC(2026, 9, 15, 1, 0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  localStorage.clear();
  resetDemo();
});
afterEach(() => vi.useRealTimers());

const day = () => todayKST();
const latest = () => {
  let list: Party[] = [];
  subscribeParties(
    day(),
    (p) => (list = p),
    () => {},
  )();
  return list;
};
const input = { category: '면', time: '11:50', max: 2, memo: '  국물  ' };
const seedOther = (over: Partial<Party> = {}) =>
  writeDemo((s) => ({
    ...s,
    parties: {
      [day()]: [
        {
          id: 'other',
          hostUid: 'other',
          category: '밥',
          time: '12:00',
          max: 2,
          memo: '',
          status: 'open',
          members: [{ uid: 'other', at: 1 }],
          game: null,
          ...over,
        },
      ],
    },
  }));

describe('점심 팟 (데모)', () => {
  it('예시로 둘러보면 동료 팟 두 개가 깔린다', () => {
    loadDemoSample();
    const list = latest();
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.members.length >= 2 && p.status === 'open')).toBe(true);
  });

  it('팟을 열면 내가 방장이자 첫 사람이고, 메모는 다듬는다. 하루 한 팟', async () => {
    await openParty(day(), input);
    const [p] = latest();
    expect(p).toMatchObject({ id: DEMO_UID, hostUid: DEMO_UID, category: '면', max: 2, memo: '국물', status: 'open' });
    expect(p.members.map((m) => m.uid)).toEqual([DEMO_UID]);
    await expect(openParty(day(), input)).rejects.toThrow();
  });

  it('틀린 값으로는 못 연다', async () => {
    await expect(openParty(day(), { ...input, category: '한식' })).rejects.toThrow();
    await expect(openParty(day(), { ...input, time: '09:00' })).rejects.toThrow();
    await expect(openParty(day(), { ...input, max: 11 })).rejects.toThrow();
  });

  it('참여·나가기, 꽉 차거나 마감이면 못 들어온다', async () => {
    seedOther();
    await joinParty(day(), 'other');
    expect(latest()[0].members.map((m) => m.uid)).toEqual(['other', DEMO_UID]);
    await leaveParty(day(), 'other');
    expect(latest()[0].members).toHaveLength(1);

    seedOther({
      members: [
        { uid: 'other', at: 1 },
        { uid: 'x', at: 2 },
      ],
    });
    await expect(joinParty(day(), 'other')).rejects.toThrow();
    seedOther({ status: 'closed' });
    await expect(joinParty(day(), 'other')).rejects.toThrow();
    seedOther({ time: '09:00' });
    await expect(joinParty(day(), 'other')).rejects.toThrow();
  });

  it('방장만 마감·취소·게임, 게임은 한 번만', async () => {
    seedOther();
    await expect(setPartyStatus(day(), 'other', 'closed')).rejects.toThrow();
    await expect(cancelParty(day(), 'other')).rejects.toThrow();
    const game = { mode: 'wheel', run: 3, ids: ['a', 'b'], names: ['가', '나'], winnerIndex: 0 };
    await expect(savePartyGame(day(), 'other', game)).rejects.toThrow();

    await openParty(day(), input);
    await expect(leaveParty(day(), DEMO_UID)).rejects.toThrow();
    await setPartyStatus(day(), DEMO_UID, 'closed');
    expect(latest().find((p) => p.id === DEMO_UID)?.status).toBe('closed');
    await savePartyGame(day(), DEMO_UID, game);
    expect(latest().find((p) => p.id === DEMO_UID)?.game).toEqual(game);
    await expect(savePartyGame(day(), DEMO_UID, { ...game, winnerIndex: 1 })).rejects.toThrow();
    await cancelParty(day(), DEMO_UID);
    expect(latest().some((p) => p.id === DEMO_UID)).toBe(false);
  });
});
