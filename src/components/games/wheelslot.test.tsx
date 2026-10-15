// @vitest-environment jsdom
/**
 * 돌림판·슬롯 — App 이 정한 당첨에서 멈추고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 결말·장면(한 칸 더·역회전·리치·꽝·다시 돌기)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { sliceAt } from '../../lib/wheel';
import { reelOrders, symbolAt } from '../../lib/slot';
import { SPIN_MS } from './types';
import { Wheel } from './Wheel';
import { Slot } from './Slot';

let reduced = false;
beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce') ? reduced : false,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

const discAngle = (c: HTMLElement) =>
  Number((c.querySelector('.wheel__disc') as HTMLElement).style.transform.match(/rotate\((-?[\d.e+-]+)deg\)/)![1]);
const wheelStatus = (c: HTMLElement) => c.querySelector('.wheelgame__status')?.textContent ?? '';
const slotStatus = (c: HTMLElement) => c.querySelector('.slot__status')?.textContent ?? '';
/** 슬롯 릴 세 개의 가운데 줄 가게(띠 이동량에서 거꾸로 푼다). */
const slotLine = (c: HTMLElement, n: number) => {
  const reels = [...c.querySelectorAll('.slot__reel')] as HTMLElement[];
  const h = (c.querySelector('.slot__item') as HTMLElement).style.height;
  const itemH = Number(h.replace('px', ''));
  const base = n * Math.ceil((n + 1 + 1) / n);
  return reels.map((el, k) => {
    const y = Number(el.style.transform.match(/translateY\((-?[\d.e+-]+)px\)/)![1]);
    // y = (center − (base − p)) · h, center = 1 (세 줄).
    const p = y / itemH - 1 + base;
    return symbolAt(reelOrders(n)[k], p);
  });
};

describe('돌림판', () => {
  it('당첨 칸에 멈추고 가운데에 이름을 띄운 뒤 onSpinEnd 를 한 번 — 2~20곳', () => {
    for (const [n, winner] of [
      [2, 0],
      [2, 1],
      [5, 3],
      [9, 8],
      [15, 0],
      [20, 13],
    ]) {
      const onSpinEnd = vi.fn();
      const run = n * 17 + winner;
      const r = render(<Wheel candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(wheelStatus(r.container)).toBe('끼릭끼릭… 힘껏 감고 있어요');
      tick(SPIN_MS.wheel - 100);
      expect(onSpinEnd).not.toHaveBeenCalled();
      // 끝나기 전에 당첨 장면이 먼저 보인다(조명·꽃가루).
      expect(r.container.querySelector('.wheel__spot')).not.toBeNull();
      tick(200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(sliceAt(discAngle(r.container), n)).toBe(winner);
      expect(r.container.querySelector('.wheel__center strong')?.textContent).toBe(`가게${winner + 1}`);
      expect(wheelStatus(r.container)).toBe(`가게${winner + 1} 당첨이에요!`);
      tick(2000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('결말이 판마다 다르고(한 칸 더·툭·역회전), 무엇이 나와도 당첨은 그대로 — 다음 판은 멈춘 자리에서 이어 돈다', () => {
    const seen = new Set<string>();
    const onSpinEnd = vi.fn();
    const n = 7;
    const props = { candidates: places(n), onSpinEnd };
    const r = render(<Wheel {...props} winnerIndex={0} spinning={false} run={0} />);
    for (let k = 1; k <= 24; k += 1) {
      const winner = (k * 3) % n;
      r.rerender(<Wheel {...props} winnerIndex={winner} spinning run={k * 101} />);
      for (let t = 0; t < SPIN_MS.wheel + 100; t += 50) {
        tick(50);
        const s = wheelStatus(r.container);
        if (s.includes('한 칸 더…?')) seen.add('creep');
        if (s.includes('멈췄… 나요?')) seen.add('nudge');
        if (s.startsWith('역회전!')) seen.add('reverse');
        if (s.startsWith('끼릭끼릭')) seen.add('windup');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(k);
      expect(sliceAt(discAngle(r.container), n)).toBe(winner);
      r.rerender(<Wheel {...props} winnerIndex={winner} spinning={false} run={k * 101} />);
      expect(r.container.querySelector('.wheel__center strong')?.textContent).toBe(`가게${winner + 1}`);
    }
    for (const e of ['windup', 'creep', 'nudge', 'reverse']) expect(seen, e).toContain(e);
  }, 30_000);

  it('언마운트하거나 spinning 이 꺼지면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const a = render(<Wheel candidates={places(6)} winnerIndex={2} spinning run={3} onSpinEnd={onSpinEnd} />);
    tick(1000);
    a.unmount();
    const props = { candidates: places(6), winnerIndex: 2, run: 4, onSpinEnd };
    const b = render(<Wheel {...props} spinning />);
    tick(1000);
    b.rerender(<Wheel {...props} spinning={false} />);
    tick(8000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('움직임 줄이기·한 곳뿐이면 돌지 않고 바로 당첨', () => {
    for (const [n, isReduced] of [
      [6, true],
      [1, false],
    ] as const) {
      reduced = isReduced;
      const onSpinEnd = vi.fn();
      const winner = n - 1;
      const r = render(<Wheel candidates={places(n)} winnerIndex={winner} spinning run={9} onSpinEnd={onSpinEnd} />);
      tick(50);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(sliceAt(discAngle(r.container), n)).toBe(winner);
      expect(r.container.querySelector('.wheel__center strong')?.textContent).toBe(`가게${n}`);
      r.unmount();
    }
  });
});

describe('슬롯', () => {
  it('세 릴이 당첨 줄에 서고 잭팟, onSpinEnd 를 한 번 — 2~20곳', () => {
    for (const [n, winner] of [
      [2, 0],
      [2, 1],
      [4, 2],
      [10, 9],
      [15, 0],
      [20, 13],
    ]) {
      const onSpinEnd = vi.fn();
      const r = render(
        <Slot candidates={places(n)} winnerIndex={winner} spinning run={n * 7 + winner} onSpinEnd={onSpinEnd} />,
      );
      expect(slotStatus(r.container)).toBe('레버를 당겨요… 철컥!');
      tick(SPIN_MS.slot - 100);
      expect(onSpinEnd).not.toHaveBeenCalled();
      // 끝나기 전에 잭팟이 먼저 보인다(동전).
      expect(r.container.querySelector('.slot__coins')).not.toBeNull();
      tick(200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(slotLine(r.container, n)).toEqual([winner, winner, winner]);
      expect(r.container.querySelectorAll('.slot__item--win')).toHaveLength(3);
      for (const el of r.container.querySelectorAll('.slot__item--win'))
        expect(el.getAttribute('title')).toBe(`가게${winner + 1}`);
      expect(slotStatus(r.container)).toBe(`잭팟! 가게${winner + 1} 세 줄이에요!`);
      tick(2000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('장면이 판마다 다르고(리치·멈칫·꽝·다시 돌기·한 칸 더), 무엇이 나와도 세 줄은 당첨', () => {
    const seen = new Set<string>();
    const onSpinEnd = vi.fn();
    const n = 8;
    const props = { candidates: places(n), onSpinEnd };
    const r = render(<Slot {...props} winnerIndex={0} spinning={false} run={0} />);
    for (let k = 1; k <= 24; k += 1) {
      const winner = (k * 5) % n;
      r.rerender(<Slot {...props} winnerIndex={winner} spinning run={k * 37} />);
      for (let t = 0; t < SPIN_MS.slot + 100; t += 50) {
        tick(50);
        const s = slotStatus(r.container);
        if (s.startsWith('리치!')) seen.add('reach');
        if (s.endsWith('멈추나…?')) seen.add('teeter');
        if (s.startsWith('아깝다!')) seen.add('miss');
        if (s.startsWith('한 번 더 돌아요')) seen.add('respin1');
        if (s.startsWith('다시 한 번!')) seen.add('respinAll');
        if (s.startsWith('한 칸 모자라요')) seen.add('short');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(k);
      expect(slotLine(r.container, n)).toEqual([winner, winner, winner]);
      r.rerender(<Slot {...props} winnerIndex={winner} spinning={false} run={k * 37} />);
      expect(r.container.querySelectorAll('.slot__item--win')).toHaveLength(3);
    }
    for (const e of ['reach', 'teeter', 'miss', 'respin1', 'respinAll', 'short']) expect(seen, e).toContain(e);
  }, 30_000);

  it('언마운트하거나 spinning 이 꺼지면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const a = render(<Slot candidates={places(6)} winnerIndex={2} spinning run={3} onSpinEnd={onSpinEnd} />);
    tick(1000);
    a.unmount();
    const props = { candidates: places(6), winnerIndex: 2, run: 4, onSpinEnd };
    const b = render(<Slot {...props} spinning />);
    tick(1000);
    b.rerender(<Slot {...props} spinning={false} />);
    tick(8000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('움직임 줄이기·한 곳뿐이면 돌지 않고 바로 세 줄', () => {
    for (const [n, isReduced] of [
      [6, true],
      [1, false],
    ] as const) {
      reduced = isReduced;
      const onSpinEnd = vi.fn();
      const winner = n - 1;
      const r = render(<Slot candidates={places(n)} winnerIndex={winner} spinning run={9} onSpinEnd={onSpinEnd} />);
      tick(50);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(slotLine(r.container, n)).toEqual([winner, winner, winner]);
      expect(r.container.querySelector('.slot__winner')?.textContent).toContain(`가게${n}`);
      r.unmount();
    }
  });
});
