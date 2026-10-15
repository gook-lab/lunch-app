// @vitest-environment jsdom
/**
 * 인형뽑기 — App 이 정한 당첨 인형만 출구로 들어가 튀어나오고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 앞 기회의 사건(미끄러짐·문턱·힘 약한 집게·두 개·툭)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { clawLayout, clawPlan } from '../../lib/claw';
import { seededRandom } from '../../lib/random';
import { Claw } from './Claw';

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
  for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(50); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: '한식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

const status = (c: HTMLElement) => c.querySelector('.claw__status')?.textContent ?? '';
const wonToys = (c: HTMLElement) => [...c.querySelectorAll('.claw__toy--win')].map((e) => e.getAttribute('title'));
const inChute = (c: HTMLElement) => [...c.querySelectorAll('.claw__toy--chute')].map((e) => e.getAttribute('title'));

describe('인형뽑기', () => {
  it('집게 두세 번 — 당첨 인형만 출구로 들어가 뽑힌다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 2], [10, 9], [15, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(<Claw candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.claw__toy')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      expect(status(r.container)).toBe('1번째 기회 — 집게를 옮겨요');

      const plan = clawPlan(clawLayout(n, seededRandom(11 + n)), winner, seededRandom(run))!;
      const finalStart = plan.attempts[plan.attempts.length - 1].startMs;
      const seen = new Set<string>();
      for (let t = 0; t < plan.endMs - 900; t += 50) {
        tick(50);
        seen.add(status(r.container));
        // 끝나기 전엔 뽑힌 인형이 없고, 당첨 아닌 인형은 출구에 들어가지 않는다.
        expect(wonToys(r.container)).toHaveLength(0);
        for (const name of inChute(r.container)) expect(name).toBe(`가게${winner + 1}`);
        if (t < finalStart) expect(inChute(r.container)).toHaveLength(0);
      }
      expect(seen).toContain('마지막 기회! 3…');
      expect(seen).toContain('제발… 제발…!');
      expect(onSpinEnd).not.toHaveBeenCalled();

      tick(1_200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(wonToys(r.container)).toEqual([`가게${winner + 1}`]);
      expect(status(r.container)).toBe(`뽑았어요! 가게${winner + 1}`);
      // 뽑힌 인형 이름표는 줄이지 않는다.
      expect(r.container.querySelector('.claw__toy--win .claw__tag')?.textContent).toBe(`가게${winner + 1}`);
      tick(2_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('사건이 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k += 1) {
      const n = k % 3 === 0 ? 2 : 9;
      const winner = k % n;
      const onSpinEnd = vi.fn();
      const r = render(<Claw candidates={places(n)} winnerIndex={winner} spinning run={700 + k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t < 7_300; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s === '앗, 미끄러졌어요!') seen.add('slip');
        if (s.includes('문턱에 걸렸어요') && s.startsWith('아깝다!')) seen.add('edge');
        if (s.endsWith('스치기만 했어요')) seen.add('weak');
        if (s === '앗, 나머지도 미끄러졌어요!') seen.add('double');
        if (s.includes('출구 쪽으로 굴렀어요')) seen.add('nudge');
        if (s === '어어… 문턱에 걸렸어요!') seen.add('teeter');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(wonToys(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const e of ['slip', 'edge', 'weak', 'double', 'nudge', 'teeter']) expect(seen, e).toContain(e);
  });

  it('움직임 줄이기면 바로 뽑힌 모습 — onSpinEnd 한 번', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Claw candidates={places(6)} winnerIndex={4} spinning run={3} onSpinEnd={onSpinEnd} />);
    tick(50);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(wonToys(r.container)).toEqual(['가게5']);
    expect(status(r.container)).toBe('뽑았어요! 가게5');
  });

  it('한 곳뿐이면 바로 뽑힌다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Claw candidates={places(1)} winnerIndex={0} spinning run={1} onSpinEnd={onSpinEnd} />);
    tick(50);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(wonToys(r.container)).toEqual(['가게1']);
  });

  it('언마운트·다음 판·멈춤에 타이머를 치운다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Claw candidates={places(8)} winnerIndex={2} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1_000);
    // 다음 판 — 앞 판의 onSpinEnd 는 오지 않는다.
    r.rerender(<Claw candidates={places(8)} winnerIndex={6} spinning run={6} onSpinEnd={onSpinEnd} />);
    expect(status(r.container)).toBe('1번째 기회 — 집게를 옮겨요');
    tick(7_500);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(wonToys(r.container)).toEqual(['가게7']);

    const onEnd2 = vi.fn();
    r.rerender(<Claw candidates={places(8)} winnerIndex={1} spinning run={7} onSpinEnd={onEnd2} />);
    tick(500);
    r.rerender(<Claw candidates={places(8)} winnerIndex={1} spinning={false} run={7} onSpinEnd={onEnd2} />);
    tick(8_000);
    expect(onEnd2).not.toHaveBeenCalled();

    const onEnd3 = vi.fn();
    r.rerender(<Claw candidates={places(8)} winnerIndex={3} spinning run={8} onSpinEnd={onEnd3} />);
    tick(500);
    r.unmount();
    tick(8_000);
    expect(onEnd3).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('판이 끝난 뒤 다시 그려지면 뽑힌 모습, 돌리기 전엔 더미와 안내', () => {
    const r = render(<Claw candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(status(r.container)).toBe('인형 4개 — 출구에 떨어지면 당첨!');
    expect(r.container.querySelectorAll('.claw__toy--pile')).toHaveLength(4);
    r.rerender(<Claw candidates={places(4)} winnerIndex={3} spinning={false} run={9} onSpinEnd={() => {}} expanded />);
    expect(wonToys(r.container)).toEqual(['가게4']);
    expect(r.container.querySelector('.claw--big')).not.toBeNull();
  });
});
