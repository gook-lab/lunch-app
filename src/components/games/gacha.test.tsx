// @vitest-environment jsdom
/**
 * 뽑기 기계 — 손잡이 컷신(드르륵) → 섞기 → 사건 → 열면 쪽지에 App 이 정한 당첨 가게. 끝나면 onSpinEnd 한 번.
 * 출구까지 왔다 돌아가는 캡슐·걸림·골드 캡슐은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { withJosa } from '../../lib/josa';
import { GACHA_MAX_MS, gachaPlan } from '../../lib/gacha';
import { seededRandom } from '../../lib/random';
import { Gacha, MAX_CAPSULES } from './Gacha';

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
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

const status = (c: HTMLElement) => c.querySelector('.gacha__status')?.textContent ?? '';
const slip = (c: HTMLElement) => c.querySelector('.gacha__slip strong')?.textContent ?? null;
const plan = (n: number, w: number, run: number) => gachaPlan(n, w, seededRandom(run * 7 + 3))!;

describe('뽑기 기계', () => {
  it('드르륵 컷신으로 시작해, 끝나면 쪽지에 당첨 가게 — 그 전엔 쪽지가 없다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 4], [15, 7], [20, 13], [26, 25]]) {
      const onSpinEnd = vi.fn();
      const run = n * 13 + winner;
      const r = render(<Gacha candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelector('.gacha--crank')).toBeTruthy();
      expect(r.container.querySelectorAll('.gacha__bar')).toHaveLength(2);
      expect(status(r.container)).toBe('드르륵… 손잡이를 돌려요');
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES));
      const p = plan(n, winner, run);
      const popAt = p.steps.find((s) => s.say === 'pop')!.at;
      for (let t = 0; t < popAt - 60; t += 50) {
        tick(50);
        expect(r.container.querySelector('.gacha__reveal--popped')).toBeNull();
        // 출구까지 왔다 가는 캡슐에 비치는 이름은 당첨 가게가 아니다.
        const tag = r.container.querySelector('.gacha__peektag')?.textContent;
        if (tag) expect(tag).not.toBe(`가게${winner + 1}`);
      }
      expect(onSpinEnd).not.toHaveBeenCalled();
      tick(p.endMs - popAt + 200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(slip(r.container)).toBe(`가게${winner + 1}`);
      expect(status(r.container)).toBe(`뽑았어요! ${withJosa(`가게${winner + 1}`, '이/가')} 나왔어요`);
      // 나온 캡슐만큼 돔이 하나 줄었다.
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES) - 1);
      tick(2000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('사건(아깝다·걸림·골드)이 판마다 달리 나오고, 무엇이 나와도 쪽지는 당첨 가게다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 40; k += 1) {
      const n = k % 3 === 0 ? 2 : 9;
      const winner = k % n;
      const p = plan(n, winner, k);
      const onSpinEnd = vi.fn();
      const r = render(<Gacha candidates={places(n)} winnerIndex={winner} spinning run={k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t <= p.endMs + 100; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s.startsWith('아깝다')) seen.add('peek');
        if (s === '어? 걸렸어요') seen.add('jam');
        if (s === '탁! 빠졌어요') seen.add('knock');
        if (r.container.querySelector('.gacha--gold')) seen.add('gold');
        if (r.container.querySelector('.gacha__fist')) seen.add('fist');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(slip(r.container)).toBe(`가게${winner + 1}`);
      r.unmount();
    }
    expect([...seen].sort()).toEqual(['fist', 'gold', 'jam', 'knock', 'peek']);
  });

  it('한 판은 7.2초를 넘지 않는다', () => {
    expect(GACHA_MAX_MS).toBeLessThanOrEqual(7200);
  });

  it('한 곳뿐이면 바로 쪽지를 연다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Gacha candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(slip(r.container)).toBe('가게1');
  });

  it('20곳이 넘으면 나머지 수를 적는다', () => {
    const r = render(<Gacha candidates={places(26)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelector('.gacha__more')?.textContent).toBe('캡슐이 6개 더 있어요');
    expect(status(r.container)).toBe('캡슐 26개 — 손잡이를 돌려 볼까요?');
  });

  it('움직임 줄이기면 바로 연다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Gacha candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(slip(r.container)).toBe('가게3');
    expect(r.container.querySelector('.gacha__bar')).toBeNull();
  });

  it('언마운트하거나 spinning 이 꺼지면 타이머가 멈춘다', () => {
    const a = vi.fn();
    const r1 = render(<Gacha candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={a} />);
    tick(500);
    r1.unmount();
    tick(GACHA_MAX_MS + 500);
    expect(a).not.toHaveBeenCalled();

    const b = vi.fn();
    const r2 = render(<Gacha candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={b} />);
    tick(500);
    r2.rerender(<Gacha candidates={places(5)} winnerIndex={2} spinning={false} run={1} onSpinEnd={b} />);
    tick(GACHA_MAX_MS + 500);
    expect(b).not.toHaveBeenCalled();
  });

  it('다음 판은 손잡이 컷신부터 다시 시작한다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Gacha candidates={places(6)} winnerIndex={2} spinning run={1} onSpinEnd={onSpinEnd} />);
    tick(GACHA_MAX_MS + 200);
    r.rerender(<Gacha candidates={places(6)} winnerIndex={2} spinning={false} run={1} onSpinEnd={onSpinEnd} />);
    expect(slip(r.container)).toBe('가게3');
    r.rerender(<Gacha candidates={places(6)} winnerIndex={4} spinning run={2} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.gacha--crank')).toBeTruthy();
    expect(r.container.querySelector('.gacha__reveal')).toBeNull();
    tick(GACHA_MAX_MS + 200);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(slip(r.container)).toBe('가게5');
  });
});
