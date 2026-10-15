// @vitest-environment jsdom
/** 점심 팟 — 열기·참여·나가기·꽉 참·마감·출발·방장 게임·같이 보는 결과. */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Parties, type PartyActions } from './Parties';
import { preloadGames } from './games';
import { avatarOf } from '../lib/avatar';
import type { Place } from '../lib/candidates';
import type { Party } from '../services/types';

const DAY = '20261015';
const ME = 'me-uid';
// KST 10:00. 출발 11:50 팟은 아직 모집 중.
const NOW = new Date(Date.UTC(2026, 9, 15, 1, 0));

const place = (id: string, name: string) =>
  ({
    id,
    name,
    category: '면',
    sub: '라멘·우동',
    lat: 37.5,
    lng: 126.9,
    walkMin: 5,
    kakaoPlaceId: id,
    active: true,
    createdBy: 'u',
  }) as Place;
const places = [place('a', '가집'), place('b', '나집'), place('c', '다집')];

const party = (over: Partial<Party> = {}): Party => ({
  id: 'other',
  hostUid: 'other',
  category: '면',
  time: '11:50',
  max: 4,
  memo: '국물 땡기는 날',
  status: 'open',
  members: [{ uid: 'other', at: 1 }],
  game: null,
  ...over,
});

let actions: { [K in keyof PartyActions]: ReturnType<typeof vi.fn> };

function show(parties: Party[], over: Partial<Parameters<typeof Parties>[0]> = {}) {
  return render(
    <Parties
      day={DAY}
      parties={parties}
      myUid={ME}
      places={places}
      candidatesFor={() => places}
      preferredMode="wheel"
      actions={actions as unknown as PartyActions}
      {...over}
    />,
  );
}

beforeAll(() => preloadGames());

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  actions = {
    open: vi.fn(async () => {}),
    join: vi.fn(async () => {}),
    leave: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    saveGame: vi.fn(async () => {}),
  };
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  // 연출 없이 바로 끝나게(동작 줄이기). 게임은 결과 장면만 그리고 onSpinEnd 를 부른다.
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  const stub: object = new Proxy(function () {}, {
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : stub),
    apply: () => stub,
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = (() => stub) as never;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('점심 팟', () => {
  it('내 아바타를 알려 주고, 팟이 없으면 모아 보자고 한다', () => {
    show([]);
    expect(screen.getByText(avatarOf(ME, DAY).label)).toBeTruthy();
    expect(screen.getByText(/아직 열린 팟이 없어요/)).toBeTruthy();
  });

  it('팟 모으기 — 메뉴를 골라야 열 수 있고, 고른 값으로 연다', async () => {
    show([]);
    fireEvent.click(screen.getByRole('button', { name: '팟 모으기' }));
    const sheet = screen.getByRole('dialog', { name: '점심 팟 모으기' });
    const submit = within(sheet).getByRole('button', { name: '팟 열기' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(within(sheet).getByRole('button', { name: /면/ }));
    fireEvent.click(within(sheet).getByRole('button', { name: '한 명 늘리기' }));
    fireEvent.change(within(sheet).getByLabelText(/한 줄 메모/), { target: { value: '  라멘 먹어요 ' } });
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(actions.open).toHaveBeenCalledWith({ category: '면', time: '11:50', max: 5, memo: '라멘 먹어요' });
  });

  it('지난 시각으로는 못 열고 이유를 말해 준다', async () => {
    show([]);
    fireEvent.click(screen.getByRole('button', { name: '팟 모으기' }));
    const sheet = screen.getByRole('dialog', { name: '점심 팟 모으기' });
    fireEvent.click(within(sheet).getByRole('button', { name: /밥/ }));
    fireEvent.change(within(sheet).getByLabelText('출발 시각'), { target: { value: '09:00' } });
    await act(async () => {
      fireEvent.click(within(sheet).getByRole('button', { name: '팟 열기' }));
    });
    expect(actions.open).not.toHaveBeenCalled();
    expect(within(sheet).getByRole('alert').textContent).toMatch('이미 지난 시각이에요');
  });

  it('남의 팟에 참여하고, 들어간 팟에선 나간다', async () => {
    const { rerender } = show([party()]);
    expect(screen.getByText('1/4명')).toBeTruthy();
    expect(screen.getByText('국물 땡기는 날')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '참여하기' }));
    });
    expect(actions.join).toHaveBeenCalledWith('other');

    rerender(
      <Parties
        day={DAY}
        parties={[
          party({
            members: [
              { uid: 'other', at: 1 },
              { uid: ME, at: 2 },
            ],
          }),
        ]}
        myUid={ME}
        places={places}
        candidatesFor={() => places}
        preferredMode="wheel"
        actions={actions as unknown as PartyActions}
      />,
    );
    expect(screen.getByText('2/4명')).toBeTruthy();
    expect(screen.getByText('나')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '나가기' }));
    });
    expect(actions.leave).toHaveBeenCalledWith('other');
  });

  it('꽉 찼거나 마감·출발한 팟에는 참여 단추가 잠긴다', () => {
    show([
      party({
        id: 'full',
        hostUid: 'full',
        max: 2,
        members: [
          { uid: 'full', at: 1 },
          { uid: 'x', at: 2 },
        ],
      }),
      party({ id: 'closed', hostUid: 'closed', status: 'closed' }),
      party({ id: 'gone', hostUid: 'gone', time: '09:30' }),
    ]);
    for (const label of ['꽉 찼어요', '마감', '출발했어요']) {
      const button = screen.getAllByRole('button', { name: label })[0] as HTMLButtonElement;
      expect(button.disabled).toBe(true);
    }
    expect(screen.queryByRole('button', { name: '참여하기' })).toBeNull();
  });

  it('참여가 실패하면(자리 다툼) 알려 준다', async () => {
    actions.join.mockRejectedValueOnce(new Error('permission-denied'));
    show([party()]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '참여하기' }));
    });
    expect(screen.getByRole('alert').textContent).toMatch('자리가 찼을 수 있어요');
  });

  it('방장은 마감하고, 확인을 거쳐 취소한다. 오늘 하나 열었으면 더 못 연다', async () => {
    show([party({ id: ME, hostUid: ME, members: [{ uid: ME, at: 1 }] })]);
    expect((screen.getByRole('button', { name: '오늘 팟을 열었어요' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '마감하기' }));
    });
    expect(actions.setStatus).toHaveBeenCalledWith(ME, 'closed');
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(actions.cancel).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '없앨게요' }));
    });
    expect(actions.cancel).toHaveBeenCalledWith(ME);
  });

  it('방장 게임 — 저장한 값은 App 과 같은 균등 난수 한 번, 저장 전엔 결과를 안 보여 준다', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    show([
      party({
        id: ME,
        hostUid: ME,
        members: [
          { uid: ME, at: 1 },
          { uid: 'x', at: 2 },
        ],
      }),
    ]);
    fireEvent.click(screen.getByRole('button', { name: '게임으로 가게 정하기' }));
    const modal = screen.getByRole('dialog', { name: '팟 게임' });
    expect(within(modal).getByText(/3곳 중에서/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(within(modal).getByRole('button', { name: '돌림판으로 뽑기' }));
    });
    expect(actions.saveGame).toHaveBeenCalledTimes(1);
    expect(actions.saveGame).toHaveBeenCalledWith(ME, {
      mode: 'wheel',
      run: 1 + Math.floor(0.5 * 1_000_000),
      ids: ['a', 'b', 'c'],
      names: ['가집', '나집', '다집'],
      winnerIndex: 1,
    });
    // 문서에 game 이 생기기 전에는 결과 문구가 없다.
    expect(within(modal).queryByText(/가요!/)).toBeNull();
  });

  it('후보가 모자라면 게임을 못 연다', () => {
    show([party({ id: ME, hostUid: ME, members: [{ uid: ME, at: 1 }] })], { candidatesFor: () => [places[0]] });
    fireEvent.click(screen.getByRole('button', { name: '게임으로 가게 정하기' }));
    const modal = screen.getByRole('dialog', { name: '팟 게임' });
    expect(within(modal).getByText(/2곳은 있어야/)).toBeTruthy();
    expect((within(modal).getByRole('button', { name: /뽑기$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('같이 보는 결과 — 모인 사람은 저장된 판을 다시 보고, 없어진 가게는 저장된 이름으로 나온다', async () => {
    const game = { mode: 'wheel', run: 42, ids: ['a', 'gone'], names: ['가집', '사라진 집'], winnerIndex: 1 };
    show([
      party({
        members: [
          { uid: 'other', at: 1 },
          { uid: ME, at: 2 },
        ],
        game,
      }),
    ]);
    expect(screen.getByText('사라진 집')).toBeTruthy();
    // 방장이 아니면 게임 단추는 없다.
    expect(screen.queryByRole('button', { name: '게임으로 가게 정하기' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
    const modal = screen.getByRole('dialog', { name: '팟 게임' });
    await waitFor(() => expect(within(modal).getByText(/가요!/).textContent).toMatch('사라진 집으로 가요!'));
    fireEvent.click(within(modal).getByRole('button', { name: '다시 보기' }));
    await waitFor(() => expect(within(modal).getByRole('button', { name: '다시 보기' })).toBeTruthy());
  });
});
