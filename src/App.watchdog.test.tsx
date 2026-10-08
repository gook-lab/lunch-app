// @vitest-environment jsdom
/**
 * 연출 잠금의 마지막 방어선.
 *
 * 게임 컴포넌트가 onSpinEnd 를 영영 안 부르면 spinning 이 true 로 박혀
 * 버튼이 전부 잠긴다. 돌림판을 아무것도 안 하는 가짜로 바꿔 그 상황을
 * 만들고, 상한(20초)이 지나면 잠금만 풀리고 결과는 안 생기는지 본다.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';

const fx = vi.hoisted(() => ({
  places: ['a', 'b', 'c'].map((id) => ({
    id, name: `${id}집`, category: '한식', lat: 37.5, lng: 126.9, walkMin: 5,
    kakaoPlaceId: `k-${id}`, active: true, createdBy: 'u',
  })),
}));

vi.mock('./hooks/useTodayKST', () => ({ useTodayKST: () => '20261008' }));
vi.mock('./hooks/useLunchData', () => ({
  useLunchData: () => ({ state: 'ready', error: null, places: fx.places, visits: [], today: null, refreshing: false, reload: () => {} }),
}));
vi.mock('./services/lunch', () => ({ decideToday: vi.fn(async () => {}) }));
vi.mock('./components/MapTab', () => ({ default: () => null }));
// 끝을 알리지 않는 돌림판.
vi.mock('./components/games/Wheel', () => ({ Wheel: () => <div data-testid="wheel-stub" /> }));

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  Element.prototype.scrollIntoView = () => {};
  HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => ({}) })) as never;
  vi.spyOn(Math, 'random').mockReturnValue(0);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

it('onSpinEnd 가 영영 안 와도 20초 뒤에는 잠금이 풀리고 결과는 생기지 않는다', () => {
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '돌림판' }));
  const run = () => screen.getByRole('button', { name: /돌리기 \(후보 \d+곳\)|진행 중/ });
  fireEvent.click(run());
  expect(run().textContent).toBe('진행 중');

  act(() => { vi.advanceTimersByTime(19_000); });
  expect(run().textContent).toBe('진행 중');           // 아직은 기다린다

  act(() => { vi.advanceTimersByTime(1_500); });
  expect(run().textContent).toMatch(/돌리기/);          // 풀렸다
  expect(document.querySelector('.card--result')).toBeNull(); // 안 본 경기를 당첨으로 만들지 않는다
  expect([...document.querySelectorAll('button')].filter((b) => b.disabled)).toHaveLength(0);
});
