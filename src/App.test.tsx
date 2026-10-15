// @vitest-environment jsdom
/**
 * App 상태 조합 테스트.
 *
 * 게임 모드·필터·탭·결정 버튼이 얽힌 자리다. 지난 점검에서 영구 고착 버그
 * 두 건(연출 중 필터 변경, 연출 중 탭 전환)이 여기서 나왔는데 단위 테스트가
 * 닿지 않아 브라우저로만 잡았다. 그 경로들을 여기서 못 박는다.
 *
 * Firebase 는 전부 가짜다. useLunchData 가 고정 목록을 돌려주고 decideToday
 * 는 호출만 기록한다. 난수는 0 으로 고정해 당첨이 항상 첫 후보가 되게 한다.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { preloadGames } from './components/games';
import { decideToday } from './services/lunch';
import { RESULT_DELAY_MS, SPIN_MS, setForceMotion, setQuickResult } from './components/games/types';
import { CARDS_MAX_MS } from './lib/cards';

const fx = vi.hoisted(() => {
  const place = (id: string, name: string) => ({
    id, name, category: '한식', lat: 37.5, lng: 126.9, walkMin: 5,
    kakaoPlaceId: `k-${id}`, active: true, createdBy: 'u',
  });
  return {
    places: [place('a', '가집'), place('b', '나집'), place('c', '다집'), place('d', '라집'), place('e', '마집')],
    decision: null as null | { dayId: string; placeId: string },
    votes: [] as { uid: string; placeId: string; name: string }[],
  };
});

vi.mock('./hooks/useTodayKST', () => ({ useTodayKST: () => '20261008' }));
vi.mock('./services/parties', () => ({
  partyUid: async () => 'me',
  subscribeParties: (_d: string, on: (p: unknown[]) => void) => {
    on([]);
    return () => {};
  },
  openParty: vi.fn(async () => {}),
  joinParty: vi.fn(async () => {}),
  leaveParty: vi.fn(async () => {}),
  setPartyStatus: vi.fn(async () => {}),
  cancelParty: vi.fn(async () => {}),
  savePartyGame: vi.fn(async () => {}),
}));
vi.mock('./services/predictions', () => ({
  myUid: async () => 'me',
  subscribeVotes: (_d: string, on: (v: { uid: string; placeId: string; name: string }[]) => void) => {
    on(fx.votes ?? []);
    return () => {};
  },
  castVote: vi.fn(async () => {}),
  clearVote: vi.fn(async () => {}),
}));
vi.mock('./hooks/useLunchData', () => ({
  useLunchData: () => ({
    state: 'ready', error: null, places: fx.places, visits: [],
    today: fx.decision, refreshing: false, reload: () => {},
  }),
}));
vi.mock('./services/ratings', () => ({
  subscribeRatings: () => () => {},
  ratingUid: async () => 'me',
  rate: vi.fn(async () => {}),
  unrate: vi.fn(async () => {}),
}));
vi.mock('./services/lunch', () => ({ decideToday: vi.fn(async () => {}) }));
vi.mock('./components/MapTab', () => ({
  default: ({ focusId }: { focusId?: string | null }) => <p data-testid="map-focus">{focusId ?? 'none'}</p>,
}));

const runButton = () => screen.getByRole('button', { name: /돌리기 \(\d+곳 중에서\)|^게임 중$/ });
// 결과는 모달 안 티켓, 모달을 닫았거나 뜨기 전이면 게임 아래 한 줄 결과에 있다.
const card = () =>
  (document.querySelector('dialog[open] .ticket__name') ?? document.querySelector('.result-bar strong'))?.textContent?.trim() ?? null;
// "여기로 결정" 은 결과 모달과 게임 아래 한 줄 결과 두 곳에 있다. 모달 쪽.
const modalDecide = () =>
  within(document.querySelector('dialog[open]') as HTMLElement).getByRole('button', { name: '여기로 결정' });
const lockedButtons = () =>
  [...document.querySelectorAll('button')].filter((b) => b.disabled).map((b) => b.textContent?.trim());

// 게임은 나눠 받는다(games/lazy.tsx). 테스트는 시작 전에 다 받아 두어 바로 그려지게 한다.
beforeAll(() => preloadGames());

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom 에 없는 것들. 게임은 rAF 로 진행도를 그리고 setTimeout 으로 끝낸다.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  Element.prototype.scrollIntoView = () => {};
  // 어떤 메서드를 불러도, 그 결과(그라디언트 등)의 메서드를 불러도 되는 빈 캔버스.
  const stub: object = new Proxy(function () {}, {
    // 숫자로 쓰이면(measureText().width 등) 0.
    get: (_t, key) => (key === Symbol.toPrimitive ? () => 0 : stub),
    apply: () => stub,
    set: () => true,
  });
  HTMLCanvasElement.prototype.getContext = (() => stub) as never;
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.spyOn(Math, 'random').mockReturnValue(0);
  fx.decision = null;
  vi.mocked(decideToday).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function startWheel() {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
  fireEvent.click(runButton());
}

describe('결과 모달', () => {
  it('끝나면 결과가 모달로 뜨고, 닫으면 게임 아래엔 한 줄만 남는다', () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    // 마지막 장면을 잠깐 보여 준 뒤에 연다.
    expect(screen.queryByRole('dialog', { name: '오늘의 점심 결과' })).toBeNull();
    act(() => { vi.advanceTimersByTime(RESULT_DELAY_MS); });
    const dialog = screen.getByRole('dialog', { name: '오늘의 점심 결과' }) as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.ticket__name')?.textContent).toBe('가집');
    expect(dialog.querySelector('.ticket__eyebrow')?.textContent).toBe('🎡 돌림판으로 뽑은 오늘의 점심');
    expect(dialog.querySelector('.ticket__name')).toBe(document.activeElement);

    fireEvent.click(screen.getByRole('button', { name: '닫고 게임 보기' }));
    expect(screen.queryByRole('dialog', { name: '오늘의 점심 결과' })).toBeNull();
    // 티켓 전체가 아니라 한 줄 결과만 남는다(10/13 사용자). 초점은 <body> 가 아니라 "결과 보기" 로.
    expect(document.querySelector('.stage .ticket')).toBeNull();
    expect(document.querySelector('.result-bar strong')?.textContent).toBe('가집');
    const reopen = screen.getByRole('button', { name: '결과 보기' });
    expect(reopen).toBe(document.activeElement);

    fireEvent.click(reopen);
    expect((screen.getByRole('dialog', { name: '오늘의 점심 결과' }) as HTMLDialogElement).open).toBe(true);
    expect(modalDecide()).toBeTruthy();
  });

  it('꽃가루는 게임이 끝나 처음 뜰 때만 터지고, "결과 보기" 로 다시 열 땐 안 터진다', () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(document.querySelector('dialog[open] .confetti')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '닫고 게임 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
    expect(document.querySelector('dialog[open] .confetti')).toBeNull();
  });

  it('소리는 설정에서 켜고, 기본으로 꺼져 있고, 켜면 기억한다', () => {
    window.localStorage.removeItem('lunch-app:sound');
    render(<App />);
    expect(screen.queryByRole('button', { name: /^소리/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /설정/ }));
    const toggle = screen.getByRole('switch', { name: /효과음/ });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('switch', { name: /효과음/ }).getAttribute('aria-checked')).toBe('true');
    expect(window.localStorage.getItem('lunch-app:sound')).toBe('1');
    window.localStorage.removeItem('lunch-app:sound');
  });

  it('모달이 뜨기 전에도 한 줄 결과의 "결과 보기" 로 바로 연다', () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    fireEvent.click(screen.getByRole('button', { name: '결과 보기' }));
    expect(modalDecide()).toBeTruthy();
  });
});

describe('동료 예측', () => {
  afterEach(() => { fx.votes = []; });

  it('예측은 당첨을 바꾸지 않고, 결과에 맞힌 사람을 단다', () => {
    fx.votes = [
      { uid: 'u1', placeId: 'a', name: '민수' },
      { uid: 'u2', placeId: 'b', name: '지영' },
      { uid: 'u3', placeId: 'a', name: '하늘' },
    ];
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    // 난수 0 → 첫 후보 가집. 표가 많아도 균등 추첨 그대로다.
    expect(card()).toBe('가집');
    expect(document.querySelector('dialog[open] .ticket__guess')?.textContent).toBe('🎯 민수·하늘님이 맞혔어요');
  });

  it('게임 중엔 예측을 못 바꾼다', () => {
    startWheel();
    const toggle = screen.getByRole('button', { name: '게임 중엔 못 바꿔요' }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
  });
});

describe('연출 한 판', () => {
  it('돌리면 잠겼다가 연출 길이만큼 지나면 결과 카드가 뜬다', () => {
    startWheel();
    expect(runButton().textContent).toBe('게임 중');
    expect(card()).toBeNull();

    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });

    // 난수 0 → 첫 후보. 끝나면 하단 실행 버튼은 결과 카드의 버튼들로 바뀐다.
    expect(card()).toBe('가집');
    // 모달 안엔 결정·다시 하기, 뒤엔 한 줄 결과(모달이 떠 있는 동안 뒤는 inert 라 둘이 겹쳐 읽히지 않는다).
    const dialog = screen.getByRole('dialog', { name: '오늘의 점심 결과' });
    expect(within(dialog).getByRole('button', { name: '여기로 결정' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: '다시 하기' })).toBeTruthy();
    expect(document.querySelector('.stage .result-bar strong')?.textContent).toBe('가집');
    expect(document.querySelector('.stage__run')).toBeNull();
    expect(lockedButtons()).toEqual([]);
  });
});

describe('크게 보기', () => {
  it('누르면 게임 무대가 화면 전체로 펼쳐지고, 연출은 그대로 돌며, Escape 로 돌아온다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    const toggle = screen.getByRole('button', { name: /크게 보기/ });
    fireEvent.click(toggle);
    const stage = document.querySelector('.stage');
    expect(stage?.classList.contains('stage--full')).toBe(true);
    expect(screen.getByRole('button', { name: /작게 보기/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.stage')?.classList.contains('stage--full')).toBe(false);
  });
});

describe('방식 바꾸기', () => {
  it('결과가 떠 있을 때 다른 방식을 고르면 판이 처음으로 돌아간다', () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');

    fireEvent.click(screen.getByRole('button', { name: '사다리' }));

    expect(card()).toBeNull();
    expect(screen.queryByRole('button', { name: '여기로 결정' })).toBeNull();
    const run = screen.getByRole('button', { name: /사다리 타기 \(\d+곳 중에서\)/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(document.querySelector('.ladder__label--win')).toBeNull();
  });
});

describe('연출 중에 건드리면 잠금이 풀려야 한다 — 영구 고착 회귀', () => {
  it('필터를 바꾸면 연출을 끊고 새 조건으로 돌아온다', () => {
    startWheel();
    // 휴대폰 폭에서는 조건이 요약 한 줄 → 시트 안에 있다.
    fireEvent.click(screen.getByRole('button', { name: /고를 가게 \d+곳.*바꾸기/ }));
    fireEvent.click(screen.getByRole('button', { name: '걸어서 15분까지' }));
    fireEvent.click(screen.getByRole('button', { name: '이대로 할게요' }));
    act(() => { vi.advanceTimersByTime(100); });

    expect(runButton().textContent).toMatch(/돌리기/);
    expect(lockedButtons()).toEqual([]);
    expect(card()).toBeNull();

    // 끊긴 뒤에도 다시 돌릴 수 있다.
    fireEvent.click(runButton());
    expect(runButton().textContent).toBe('게임 중');
  });

  it('실행과 같은 순간 들어온 방식 클릭도 "게임 중" 에 가두지 않는다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    const ladder = screen.getByRole('button', { name: '사다리' });
    // 한 act 안에서 두 번 누르면 방식 단추가 잠기기 전에 두 번째 클릭이 닿는다.
    act(() => {
      runButton().click();
      ladder.click();
    });
    act(() => { vi.advanceTimersByTime(100); });

    const run = screen.getByRole('button', { name: /사다리 타기 \(\d+곳 중에서\)/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(lockedButtons()).toEqual([]);
  });

  it('게임 도중 탭을 옮겨도 판은 계속되고, 돌아오면 결과가 뜬다', () => {
    startWheel();
    fireEvent.click(screen.getByRole('tab', { name: '가게 목록' }));
    expect(screen.getByRole('tab', { name: /점심 고르기.*게임 중/ })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + RESULT_DELAY_MS + 500); });
    // 딴 탭에서는 결과 모달이 보던 화면을 덮지 않는다. 탭 바에만 알린다.
    expect(screen.queryByRole('dialog', { name: '오늘의 점심 결과' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /점심 고르기.*결과/ }));
    act(() => { vi.advanceTimersByTime(RESULT_DELAY_MS + 50); });

    expect((screen.getByRole('dialog', { name: '오늘의 점심 결과' }) as HTMLDialogElement).open).toBe(true);
    expect(screen.getByRole('tab', { name: '점심 고르기' })).toBeTruthy();
    expect(lockedButtons()).toEqual([]);
  });
});

describe('접근성', () => {
  it('탭은 tablist 안의 tab 이고 지금 탭만 selected 다', () => {
    render(<App />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(screen.getByRole('tab', { name: '가게 목록' }));
    expect(screen.getByRole('tab', { name: '가게 목록' }).getAttribute('aria-selected')).toBe('true');
  });

  it('탭 사이는 화살표·Home·End 로 옮기고, 선택된 탭만 Tab 순서에 든다', () => {
    render(<App />);
    const roadmap = screen.getByRole('tab', { name: '점심 고르기' });
    expect(roadmap.tabIndex).toBe(0);
    expect(screen.getByRole('tab', { name: '가게 목록' }).tabIndex).toBe(-1);

    roadmap.focus();
    fireEvent.keyDown(roadmap, { key: 'ArrowRight' });
    const list = screen.getByRole('tab', { name: '가게 목록' });
    expect(list.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(list);

    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: '가게 지도' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' });
    expect(screen.getByRole('tab', { name: '점심 고르기' }).getAttribute('aria-selected')).toBe('true');

    // 지금 탭이 가리키는 패널이 실제로 있고, 패널은 그 탭 이름으로 불린다.
    const panel = screen.getByRole('tabpanel', { name: '점심 고르기' });
    expect(screen.getByRole('tab', { name: '점심 고르기' }).getAttribute('aria-controls')).toBe(panel.id);
  });

  it('키보드로 실행하면 초점이 판을 거쳐 결과 이름으로 간다 — <body> 로 떨어지지 않는다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    const run = runButton();
    run.focus();
    fireEvent.click(run);
    expect(document.activeElement?.classList.contains('stage__board')).toBe(true);

    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(document.activeElement?.tagName).toBe('H2');
    expect(document.activeElement?.textContent).toBe(card());
  });

  it('결과가 나오면 늘 있는 알림 영역에 당첨을 적는다', () => {
    startWheel();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(live?.textContent).toMatch(/가집이 뽑혔어요\. 도보 \d+분이에요/);
  });
});

describe('목록에서 지도로', () => {
  it('목록의 "지도" 는 지도 탭을 그 가게를 고른 채로 연다. 탭 바로 다시 열면 고른 것이 없다', async () => {
    // 지도 탭은 lazy 라 Suspense 가 풀릴 때까지 기다린다. findBy 의 대기는 진짜 타이머가 필요하다.
    vi.useRealTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('tab', { name: '가게 목록' }));
    fireEvent.click(screen.getByRole('button', { name: '나집 지도에서 보기' }));
    expect(screen.getByRole('tab', { name: '가게 지도' }).getAttribute('aria-selected')).toBe('true');
    expect((await screen.findByTestId('map-focus')).textContent).toBe('b');

    fireEvent.click(screen.getByRole('tab', { name: '점심 고르기' }));
    fireEvent.click(screen.getByRole('tab', { name: '가게 지도' }));
    expect((await screen.findByTestId('map-focus')).textContent).toBe('none');
  });
});

describe('결정 저장 실패', () => {
  it('저장이 실패하면 알려 준다 — 스피너만 멈추고 조용하지 않다', async () => {
    vi.mocked(decideToday).mockRejectedValueOnce(new Error('offline'));
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    await act(async () => { fireEvent.click(modalDecide()); });
    expect(screen.getByRole('alert').textContent).toBe('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.');
  });

  it('오프라인이라 서버가 답하지 않으면 8초 뒤 단추를 풀고 대기 중이라고 알린다. 나중에 저장되면 안내를 지운다', async () => {
    // Firestore 의 setDoc 은 오프라인에서 reject 하지 않고 서버가 받을 때까지 기다린다.
    let done: () => void = () => {};
    vi.mocked(decideToday).mockImplementationOnce(() => new Promise<void>((r) => { done = r; }));
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    await act(async () => { fireEvent.click(modalDecide()); });
    const waitingText = '연결이 끊겨 아직 저장 못 했어요. 연결되면 자동으로 저장돼요.';
    expect(screen.queryByText(waitingText)).toBeNull();

    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(screen.getByText(waitingText)).toBeTruthy();
    expect((modalDecide() as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { done(); });
    expect(screen.queryByText(waitingText)).toBeNull();
  });
});

describe('여기로 결정', () => {
  it('화면에 뜬 당첨의 id 로 오늘 기록을 쓴다', async () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');

    await act(async () => { fireEvent.click(modalDecide()); });

    expect(decideToday).toHaveBeenCalledTimes(1);
    expect(decideToday).toHaveBeenCalledWith('20261008', 'a', 'wheel');
  });

  it('같은 순간 두 번 눌러도 기록은 한 번만 쓴다', async () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    const decide = modalDecide();
    await act(async () => {
      decide.click();
      decide.click();
    });
    expect(vi.mocked(decideToday)).toHaveBeenCalledTimes(1);
  });

  it('오늘 이미 다른 곳으로 정해져 있으면 확인 시트를 먼저 열고, 바꾸기를 눌러야 쓴다', async () => {
    fx.decision = { dayId: '20261008', placeId: 'b' };
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');

    await act(async () => { fireEvent.click(modalDecide()); });
    expect(decideToday).not.toHaveBeenCalled();
    expect(screen.getByText('나집에서 가집으로 바꿀까요?')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바꾸기' })); });
    expect(decideToday).toHaveBeenCalledWith('20261008', 'a', 'wheel');
  });
});

describe('한 줄 결과에서 바로 결정', () => {
  it('결과 창을 닫아도 게임 아래 한 줄에서 바로 정하고, 정하면 결정 단추는 사라진다', async () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    fireEvent.click(screen.getByRole('button', { name: '닫고 게임 보기' }));
    const bar = document.querySelector('.result-bar') as HTMLElement;
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: '여기로 결정' })); });
    expect(decideToday).toHaveBeenCalledWith('20261008', 'a', 'wheel');
    // 정하면 결과 창을 다시 열어 알리기 단추를 보여 준다.
    expect((screen.getByRole('dialog', { name: '오늘의 점심 결과' }) as HTMLDialogElement).open).toBe(true);
  });
});

describe('사다리 — 사용자가 고르는 출발점', () => {
  it('번호를 누르면 바로 내려가고, 닿는 순간 가린 칸이 열리며 당첨 칸이 카드와 같다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '사다리' }));
    const hidden = () => [...document.querySelectorAll('.ladder__label')].map((l) => l.textContent);
    expect(hidden().every((t) => t === '?')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '2번 줄에서 출발' }));
    expect(screen.getByRole('button', { name: '게임 중' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(SPIN_MS.ladder / 2); });
    expect(hidden().every((t) => t === '?')).toBe(true);

    act(() => { vi.advanceTimersByTime(SPIN_MS.ladder); });
    expect(hidden().some((t) => t === '?')).toBe(false);
    const win = document.querySelector('.ladder__label--win')?.textContent;
    expect(win).toBe(card());
  });
});

describe('카드 뒤집기 — 사용자가 고르는 카드', () => {
  it('딜러가 섞은 뒤 나머지가 먼저 꽝으로 뒤집히고, 고른 카드가 마지막에 뒤집혀 결과 카드와 같다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '카드' }));
    const cards = screen.getAllByRole('button', { name: /번 카드 고르기$/ });
    expect(cards.length).toBeGreaterThan(1);
    fireEvent.click(cards[1]);

    // 섞는 중: 아무 카드도 안 열렸다.
    expect(document.querySelectorAll('.cards__card--open')).toHaveLength(0);

    // 고른 카드는 다른 카드가 전부 열린 다음에야 열린다.
    let othersFirst = false;
    for (let t = 0; t < CARDS_MAX_MS; t += 100) {
      act(() => { vi.advanceTimersByTime(100); });
      const mine = document.querySelector('.cards__card--mine');
      if (mine?.classList.contains('cards__card--open')) break;
      if (document.querySelectorAll('.cards__card--open').length === cards.length - 1) othersFirst = true;
    }
    expect(othersFirst).toBe(true);

    act(() => { vi.advanceTimersByTime(CARDS_MAX_MS); });
    const mine = document.querySelector('.cards__card--mine');
    expect(mine?.classList.contains('cards__card--win')).toBe(true);
    expect(mine?.getAttribute('aria-label')).toBe(`2번 카드: ${card()}`);
    expect(document.querySelectorAll('.cards__card--open').length).toBe(cards.length);
  });
});

describe('핀볼 — 고른 공 따라가기', () => {
  it('카메라에서 가게를 고르면 그 구슬을 따라가고, 선두로 되돌릴 수 있다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '핀볼' }));
    const camera = screen.getByRole('combobox', { name: /카메라/ }) as HTMLSelectElement;
    expect(camera.value).toBe('');
    fireEvent.change(camera, { target: { value: '1' } });
    expect(screen.getByRole('img', { name: /따라가는 중/ }).getAttribute('aria-label')).toContain('나집');
    fireEvent.change(camera, { target: { value: '' } });
    expect(screen.getByRole('img', { name: '기본 판, 구슬 5개 핀볼' })).toBeTruthy();
  });
});

describe('토너먼트 — 정해진 당첨이 전승한다', () => {
  it('응원을 골라도 결과는 그대로이고, 우승이 결과 카드와 같다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '토너먼트' }));
    const entries = screen.getAllByRole('button', { pressed: false }).filter((b) => b.classList.contains('tour__entry'));
    expect(entries.length).toBeGreaterThan(1);
    fireEvent.click(entries[0]);
    expect(entries[0].getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /^대진 시작/ }));
    // 첫 판 대진이 보이고 아직 승패가 없다.
    expect(document.querySelectorAll('.tour__match').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.tour__side--win')).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(SPIN_MS.tournament + 50); });
    expect(document.querySelector('.tour__champion strong')?.textContent).toBe(card());
    expect(document.querySelector('.tour__hint')?.textContent).toContain('📣 응원한');
  });
});

describe('기기의 "동작 줄이기"', () => {
  const reduceMotion = () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduced-motion'),
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
  };

  afterEach(() => {
    localStorage.clear();
    setForceMotion(false);
  });

  it('켜져 있으면 이유를 알리고, 연출 없이 바로 결과를 낸다', () => {
    reduceMotion();
    render(<App />);
    expect(screen.getByRole('note').textContent).toContain('결과를 바로 보여 드려요');
    // CSS 연출도 끈다.
    expect(document.documentElement.dataset.motion).toBe('reduced');
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(50); });
    expect(card()).toBe('가집');
  });

  it('"연출 켜기" 를 누르면 기기 설정과 상관없이 연출을 재생한다', () => {
    reduceMotion();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '움직임 켜기' }));
    expect(screen.getByRole('note').textContent).toContain('게임 움직임을 켰어요');
    // CSS 연출(바늘 착지·카드 들썩임 등)도 다시 켠다.
    expect(document.documentElement.dataset.motion).toBe('full');
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(50); });
    expect(card()).toBeNull();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');
  });

  it('기기 설정이 꺼져 있으면 안내를 띄우지 않는다', () => {
    render(<App />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});

describe('판 옵션', () => {
  afterEach(() => {
    localStorage.clear();
    setQuickResult(false);
  });

  it('결과 바로 보기를 켜면 연출 없이 바로 결과를 낸다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '결과 바로 보기' }));
    expect(document.documentElement.dataset.motion).toBe('reduced');
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(50); });
    expect(card()).toBe('가집');
  });

  it('오늘 나온 곳 빼기를 켜면 방금 뽑힌 가게는 다음 판 후보에서 빠진다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '오늘 나온 곳 빼기' }));
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    const before = Number(/\((\d+)곳 중에서\)/.exec(runButton().textContent ?? '')?.[1]);
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('가집');
    expect(screen.getByText('오늘 나온 1곳은 빼고 해요')).toBeTruthy();

    // 난수는 늘 0(첫 후보)이다. 가집이 빠졌으니 이번엔 다른 가게가 나와야 한다.
    fireEvent.click(within(screen.getByRole('dialog', { name: '오늘의 점심 결과' })).getByRole('button', { name: '다시 하기' }));
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).not.toBe('가집');
    expect(before).toBeGreaterThan(2);
    expect(screen.getByText('오늘 나온 2곳은 빼고 해요')).toBeTruthy();
  });
});

describe('핀볼 — 공 개수가 곧 확률', () => {
  it('공을 늘린 가게가 그만큼 잘 걸리고, 결과에 확률이 남는다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '핀볼' }));
    // 마집에 공 4개(총 8개). 난수 0.6 → 균등이면 floor(0.6×5)=3 라집, 공 개수로는 4.8/8 → 마집.
    for (let k = 0; k < 3; k += 1) fireEvent.click(screen.getByRole('button', { name: '마집 공 하나 더' }));
    expect(screen.getByText('공 8개')).toBeTruthy();
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    fireEvent.click(screen.getByRole('button', { name: /공 굴리기/ }));
    for (let k = 0; k < 400; k += 1) act(() => { vi.advanceTimersByTime(100); });
    const dialog = screen.getByRole('dialog', { name: '오늘의 점심 결과' });
    expect(dialog.querySelector('.ticket__name')?.textContent).toBe('마집');
    expect(dialog.querySelector('.ticket__odds')?.textContent).toBe('공 8개 중 4개였어요. 당첨 확률은 50%였어요.');
  });

  it('공 개수를 안 건드리면 다른 게임과 같은 균등 추첨이고, 확률 줄을 안 쓴다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '핀볼' }));
    vi.spyOn(Math, 'random').mockReturnValue(0.6);
    fireEvent.click(screen.getByRole('button', { name: /공 굴리기/ }));
    for (let k = 0; k < 400; k += 1) act(() => { vi.advanceTimersByTime(100); });
    const dialog = screen.getByRole('dialog', { name: '오늘의 점심 결과' });
    expect(dialog.querySelector('.ticket__name')?.textContent).toBe('라집');
    expect(dialog.querySelector('.ticket__odds')).toBeNull();
  });
});

describe('핀볼 — 판이 끝난 뒤 공 개수 바꾸기', () => {
  it('지난 판을 내려놓고 바꾼 개수가 바로 보인다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '핀볼' }));
    fireEvent.click(screen.getByRole('button', { name: /공 굴리기/ }));
    for (let k = 0; k < 400; k += 1) act(() => { vi.advanceTimersByTime(100); });
    fireEvent.click(screen.getByRole('button', { name: '닫고 게임 보기' }));
    fireEvent.click(screen.getByRole('button', { name: '가집 공 하나 더' }));
    expect(screen.getByText('공 6개')).toBeTruthy();
    expect(screen.getByRole('img', { name: '기본 판, 구슬 6개 핀볼' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /공 굴리기/ })).toBeTruthy();
  });
});

describe('게임 방식 레일의 Tab 순서', () => {
  // 앞에 오면 DOCUMENT_POSITION_FOLLOWING(4) 이 선다.
  const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  // 메뉴 칩은 메뉴가 두 가지 이상일 때만 나온다.
  const saved = fx.places;
  beforeEach(() => {
    fx.places = saved.map((p, i) => ({ ...p, category: i % 2 ? '면' : '밥' }));
  });
  afterEach(() => {
    fx.places = saved;
  });

  it('데스크톱은 왼쪽 레일이 메뉴 칩보다 먼저다(보이는 순서와 같다)', () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes('min-width: 960px'),
      addEventListener() {},
      removeEventListener() {},
    })) as unknown as typeof window.matchMedia;
    render(<App />);
    expect(before(screen.getByRole('group', { name: '방식' }), screen.getByRole('group', { name: '메뉴 고르기' }))).toBe(true);
  });

  it('휴대폰은 메뉴 칩 아래에 보이므로 DOM 도 칩 뒤다', () => {
    render(<App />);
    expect(before(screen.getByRole('group', { name: '메뉴 고르기' }), screen.getByRole('group', { name: '방식' }))).toBe(true);
  });
});

describe('공정성 — 당첨은 App 의 추첨이 정한다', () => {
  // 공정성 검사(fairness.harness)는 lib 의 pickWinner 를 본다. App 이 그 함수를 안 거치고 식을
  // 바꾸면 검사가 못 잡으므로, 끝 가게까지 실제로 뽑히는지 여기서 App 을 돌려 확인한다.
  it('난수가 1 에 가까우면 마지막 후보가 걸린다(끝 칸이 빠지지 않는다)', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50 + RESULT_DELAY_MS); });
    expect(card()).toBe('마집');
  });
});

describe('결과 모달 예약 — 판을 내려놓으면 같이 끊는다', () => {
  // 연출이 끝나고(한 줄 결과가 생기고) 모달이 뜨기 전 0.25초 사이.
  const untilSpinEnd = () => {
    for (let k = 0; k < 800 && !document.querySelector('.result-bar'); k += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(document.querySelector('.result-bar')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '오늘의 점심 결과' })).toBeNull();
  };
  const noResultBadge = () => {
    act(() => { vi.advanceTimersByTime(RESULT_DELAY_MS + 50); });
    fireEvent.click(screen.getByRole('tab', { name: '가게 목록' }));
    expect(screen.getByRole('tab', { name: /점심 고르기/ }).textContent).not.toMatch(/결과/);
  };

  it('조건을 바꾸면 모달이 늦게 뜨지 않고 탭 바에 "결과" 도 안 붙는다', () => {
    startWheel();
    untilSpinEnd();
    fireEvent.click(screen.getByRole('button', { name: /고를 가게 \d+곳.*바꾸기/ }));
    fireEvent.click(screen.getByRole('button', { name: '걸어서 15분까지' }));
    noResultBadge();
  });

  it('핀볼 공 개수를 바꿔도 같다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '핀볼' }));
    fireEvent.click(screen.getByRole('button', { name: /공 굴리기/ }));
    untilSpinEnd();
    fireEvent.click(screen.getByRole('button', { name: '가집 공 하나 더' }));
    noResultBadge();
  });
});
