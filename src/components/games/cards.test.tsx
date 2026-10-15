// @vitest-environment jsdom
/**
 * 카드 — 딜러 컷신(촤르륵·착!) → 나눠 주기 → 나머지가 꽝으로 뒤집힘(아깝다·조커 포함) → 고른 카드가 마지막에
 * 천천히 뒤집혀 App 이 정한 당첨. 끝나면 onSpinEnd 한 번. 움직임 줄이기·한 장뿐이면 바로 결과.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { CARDS_MAX_MS, cardsPlan } from '../../lib/cards';
import { seededRandom } from '../../lib/random';
import { Cards } from './Cards';

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

const status = (c: HTMLElement) => c.querySelector('.cards__status')?.textContent ?? '';
const mine = (c: HTMLElement) => c.querySelector('.cards__card--mine');
const openCount = (c: HTMLElement) => c.querySelectorAll('.cards__card--open').length;
/** 실행 단추로 시작했을 때 컴포넌트가 고르는 자리. */
const autoPick = (run: number, n: number) => Math.floor(seededRandom(run)() * n);

describe('카드', () => {
  it('컷신 → 나눠 주기 → 나머지가 꽝 → 고른 카드가 마지막에 당첨', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [3, 2], [9, 4], [15, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const run = n * 17 + winner;
      const r = render(<Cards candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      const pick = autoPick(run, n);
      const p = cardsPlan(n, pick, winner, seededRandom(run + 1))!;
      expect(status(r.container)).toBe('카드를 모아요');
      expect(openCount(r.container)).toBe(0);
      const seen = new Set<string>();
      const finalAt = p.steps.find((s) => s.say === 'final')!.at;
      for (let t = 0; t < finalAt - 60; t += 50) {
        tick(50);
        seen.add(status(r.container));
        if (r.container.querySelector('.cards__cut')) seen.add('cut');
        // 고른 카드는 마지막 단계 전까지 엎어져 있고, 당첨 표시도 없다.
        expect(mine(r.container)?.classList.contains('cards__card--open')).toBe(false);
        expect(r.container.querySelector('.cards__card--win')).toBeNull();
      }
      expect(seen).toContain('cut');
      expect(seen).toContain('촤르륵… 딜러가 섞어요');
      expect(seen).toContain('착! 다 섞었어요');
      expect(seen).toContain('카드를 나눠 드려요');
      // 마지막 단계 직전엔 나머지가 전부 열렸다.
      expect(openCount(r.container)).toBe(n - 1);
      expect(onSpinEnd).not.toHaveBeenCalled();

      tick(p.endMs - finalAt + 200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const m = mine(r.container)!;
      expect(m.classList.contains('cards__card--win')).toBe(true);
      expect(m.getAttribute('aria-label')).toBe(`${pick + 1}번 카드: 가게${winner + 1}`);
      expect(r.container.querySelectorAll('.cards__card--win')).toHaveLength(1);
      expect(openCount(r.container)).toBe(n);
      expect(r.container.querySelectorAll('.cards__stamp')).toHaveLength(n - 1);
      expect(status(r.container)).toBe(`당첨! 가게${winner + 1}`);
      expect(r.container.querySelector('.cards__grid--done')).toBeTruthy();
      tick(2000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('고른 카드에 당첨이 놓인다 — 사용자가 고른 자리', () => {
    const onSpinEnd = vi.fn();
    const onRequestSpin = vi.fn();
    const r = render(
      <Cards candidates={places(6)} winnerIndex={null} spinning={false} run={0} onSpinEnd={onSpinEnd} onRequestSpin={onRequestSpin} />,
    );
    fireEvent.click(r.getByRole('button', { name: '4번 카드 고르기' }));
    expect(onRequestSpin).toHaveBeenCalledTimes(1);
    r.rerender(<Cards candidates={places(6)} winnerIndex={1} spinning run={5} onSpinEnd={onSpinEnd} onRequestSpin={onRequestSpin} />);
    tick(CARDS_MAX_MS + 200);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.getByRole('button', { name: '4번 카드: 가게2' }).classList.contains('cards__card--win')).toBe(true);
  });

  it('아깝다·조커가 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k += 1) {
      const n = k % 3 === 0 ? 2 : 8;
      const winner = (k * 5) % n;
      const onSpinEnd = vi.fn();
      const r = render(<Cards candidates={places(n)} winnerIndex={winner} spinning run={k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t <= CARDS_MAX_MS; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s.startsWith('어?')) seen.add('tease');
        if (s.startsWith('꽝!')) seen.add('miss');
        if (s.startsWith('조커!')) seen.add('joker');
        if (r.container.querySelector('.cards__card--joker .cards__jokerface')) seen.add('jokerface');
        if (s.startsWith('장난이었어요')) seen.add('joker-out');
        if (s.startsWith('꽝, 꽝')) seen.add('wave');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(mine(r.container)?.getAttribute('aria-label')).toBe(`${autoPick(k, n) + 1}번 카드: 가게${winner + 1}`);
      r.unmount();
    }
    expect([...seen].sort()).toEqual(['joker', 'joker-out', 'jokerface', 'miss', 'tease', 'wave']);
  });

  it('한 장뿐이면 바로 당첨', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Cards candidates={places(1)} winnerIndex={0} spinning run={2} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(mine(r.container)?.classList.contains('cards__card--win')).toBe(true);
    expect(mine(r.container)?.getAttribute('aria-label')).toBe('1번 카드: 가게1');
  });

  it('움직임 줄이기면 바로 다 뒤집는다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Cards candidates={places(7)} winnerIndex={3} spinning run={9} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(openCount(r.container)).toBe(7);
    expect(mine(r.container)?.classList.contains('cards__card--win')).toBe(true);
    expect(r.container.querySelector('.cards__cut')).toBeNull();
  });

  it('언마운트하거나 spinning 이 꺼지면 타이머가 멈춘다', () => {
    const a = vi.fn();
    const r1 = render(<Cards candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={a} />);
    tick(500);
    r1.unmount();
    tick(CARDS_MAX_MS + 500);
    expect(a).not.toHaveBeenCalled();

    const b = vi.fn();
    const r2 = render(<Cards candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={b} />);
    tick(500);
    r2.rerender(<Cards candidates={places(5)} winnerIndex={2} spinning={false} run={1} onSpinEnd={b} />);
    tick(CARDS_MAX_MS + 500);
    expect(b).not.toHaveBeenCalled();
  });
});
