// @vitest-environment jsdom
/**
 * 픽셀 경마 · 레이싱. 당첨은 App 이 정했고, 경주는 당첨이 1등으로 들어오게 만든다.
 * 끝나면 onSpinEnd 를 한 번 부른다. 움직임 줄이기면 바로 결과를 보여 준다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { CarRace, HorseRace } from './PixelRace';

let reduced = false;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? reduced : false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

const run = (ms: number) => {
  for (let t = 0; t < ms; t += 200) act(() => { vi.advanceTimersByTime(200); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

describe.each([
  ['경마', HorseRace],
  ['레이싱', CarRace],
] as const)('%s', (_, Race) => {
  it('카운트다운 뒤 달려서 당첨이 1등으로 들어온다', () => {
    for (const [n, winner] of [[1, 0], [5, 3], [12, 0], [20, 19]]) {
      const onSpinEnd = vi.fn();
      const props = { candidates: places(n), winnerIndex: winner, run: n + winner, onSpinEnd };
      const r = render(<Race {...props} spinning />);
      expect(r.container.querySelectorAll('.prace__lane')).toHaveLength(n);
      run(500);
      expect(r.container.querySelector('.prace__count')).toBeTruthy();
      run(9_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.rerender(<Race {...props} spinning={false} />);
      const win = r.container.querySelectorAll('.prace__lane--win');
      expect(win).toHaveLength(1);
      expect(win[0].querySelector('.prace__name')?.textContent).toBe(`가게${winner + 1}`);
      expect(win[0].querySelector('.prace__rank')?.textContent).toBe('1등');
      expect(r.container.querySelector('.prace__line')?.textContent).toContain('1등으로 들어왔어요');
      r.unmount();
    }
  }, 20_000);

  it('움직임 줄이기면 바로 끝낸다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), winnerIndex: 2, run: 3, onSpinEnd };
    const r = render(<Race {...props} spinning />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    r.rerender(<Race {...props} spinning={false} />);
    expect(r.container.querySelector('.prace__lane--win .prace__name')?.textContent).toBe('가게3');
  });
});
