// @vitest-environment jsdom
/**
 * 뽑기 기계 · 플링코 · 주사위. 셋 다 App 이 정한 당첨을 보여 주기만 하고, 끝나면
 * onSpinEnd 를 한 번 부른다. 움직임 줄이기면 바로 결과를 보여 준다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Dice } from './Dice';
import { Gacha, MAX_CAPSULES } from './Gacha';
import { Plinko } from './Plinko';

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
  for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(50); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

describe('뽑기 기계', () => {
  it('흔들고 떨어뜨린 뒤 당첨 캡슐을 연다', () => {
    for (const n of [1, 5, 20]) {
      const winner = n - 1;
      const onSpinEnd = vi.fn();
      const r = render(<Gacha candidates={places(n)} winnerIndex={winner} spinning run={n} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelector('.gacha--shake')).toBeTruthy();
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES));
      run(4_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(r.container.querySelector('.gacha__prize')?.textContent).toContain(`가게${n}`);
      // 나온 캡슐만큼 돔이 하나 줄었다.
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES) - 1);
      r.unmount();
    }
  });

  it('20곳이 넘으면 나머지 수를 적는다', () => {
    const r = render(<Gacha candidates={places(26)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelector('.gacha__more')?.textContent).toBe('캡슐이 6개 더 있어요');
  });

  it('움직임 줄이기면 바로 연다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Gacha candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.gacha__prize')?.textContent).toContain('가게3');
  });
});

describe('플링코', () => {
  it('공은 당첨 칸에 들어간다', () => {
    for (const [n, winner] of [[1, 0], [5, 0], [5, 4], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const r = render(<Plinko candidates={places(n)} winnerIndex={winner} spinning run={n + winner} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.plinko__slot')).toHaveLength(n);
      expect(r.container.querySelectorAll('.plinko__pin')).toHaveLength((n * (n - 1)) / 2);
      run(5_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const wins = r.container.querySelectorAll('.plinko__slot--win');
      expect(wins).toHaveLength(1);
      expect(wins[0].getAttribute('title')).toBe(`가게${winner + 1}`);
      r.unmount();
    }
  });

  it('움직임 줄이기면 바로 칸을 보여 준다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Plinko candidates={places(5)} winnerIndex={3} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.plinko__slot--win')?.getAttribute('title')).toBe('가게4');
  });
});

describe('주사위', () => {
  it('말은 당첨 칸에 서고, 다음 판은 그 자리에서 출발한다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(10), onSpinEnd };
    const r = render(<Dice {...props} winnerIndex={7} spinning run={1} />);
    run(15_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    const here = r.container.querySelector('.dice__cell--here');
    expect(here?.getAttribute('title')).toBe('가게8');
    expect(here?.classList.contains('dice__cell--win')).toBe(true);
    r.rerender(<Dice {...props} winnerIndex={7} spinning={false} run={1} />);
    // 같은 칸이 당첨이면 한 바퀴를 돈다 — 첫 굴림 동안 말은 아직 출발점(8번)에 있다.
    r.rerender(<Dice {...props} winnerIndex={7} spinning run={2} />);
    expect(r.container.querySelector('.dice__cell--here')?.getAttribute('title')).toBe('가게8');
    run(15_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(r.container.querySelector('.dice__cell--win')?.getAttribute('title')).toBe('가게8');
  });

  it('후보 1·5·20곳 모두 끝나고, 상태 줄이 굴림을 센다', () => {
    for (const n of [1, 5, 20, 40]) {
      const onSpinEnd = vi.fn();
      const r = render(<Dice candidates={places(n)} winnerIndex={n - 1} spinning run={n} onSpinEnd={onSpinEnd} />);
      run(100);
      expect(r.container.querySelector('.dice__status')?.textContent).toMatch(/^1번째 (굴림|주사위)/);
      run(15_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(r.container.querySelector('.dice__status')?.textContent).toBe(`가게${n} 칸에 도착했어요`);
      r.unmount();
    }
  });

  it('움직임 줄이기면 바로 도착한다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Dice candidates={places(6)} winnerIndex={4} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.dice__cell--win')?.getAttribute('title')).toBe('가게5');
  });
});
