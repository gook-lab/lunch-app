// @vitest-environment jsdom
/**
 * 토너먼트 화면 — App 이 정한 우승이 트로피를 든다. VS 컷신·역전 연출은 승패를 바꾸지 않고,
 * onSpinEnd 는 한 번만, 언마운트·spinning 꺼짐이면 멈추고, 움직임 줄이기면 바로 트로피 장면이다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Tournament } from './Tournament';
import { SPIN_MS } from './types';

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

const tick = (ms: number, each?: (c: HTMLElement) => void, c?: HTMLElement) => {
  for (let t = 0; t < ms; t += 50) {
    act(() => { vi.advanceTimersByTime(50); });
    if (each && c) each(c);
  }
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

describe('토너먼트 화면', () => {
  it('2~20곳: 컷신을 지나 정해진 우승이 트로피를 들고, onSpinEnd 는 한 번', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [3, 2], [5, 4], [8, 3], [12, 0], [15, 14], [20, 7]]) {
      const onSpinEnd = vi.fn();
      const r = render(<Tournament candidates={places(n)} winnerIndex={winner} spinning run={n * 17 + winner} onSpinEnd={onSpinEnd} />);
      // 처음엔 대진만 있고 승패가 없다.
      expect(r.container.querySelectorAll('.tour__match').length).toBeGreaterThan(0);
      expect(r.container.querySelectorAll('.tour__side--win')).toHaveLength(0);
      let sawCut = false;
      tick(SPIN_MS.tournament - 100, (c) => { if (c.querySelector('.tour__cut')) sawCut = true; }, r.container);
      expect(sawCut).toBe(true);
      tick(200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(r.container.querySelector('.tour__champion strong')?.textContent).toBe(`가게${winner + 1}`);
      tick(3000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('결승 컷신의 승! 도장은 언제나 정해진 우승 쪽 카드에 찍힌다', () => {
    for (let run = 1; run <= 12; run += 1) {
      const r = render(<Tournament candidates={places(6)} winnerIndex={4} spinning run={run} onSpinEnd={() => {}} />);
      let stamped: string | null = null;
      tick(SPIN_MS.tournament, (c) => {
        const label = c.querySelector('.tour__cut--final .tour__card--win .tour__card-name')?.textContent;
        if (label) stamped = label;
      }, r.container);
      expect(stamped).toBe('가게5');
      r.unmount();
    }
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Tournament candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1000);
    r.unmount();
    tick(8000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 멈추고, 다음 판은 첫 판 대진부터 다시', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), onSpinEnd };
    const r = render(<Tournament {...props} winnerIndex={3} spinning run={5} />);
    tick(1000);
    r.rerender(<Tournament {...props} winnerIndex={3} spinning={false} run={5} />);
    tick(8000);
    expect(onSpinEnd).not.toHaveBeenCalled();
    r.rerender(<Tournament {...props} winnerIndex={6} spinning run={6} />);
    expect(r.container.querySelector('.tour__champion')).toBeNull();
    expect(r.container.querySelectorAll('.tour__side--win')).toHaveLength(0);
    tick(SPIN_MS.tournament + 100);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.tour__champion strong')?.textContent).toBe('가게7');
  });

  it('움직임 줄이기면 바로 트로피 장면', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Tournament candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.tour__champion strong')?.textContent).toBe('가게6');
    expect(r.container.querySelector('.tour__cut')).toBeNull();
  });

  it('한 곳뿐이면 바로 끝난다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Tournament candidates={places(1)} winnerIndex={0} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.tour__champion strong')?.textContent).toBe('가게1');
  });
});
