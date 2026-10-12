// @vitest-environment jsdom
/**
 * 짝 맞추기 화면. 직접 두든 자동으로 두든 끝까지 남는 짝은 App 이 정한 당첨이다.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Memory } from './Memory';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
});

/** 타이머가 상태를 바꾸고 그 다음 타이머를 거는 사슬이라, 조금씩 나눠 흘린다. */
const run = (ms: number) => {
  for (let t = 0; t < ms; t += 100) act(() => { vi.advanceTimersByTime(100); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: '한식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

describe('짝 맞추기', () => {
  it('실행 단추로 시작하면 알아서 두고, 남은 짝은 당첨이다', () => {
    for (const winner of [0, 3, 7]) {
      const onSpinEnd = vi.fn();
      const r = render(<Memory candidates={places(10)} winnerIndex={winner} spinning run={100 + winner} onSpinEnd={onSpinEnd} />);
      run(60_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const wins = r.container.querySelectorAll('.memory__card--win');
      expect(wins).toHaveLength(2);
      wins.forEach((w) => expect(w.getAttribute('aria-label')).toContain(`가게${winner + 1}, 남은 짝`));
      r.unmount();
    }
  });

  it('카드를 눌러 시작하면 그 카드부터 열리고, 직접 두는 동안 활동 신호를 보낸다', () => {
    const onRequestSpin = vi.fn();
    const onActivity = vi.fn();
    const props = { candidates: places(4), onSpinEnd: () => {}, onRequestSpin, onActivity };
    const r = render(<Memory {...props} winnerIndex={null} spinning={false} run={0} />);
    expect(screen.getAllByRole('button', { name: /번 카드 뒤집기$/ })).toHaveLength(8);
    fireEvent.click(screen.getByRole('button', { name: '3번 카드 뒤집기' }));
    expect(onRequestSpin).toHaveBeenCalledTimes(1);
    r.rerender(<Memory {...props} winnerIndex={1} spinning run={7} />);
    expect(r.container.querySelectorAll('.memory__card--open')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^3번 카드: 가게/ })).toBeTruthy();
    expect(onActivity).toHaveBeenCalled();
    // 직접 두는 판은 저절로 넘어가지 않는다.
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(r.container.querySelectorAll('.memory__card--open')).toHaveLength(1);
    // 넘기면 끝까지 간다.
    fireEvent.click(screen.getByRole('button', { name: '나머지 자동으로' }));
    run(60_000);
    expect(r.container.querySelectorAll('.memory__card--win')).toHaveLength(2);
  });
});
