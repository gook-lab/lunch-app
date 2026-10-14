// @vitest-environment jsdom
/**
 * 연출 잠금의 마지막 방어선.
 *
 * 게임 컴포넌트가 onSpinEnd 를 영영 안 부르면 spinning 이 true 로 박혀
 * 버튼이 전부 잠긴다. 돌림판을 아무것도 안 하는 가짜로 바꿔 그 상황을
 * 만들고, 상한(20초)이 지나면 잠금만 풀리고 결과는 안 생기는지 본다.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { preloadGames } from './components/games';

const fx = vi.hoisted(() => ({
  places: ['a', 'b', 'c'].map((id) => ({
    id, name: `${id}집`, category: '한식', lat: 37.5, lng: 126.9, walkMin: 5,
    kakaoPlaceId: `k-${id}`, active: true, createdBy: 'u',
  })),
  votes: [] as { uid: string; placeId: string; name: string }[],
}));

vi.mock('./hooks/useTodayKST', () => ({ useTodayKST: () => '20261008' }));
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
  useLunchData: () => ({ state: 'ready', error: null, places: fx.places, visits: [], today: null, refreshing: false, reload: () => {} }),
}));
vi.mock('./services/ratings', () => ({
  subscribeRatings: () => () => {},
  ratingUid: async () => 'me',
  rate: vi.fn(async () => {}),
  unrate: vi.fn(async () => {}),
}));
vi.mock('./services/lunch', () => ({ decideToday: vi.fn(async () => {}) }));
vi.mock('./components/MapTab', () => ({ default: () => null }));
// 끝을 알리지 않는 돌림판.
vi.mock('./components/games/Wheel', () => ({ Wheel: () => <div data-testid="wheel-stub" /> }));

// 게임은 나눠 받는다(games/lazy.tsx). 테스트는 시작 전에 다 받아 두어 바로 그려지게 한다.
beforeAll(() => preloadGames());

beforeEach(() => {
  vi.useFakeTimers();
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
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('onSpinEnd 가 영영 안 와도 20초 뒤에는 잠금이 풀리고 결과는 생기지 않는다', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
  const run = () => screen.getByRole('button', { name: /돌리기 \(\d+곳 중에서\)|^게임 중$/ });
  fireEvent.click(run());
  expect(run().textContent).toBe('게임 중');

  act(() => { vi.advanceTimersByTime(29_000); });
  expect(run().textContent).toBe('게임 중');           // 아직은 기다린다

  act(() => { vi.advanceTimersByTime(1_500); });
  expect(run().textContent).toMatch(/돌리기/);          // 풀렸다
  expect(document.querySelector('.card--result')).toBeNull(); // 안 본 경기를 당첨으로 만들지 않는다
  expect([...document.querySelectorAll('button')].filter((b) => b.disabled)).toHaveLength(0);
});
