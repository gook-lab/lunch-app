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
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { decideToday } from './services/lunch';
import { SPIN_MS, setForceMotion } from './components/games/types';

const fx = vi.hoisted(() => {
  const place = (id: string, name: string) => ({
    id, name, category: '한식', lat: 37.5, lng: 126.9, walkMin: 5,
    kakaoPlaceId: `k-${id}`, active: true, createdBy: 'u',
  });
  return {
    places: [place('a', '가집'), place('b', '나집'), place('c', '다집'), place('d', '라집'), place('e', '마집')],
    decision: null as null | { dayId: string; placeId: string },
  };
});

vi.mock('./hooks/useTodayKST', () => ({ useTodayKST: () => '20261008' }));
vi.mock('./hooks/useLunchData', () => ({
  useLunchData: () => ({
    state: 'ready', error: null, places: fx.places, visits: [],
    today: fx.decision, refreshing: false, reload: () => {},
  }),
}));
vi.mock('./services/lunch', () => ({ decideToday: vi.fn(async () => {}) }));
vi.mock('./components/MapTab', () => ({ default: () => null }));

const runButton = () => screen.getByRole('button', { name: /돌리기 \(후보 \d+곳\)|진행 중/ });
const card = () => document.querySelector('.card--result h2')?.textContent?.trim() ?? null;
const lockedButtons = () =>
  [...document.querySelectorAll('button')].filter((b) => b.disabled).map((b) => b.textContent?.trim());

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom 에 없는 것들. 게임은 rAF 로 진행도를 그리고 setTimeout 으로 끝낸다.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  Element.prototype.scrollIntoView = () => {};
  HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => ({}) })) as never;
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

describe('연출 한 판', () => {
  it('돌리면 잠겼다가 연출 길이만큼 지나면 결과 카드가 뜬다', () => {
    startWheel();
    expect(runButton().textContent).toBe('진행 중');
    expect(card()).toBeNull();

    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });

    // 난수 0 → 첫 후보. 끝나면 하단 실행 버튼은 결과 카드의 버튼들로 바뀐다.
    expect(card()).toBe('가집');
    expect(screen.getByRole('button', { name: '여기로 결정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '다시 하기' })).toBeTruthy();
    expect(lockedButtons()).toEqual([]);
  });
});

describe('방식 바꾸기', () => {
  it('결과가 떠 있을 때 다른 방식을 고르면 판이 처음으로 돌아간다', () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    expect(card()).toBe('가집');

    fireEvent.click(screen.getByRole('button', { name: '사다리' }));

    expect(card()).toBeNull();
    expect(screen.queryByRole('button', { name: '여기로 결정' })).toBeNull();
    const run = screen.getByRole('button', { name: /사다리 타기 \(후보 \d+곳\)/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(document.querySelector('.ladder__label--win')).toBeNull();
  });
});

describe('연출 중에 건드리면 잠금이 풀려야 한다 — 영구 고착 회귀', () => {
  it('필터를 바꾸면 연출을 끊고 새 조건으로 돌아온다', () => {
    startWheel();
    fireEvent.click(screen.getByRole('button', { name: '15분' }));
    act(() => { vi.advanceTimersByTime(100); });

    expect(runButton().textContent).toMatch(/돌리기/);
    expect(lockedButtons()).toEqual([]);
    expect(card()).toBeNull();

    // 끊긴 뒤에도 다시 돌릴 수 있다.
    fireEvent.click(runButton());
    expect(runButton().textContent).toBe('진행 중');
  });

  it('실행과 같은 순간 들어온 방식 클릭도 "진행 중" 에 가두지 않는다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    const ladder = screen.getByRole('button', { name: '사다리' });
    // 한 act 안에서 두 번 누르면 방식 단추가 잠기기 전에 두 번째 클릭이 닿는다.
    act(() => {
      runButton().click();
      ladder.click();
    });
    act(() => { vi.advanceTimersByTime(100); });

    const run = screen.getByRole('button', { name: /사다리 타기 \(후보 \d+곳\)/ }) as HTMLButtonElement;
    expect(run.disabled).toBe(false);
    expect(lockedButtons()).toEqual([]);
  });

  it('탭을 옮겼다 돌아와도 "진행 중" 에 갇히지 않는다', () => {
    startWheel();
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 500); });
    fireEvent.click(screen.getByRole('tab', { name: '로드맵' }));
    act(() => { vi.advanceTimersByTime(100); });

    expect(runButton().textContent).toMatch(/돌리기/);
    expect(lockedButtons()).toEqual([]);
  });
});

describe('접근성', () => {
  it('탭은 tablist 안의 tab 이고 지금 탭만 selected 다', () => {
    render(<App />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(screen.getByRole('tab', { name: '목록' }));
    expect(screen.getByRole('tab', { name: '목록' }).getAttribute('aria-selected')).toBe('true');
  });

  it('결과가 나오면 늘 있는 알림 영역에 당첨을 적는다', () => {
    startWheel();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('');
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    expect(live?.textContent).toMatch(/가집, 도보 \d+분이 뽑혔어요/);
  });
});

describe('여기로 결정', () => {
  it('화면에 뜬 당첨의 id 로 오늘 기록을 쓴다', async () => {
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    expect(card()).toBe('가집');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '여기로 결정' })); });

    expect(decideToday).toHaveBeenCalledTimes(1);
    expect(decideToday).toHaveBeenCalledWith('20261008', 'a');
  });

  it('오늘 이미 다른 곳으로 정해져 있으면 확인 시트를 먼저 열고, 바꾸기를 눌러야 쓴다', async () => {
    fx.decision = { dayId: '20261008', placeId: 'b' };
    startWheel();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    expect(card()).toBe('가집');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '여기로 결정' })); });
    expect(decideToday).not.toHaveBeenCalled();
    expect(screen.getByText('나집에서 가집으로 바꿀까요?')).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '바꾸기' })); });
    expect(decideToday).toHaveBeenCalledWith('20261008', 'a');
  });
});

describe('사다리 — 사용자가 고르는 출발점', () => {
  it('번호를 누르면 바로 내려가고, 닿는 순간 가린 칸이 열리며 당첨 칸이 카드와 같다', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '사다리' }));
    const hidden = () => [...document.querySelectorAll('.ladder__label')].map((l) => l.textContent);
    expect(hidden().every((t) => t === '?')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '2번 줄에서 출발' }));
    expect(screen.getByRole('button', { name: '진행 중' })).toBeTruthy();
    act(() => { vi.advanceTimersByTime(SPIN_MS.ladder / 2); });
    expect(hidden().every((t) => t === '?')).toBe(true);

    act(() => { vi.advanceTimersByTime(SPIN_MS.ladder); });
    expect(hidden().some((t) => t === '?')).toBe(false);
    const win = document.querySelector('.ladder__label--win')?.textContent;
    expect(win).toBe(card());
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
    expect(screen.getByRole('note').textContent).toContain('연출 없이 결과만');
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(50); });
    expect(card()).toBe('가집');
  });

  it('"연출 켜기" 를 누르면 기기 설정과 상관없이 연출을 재생한다', () => {
    reduceMotion();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '연출 켜기' }));
    expect(screen.getByRole('note').textContent).toContain('연출을 보여 드려요');
    fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
    fireEvent.click(runButton());
    act(() => { vi.advanceTimersByTime(50); });
    expect(card()).toBeNull();
    act(() => { vi.advanceTimersByTime(SPIN_MS.wheel + 50); });
    expect(card()).toBe('가집');
  });

  it('기기 설정이 꺼져 있으면 안내를 띄우지 않는다', () => {
    render(<App />);
    expect(screen.queryByRole('note')).toBeNull();
  });
});
