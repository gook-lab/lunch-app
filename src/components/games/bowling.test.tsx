// @vitest-environment jsdom
/**
 * 볼링 — App 이 정한 당첨 핀만 끝까지 서 있고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 사건(거터·스플릿·와르르·휘청·킥백)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { bowlingPlan } from '../../lib/bowling';
import { seededRandom } from '../../lib/random';
import { Bowling } from './Bowling';

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

const tick = (ms: number) => {
  for (let t = 0; t < ms; t += 50)
    act(() => {
      vi.advanceTimersByTime(50);
    });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `가게${i + 1}`,
    category: '한식',
    lat: 0,
    lng: 0,
    walkMin: 5,
    kakaoPlaceId: `k${i}`,
    active: true,
    createdBy: 'test',
  }));

const status = (c: HTMLElement) => c.querySelector('.bowling__status')?.textContent ?? '';
const standing = (c: HTMLElement) =>
  [...c.querySelectorAll('.bowling__pin:not(.bowling__pin--down)')].map((e) => e.getAttribute('title'));
const winPins = (c: HTMLElement) => [...c.querySelectorAll('.bowling__pin--win')].map((e) => e.getAttribute('title'));

describe('볼링', () => {
  it('공을 굴려 당첨 핀만 남기고, 끝나면 onSpinEnd 를 한 번 부른다', () => {
    for (const [n, winner] of [
      [2, 0],
      [2, 1],
      [5, 2],
      [10, 9],
      [15, 0],
      [20, 13],
    ]) {
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(
        <Bowling candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />,
      );
      expect(r.container.querySelectorAll('.bowling__pin')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      expect(status(r.container)).toBe('1번째 공을 준비해요');

      const plan = bowlingPlan(n, winner, seededRandom(run))!;
      const seen = new Set<string>();
      for (let t = 0; t < plan.finalMs - 60; t += 50) {
        tick(50);
        seen.add(status(r.container));
        // 당첨 핀은 늘 서 있고, 끝나기 전엔 빛나지 않는다.
        expect(standing(r.container)).toContain(`가게${winner + 1}`);
        expect(winPins(r.container)).toHaveLength(0);
      }
      expect(seen).toContain('마지막 공…!');
      expect(onSpinEnd).not.toHaveBeenCalled();

      tick(7_400 - plan.finalMs);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(standing(r.container)).toEqual([`가게${winner + 1}`]);
      expect(winPins(r.container)).toEqual([`가게${winner + 1}`]);
      expect(status(r.container)).toBe(`가게${winner + 1} 핀이 끝까지 버텼어요!`);
      expect(r.container.querySelector('.bowling__cut')).toBeNull();
      expect(r.container.querySelector('.bowling__ball')).toBeNull();
      r.unmount();
    }
  }, 30_000);

  it('사건이 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k += 1) {
      const n = k % 3 === 0 ? 2 : 9;
      const winner = k % n;
      const onSpinEnd = vi.fn();
      const r = render(
        <Bowling candidates={places(n)} winnerIndex={winner} spinning run={700 + k} onSpinEnd={onSpinEnd} />,
      );
      for (let t = 0; t < 7_300; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s.startsWith('거터')) seen.add('gutter');
        if (s.startsWith('스플릿')) seen.add('split');
        if (s.startsWith('쾅!')) seen.add('strike');
        if (s.startsWith('와르르!')) seen.add('hit');
        if (s.startsWith('팅!')) seen.add('kick');
        if (s.endsWith('버틸까…?')) seen.add('teeter');
        if (s.startsWith('아깝다!')) seen.add('fakeout');
        if (s === '어어, 저쪽으로 가요…?') seen.add('swerve');
        if (s.startsWith('핀 정리 중')) seen.add('sweep');
        if (s.startsWith('스쳤어요!')) seen.add('brush');
        if (r.container.querySelector('.bowling__cut')) seen.add('cut');
        expect(standing(r.container)).toContain(`가게${winner + 1}`);
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(standing(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const e of ['gutter', 'hit', 'teeter', 'fakeout', 'sweep', 'cut']) expect(seen, e).toContain(e);
  }, 30_000);

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Bowling candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1_000);
    r.unmount();
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Bowling {...props} spinning />);
    tick(1_000);
    r.rerender(<Bowling {...props} spinning={false} />);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 핀을 다시 세우고 처음부터 굴린다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Bowling {...props} winnerIndex={1} spinning run={1} />);
    tick(7_400);
    r.rerender(<Bowling {...props} winnerIndex={1} spinning={false} run={1} />);
    // 끝난 판을 다시 그려도(크게 보기 전환 등) 끝 장면 그대로.
    expect(standing(r.container)).toEqual(['가게2']);
    r.rerender(<Bowling {...props} winnerIndex={4} spinning run={2} />);
    expect(standing(r.container)).toHaveLength(6);
    expect(status(r.container)).toBe('1번째 공을 준비해요');
    tick(7_400);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(standing(r.container)).toEqual(['가게5']);
  });

  it('움직임 줄이기면 굴리는 장면 없이 끝 장면을 바로 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Bowling candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.bowling__cut')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(standing(r.container)).toEqual(['가게6']);
    expect(winPins(r.container)).toEqual(['가게6']);
  });

  it('한 곳뿐이면 굴릴 것 없이 그 핀이 버틴다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Bowling candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.bowling__cut')).toBeNull();
    expect(winPins(r.container)).toEqual(['가게1']);
    expect(status(r.container)).toBe('가게1 핀이 끝까지 버텼어요!');
  });

  it('끝난 판을 새로 그리면(크게 보기 전환) 굴리는 장면 없이 끝 장면 그대로', () => {
    const onSpinEnd = vi.fn();
    const r = render(
      <Bowling candidates={places(9)} winnerIndex={6} spinning={false} run={42} onSpinEnd={onSpinEnd} expanded />,
    );
    expect(r.container.querySelector('.bowling--settled')).not.toBeNull();
    expect(r.container.querySelector('.bowling--big')).not.toBeNull();
    expect(r.container.querySelector('.bowling__cut')).toBeNull();
    expect(standing(r.container)).toEqual(['가게7']);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('돌리기 전에는 핀만 서 있다', () => {
    const r = render(
      <Bowling candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />,
    );
    expect(standing(r.container)).toHaveLength(4);
    expect(r.container.querySelector('.bowling__ball')).toBeNull();
    expect(status(r.container)).toBe('핀 4개 — 끝까지 서 있으면 당첨!');
  });
});
