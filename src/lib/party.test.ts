import { describe, expect, it } from 'vitest';
import type { Place } from './candidates';
import {
  PARTY_GAME_MAX,
  clampMax,
  defaultPartyTime,
  gameBoard,
  isValidTime,
  nowMinutesKST,
  partyCandidates,
  partyInputProblem,
  partyPhase,
  partyTimeSlots,
  readGame,
  readParty,
  sortParties,
} from './party';
import type { Party } from '../services/types';

/** KST 시각으로 Date 만들기. 기기 시간대와 상관없게 UTC 로 적는다(KST = UTC+9). */
const kst = (hh: number, mm: number) => new Date(Date.UTC(2026, 9, 15, hh - 9, mm));

const party = (over: Partial<Party> = {}): Party => ({
  id: 'h',
  hostUid: 'h',
  category: '면',
  time: '11:50',
  max: 4,
  memo: '',
  status: 'open',
  members: [{ uid: 'h', at: 1 }],
  game: null,
  ...over,
});

describe('팟 시각', () => {
  it('HH:MM 만 받는다', () => {
    expect(isValidTime('11:50')).toBe(true);
    expect(isValidTime('00:00')).toBe(true);
    expect(isValidTime('23:59')).toBe(true);
    for (const bad of ['24:00', '1150', '11:5', '9:30', '11:60', '', '11:50:00']) expect(isValidTime(bad)).toBe(false);
  });

  it('KST 로 몇 분째인지 잰다', () => {
    expect(nowMinutesKST(kst(11, 30))).toBe(690);
    expect(nowMinutesKST(kst(0, 5))).toBe(5);
  });

  it('처음 시각은 11:50, 지났으면 10분 뒤 칸', () => {
    expect(defaultPartyTime(kst(9, 0))).toBe('11:50');
    expect(defaultPartyTime(kst(11, 52))).toBe('12:10');
    expect(defaultPartyTime(kst(12, 0))).toBe('12:10');
    expect(defaultPartyTime(kst(23, 55))).toBe('23:50');
  });
});

describe('팟 열기 검사', () => {
  const ok = { category: '면', time: '11:50', max: 4, memo: '' };
  const at = kst(10, 0);
  it('맞으면 null', () => {
    expect(partyInputProblem(ok, at)).toBeNull();
    expect(partyInputProblem({ ...ok, memo: 'ㄱ'.repeat(40), max: 10 }, at)).toBeNull();
  });
  it('메뉴·시각·지난 시각·인원·메모를 사람 말로 알려 준다', () => {
    expect(partyInputProblem({ ...ok, category: '한식' }, at)).toBe('메뉴를 골라 주세요');
    expect(partyInputProblem({ ...ok, time: '25:00' }, at)).toBe('출발 시각을 확인해 주세요');
    expect(partyInputProblem({ ...ok, time: '09:30' }, at)).toBe('이미 지난 시각이에요');
    expect(partyInputProblem({ ...ok, max: 1 }, at)).toBe('인원은 2~10명이에요');
    expect(partyInputProblem({ ...ok, max: 11 }, at)).toBe('인원은 2~10명이에요');
    expect(partyInputProblem({ ...ok, max: 2.5 }, at)).toBe('인원은 2~10명이에요');
    expect(partyInputProblem({ ...ok, memo: 'ㄱ'.repeat(41) }, at)).toBe('메모는 40자까지예요');
  });
  it('인원 단추는 2~10 을 넘지 않는다', () => {
    expect(clampMax(1)).toBe(2);
    expect(clampMax(11)).toBe(10);
    expect(clampMax(5)).toBe(5);
  });
});

describe('팟 처지', () => {
  it('출발 > 마감 > 꽉 참 > 모집 중', () => {
    expect(partyPhase(party(), kst(11, 0))).toBe('open');
    expect(
      partyPhase(
        party({
          max: 2,
          members: [
            { uid: 'h', at: 1 },
            { uid: 'a', at: 2 },
          ],
        }),
        kst(11, 0),
      ),
    ).toBe('full');
    expect(partyPhase(party({ status: 'closed' }), kst(11, 0))).toBe('closed');
    expect(partyPhase(party({ status: 'closed' }), kst(11, 50))).toBe('departed');
  });
  it('모집 중인 팟이 먼저, 그다음 시각 순', () => {
    const list = sortParties(
      [
        party({ id: 'a', time: '12:30' }),
        party({ id: 'b', time: '11:40' }),
        party({ id: 'c', time: '12:00', status: 'closed' }),
        party({ id: 'd', time: '12:10' }),
      ],
      kst(11, 45),
    );
    expect(list.map((p) => p.id)).toEqual(['d', 'a', 'c', 'b']);
  });
});

describe('저장된 팟 읽기', () => {
  const game = { mode: 'wheel', run: 7, ids: ['a', 'b'], names: ['가', '나'], winnerIndex: 1 };
  it('게임 모양이 틀리면 없는 것으로 본다', () => {
    expect(readGame(game)).toEqual(game);
    expect(readGame(null)).toBeNull();
    expect(readGame({ ...game, mode: 'memory' })).toBeNull(); // 팟에서 못 돌리는 게임
    expect(readGame({ ...game, winnerIndex: 2 })).toBeNull();
    expect(readGame({ ...game, names: ['가'] })).toBeNull();
    expect(readGame({ ...game, ids: ['a', 3] })).toBeNull();
    expect(readGame({ ...game, ids: ['a'], names: ['가'], winnerIndex: 0 })).toBeNull();
  });
  it('방장이 첫 사람, 나머지는 들어온 순서', () => {
    const p = readParty(
      'h',
      {
        hostUid: 'h',
        category: '면',
        time: '11:50',
        max: 4,
        memo: '',
        status: 'open',
        members: { b: 30, h: 50, a: 10 },
        game,
      },
      (v) => v as number,
    );
    expect(p?.members.map((m) => m.uid)).toEqual(['h', 'a', 'b']);
    expect(p?.game?.winnerIndex).toBe(1);
  });
  it('모양이 틀린 문서는 뺀다', () => {
    expect(
      readParty(
        'x',
        { hostUid: 'x', category: '면', time: '1150', max: 4, memo: '', status: 'open', members: {} },
        Number,
      ),
    ).toBeNull();
    expect(
      readParty(
        'x',
        { hostUid: 'x', category: '면', time: '11:50', max: 4, memo: '', status: 'gone', members: {} },
        Number,
      ),
    ).toBeNull();
  });
});

describe('팟 게임판', () => {
  const place = (id: string, name: string) => ({ id, name, category: '라멘·우동', walkMin: 3 }) as Place;
  it('없어진 가게는 저장된 이름으로 세우고, 이름은 늘 저장된 것을 쓴다', () => {
    const board = gameBoard(
      { mode: 'wheel', run: 1, ids: ['a', 'gone'], names: ['예전 이름', '없어진 집'], winnerIndex: 1 },
      [place('a', '바뀐 이름')],
      '면',
    );
    expect(board.map((p) => [p.id, p.name])).toEqual([
      ['a', '예전 이름'],
      ['gone', '없어진 집'],
    ]);
    expect(board[0].category).toBe('라멘·우동');
    expect(board[1].category).toBe('면');
  });
  it('후보가 30곳을 넘으면 무작위로 30곳 — 앞쪽만 자르지 않는다', () => {
    const many = Array.from({ length: 40 }, (_, i) => i);
    expect(partyCandidates(many.slice(0, 5), Math.random)).toEqual([0, 1, 2, 3, 4]);
    let lastSeen = 0;
    for (let t = 0; t < 200; t += 1) {
      const pool = partyCandidates(many, Math.random);
      expect(pool.length).toBe(PARTY_GAME_MAX);
      expect(new Set(pool).size).toBe(PARTY_GAME_MAX);
      if (pool.includes(39)) lastSeen += 1;
    }
    // 40곳 중 30곳이니 마지막 가게도 대략 3/4 확률로 들어간다.
    expect(lastSeen).toBeGreaterThan(100);
  });
});

describe('출발 시각 칸', () => {
  it('점심 전이면 11:30 부터 10분 간격, 기본값 11:50 이 들어 있다', () => {
    const slots = partyTimeSlots(kst(10, 5));
    expect(slots).toEqual(['11:30', '11:40', '11:50', '12:00', '12:10', '12:20', '12:30', '12:40']);
    expect(slots).toContain(defaultPartyTime(kst(10, 5)));
  });

  it('점심 시간엔 지금부터 10분 뒤 칸부터', () => {
    const slots = partyTimeSlots(kst(12, 3));
    expect(slots[0]).toBe('12:20');
    expect(slots[0]).toBe(defaultPartyTime(kst(12, 3)));
    for (const t of slots) expect(partyInputProblem({ category: '면', time: t, max: 4, memo: '' }, kst(12, 3))).toBeNull();
  });

  it('밤 늦게는 23:50 에서 끊는다', () => {
    expect(partyTimeSlots(kst(23, 25))).toEqual(['23:40', '23:50']);
  });
});
