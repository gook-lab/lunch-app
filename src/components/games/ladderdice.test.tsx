// @vitest-environment jsdom
/**
 * 사다리 · 주사위 연출 — 주자·가짜 길·커튼, 컵·모서리·부딪힘이 들어가도 App 이 정한 당첨이 그대로
 * 드러나고, onSpinEnd 는 한 번만 불린다. 움직임 줄이기·한 곳뿐이면 바로 끝 장면.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Dice } from './Dice';
import { Ladder } from './Ladder';
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

const advance = (ms: number) => {
  for (let t = 0; t < ms; t += 250) act(() => { vi.advanceTimersByTime(250); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

describe('사다리 — 주자들이 내려가도 당첨은 App 이 정한 곳', () => {
  it('후보 2~20곳, 판 번호 여럿: 끝나면 내 주자 칸에 당첨이 열리고 onSpinEnd 는 한 번', () => {
    for (const n of [2, 3, 7, 12, 15, 20]) {
      for (const run of [1, 23]) {
        const winner = (run * 5 + n) % n;
        const onSpinEnd = vi.fn();
        const r = render(<Ladder candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
        advance(SPIN_MS.ladder / 2);
        // 달리는 동안 바닥은 가려져 있다.
        expect(r.container.querySelector('.ladder__label--open')).toBeNull();
        expect(onSpinEnd).not.toHaveBeenCalled();
        advance(SPIN_MS.ladder / 2 + 200);
        expect(onSpinEnd).toHaveBeenCalledTimes(1);
        expect(r.container.querySelector('.ladder__label--win')?.getAttribute('title')).toBe(`가게${winner + 1}`);
        expect(r.container.querySelector('.ladder__status')?.textContent).toContain(`가게${winner + 1}`);
        advance(1000);
        expect(onSpinEnd).toHaveBeenCalledTimes(1);
        r.unmount();
      }
    }
  }, 30_000);

  it('연출 중에 사라지면 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Ladder candidates={places(6)} winnerIndex={2} spinning run={3} onSpinEnd={onSpinEnd} />);
    advance(1000);
    r.unmount();
    advance(SPIN_MS.ladder);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('움직임 줄이기 · 한 곳뿐이면 바로 열린다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Ladder candidates={places(5)} winnerIndex={3} spinning run={2} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.ladder__label--win')?.getAttribute('title')).toBe('가게4');
    r.unmount();

    reduced = false;
    const one = vi.fn();
    const s = render(<Ladder candidates={places(1)} winnerIndex={0} spinning run={2} onSpinEnd={one} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(one).toHaveBeenCalledTimes(1);
    expect(s.container.querySelector('.ladder__label--win')?.textContent).toBe('가게1');
  });
});

describe('주사위 — 모서리·부딪힘이 있어도 말은 당첨 칸에 선다', () => {
  it('후보 2~20곳, 판 번호 여럿: 이어서 굴려도 매번 당첨 칸에 도착하고 onSpinEnd 는 판마다 한 번', () => {
    for (const n of [2, 3, 7, 12, 15, 20]) {
      const onSpinEnd = vi.fn();
      const props = { candidates: places(n), onSpinEnd };
      const r = render(<Dice {...props} winnerIndex={null} spinning={false} run={0} />);
      for (const run of [1, 2, 3]) {
        const winner = (run * 7 + n) % n;
        r.rerender(<Dice {...props} winnerIndex={winner} spinning run={run} />);
        advance(7300);
        expect(onSpinEnd).toHaveBeenCalledTimes(run);
        const win = r.container.querySelector('.dice__cell--win');
        expect(win?.getAttribute('title')).toBe(`가게${winner + 1}`);
        expect(win?.classList.contains('dice__cell--here')).toBe(true);
        expect(r.container.querySelector('.dice__status')?.textContent).toBe(`가게${winner + 1} 칸에 도착했어요`);
        r.rerender(<Dice {...props} winnerIndex={winner} spinning={false} run={run} />);
      }
      r.unmount();
    }
  }, 30_000);

  it('펠트는 판이 도는 동안만 깔리고, 말이 출발하면 걷힌다', () => {
    const r = render(<Dice candidates={places(8)} winnerIndex={5} spinning run={4} onSpinEnd={() => {}} />);
    expect(r.container.querySelector('.dice__felt')).not.toBeNull();
    expect(r.container.querySelector('.dice__cup')).not.toBeNull();
    advance(7300);
    expect(r.container.querySelector('.dice__felt')).toBeNull();
    expect(r.container.querySelectorAll('.dice__tray .dice__mini').length).toBeGreaterThanOrEqual(2);
  });

  it('연출 중에 사라지면 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Dice candidates={places(9)} winnerIndex={2} spinning run={3} onSpinEnd={onSpinEnd} />);
    advance(1500);
    r.unmount();
    advance(8000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });
});
