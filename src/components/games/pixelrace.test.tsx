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
  ['경마', HorseRace, '.rc__runner', '.rc__pos--win'],
  ['레이싱', CarRace, '.rc__runner', '.rc__pos--win'],
] as const)('%s', (_, Race, runner, winName) => {
  it('카운트다운 뒤 달려서 당첨이 1등으로 들어온다', () => {
    for (const [n, winner] of [[1, 0], [5, 3], [12, 0], [20, 19]]) {
      const onSpinEnd = vi.fn();
      const props = { candidates: places(n), winnerIndex: winner, run: n + winner, onSpinEnd };
      const r = render(<Race {...props} spinning />);
      expect(r.container.querySelectorAll(runner)).toHaveLength(n);
      run(500);
      expect(r.container.querySelector('.prace__count')).toBeTruthy();
      run(15_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.rerender(<Race {...props} spinning={false} />);
      const win = r.container.querySelectorAll(winName);
      expect(win).toHaveLength(1);
      expect(win[0].textContent).toContain(`가게${winner + 1}`);
      expect(r.container.querySelector('.prace__line')?.textContent).toContain('1등으로 들어왔어요');
      r.unmount();
    }
  }, 30_000);

  it('움직임 줄이기면 바로 끝낸다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), winnerIndex: 2, run: 3, onSpinEnd };
    const r = render(<Race {...props} spinning />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    r.rerender(<Race {...props} spinning={false} />);
    expect(r.container.querySelector(winName)?.textContent).toContain('가게3');
  });
});

describe('레이싱 연출', () => {
  it('세 바퀴 동안 부스터·펑크·전복·받힘이 화면에 나온다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 8 && seen.size < 4; k += 1) {
      const r = render(<CarRace candidates={places(10)} winnerIndex={k} spinning run={40 + k} onSpinEnd={() => {}} />);
      for (let t = 0; t < 15_000; t += 100) {
        act(() => { vi.advanceTimersByTime(100); });
        for (const kind of ['boost', 'wobble', 'crash', 'bump']) if (r.container.querySelector(`.rc__runner--${kind}`)) seen.add(kind);
      }
      r.unmount();
    }
    expect([...seen].sort()).toEqual(['boost', 'bump', 'crash', 'wobble']);
  }, 30_000);
});

describe('따라가기', () => {
  it('순위표 이름을 누르면 그 주자를 당겨 따라가고, 다시 누르면 풀린다', () => {
    const r = render(<CarRace candidates={places(5)} winnerIndex={1} spinning={false} run={1} onSpinEnd={() => {}} />);
    const pick = [...r.container.querySelectorAll<HTMLButtonElement>('.rc__pos')].find((b) => b.textContent?.includes('가게4'))!;
    act(() => pick.click());
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    expect(r.container.querySelector('.rc__plane--follow')).toBeTruthy();
    expect(r.container.querySelector('.rc__tag')?.textContent).toContain('가게4');
    expect(r.container.querySelectorAll('.rc__runner--dim')).toHaveLength(4);
    act(() => pick.click());
    expect(r.container.querySelector('.rc__plane--follow')).toBeNull();
  });
});

describe('경마 연출', () => {
  it('질주·넘어짐·멈칫·부딪힘이 말풍선과 함께 나온다', () => {
    const seen = new Set<string>();
    let bubbles = 0;
    for (let k = 0; k < 8 && seen.size < 4; k += 1) {
      const r = render(<HorseRace candidates={places(10)} winnerIndex={k} spinning run={70 + k} onSpinEnd={() => {}} />);
      for (let t = 0; t < 11_000; t += 100) {
        act(() => { vi.advanceTimersByTime(100); });
        for (const kind of ['boost', 'wobble', 'crash', 'bump']) if (r.container.querySelector(`.rc__runner--${kind}`)) seen.add(kind);
        bubbles += r.container.querySelectorAll('.rc__bubble').length;
      }
      r.unmount();
    }
    expect([...seen].sort()).toEqual(['boost', 'bump', 'crash', 'wobble']);
    expect(bubbles).toBeGreaterThan(0);
  }, 30_000);
});

