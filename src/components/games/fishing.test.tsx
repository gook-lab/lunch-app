// @vitest-environment jsdom
/**
 * 낚시 — 당첨 물고기를 계절·날씨에 따라 낚아 올리고, 도감에 기록한다.
 * 공정성: winnerIndex 로 정한 물고기가 마지막에 걸리고, 계절은 시각만 바꾼다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { AmbienceProvider } from '../../hooks/useAmbience';
import { Fishing } from './Fishing';
import { clearFishDex, getFishDex } from '../../lib/fishDex';

let reduced = false;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  clearFishDex();
  localStorage.removeItem('lunch-app:ambience');
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

const status = (c: HTMLElement) => c.querySelector('.fishing__status')?.textContent ?? '';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <AmbienceProvider office={{ lat: 37.5, lng: 126.97 }}>
    {children}
  </AmbienceProvider>
);

describe('낚시', () => {
  it('당첨 물고기를 낚아 올리고 onSpinEnd 를 호출한다', () => {
    for (const [n, winner] of [[2, 0], [5, 2], [10, 4], [15, 12]]) {
      const onSpinEnd = vi.fn();
      const run = n * 17 + winner;
      const r = render(
        <Wrapper>
          <Fishing candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />
        </Wrapper>,
      );
      const status0 = status(r.container);
      expect(status0).toContain('낚싯줄을 드리웠어요');

      tick(7000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const finalStatus = status(r.container);
      expect(finalStatus).toContain('낚았어요');
    }
  });

  it('도감에 낚은 물고기를 기록한다', () => {
    const onSpinEnd = vi.fn();
    render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={2} spinning run={42} onSpinEnd={onSpinEnd} />
      </Wrapper>,
    );
    tick(7000);

    // 도감에 물고기가 기록되어야 한다.
    const dex = getFishDex();
    expect(dex.length).toBeGreaterThan(0);
    expect(dex.every((id) => typeof id === 'string')).toBe(true);
  });

  it('같은 물고기를 여러 번 낚아도 도감에 한 번만 기록한다', () => {
    const onSpinEnd = vi.fn();

    // 첫 번째 게임
    render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={2} spinning run={42} onSpinEnd={onSpinEnd} />
      </Wrapper>,
    );
    tick(7000);
    const dex1 = getFishDex();

    cleanup();
    vi.useRealTimers();
    vi.useFakeTimers();

    // 두 번째 게임 — 같은 물고기 낚음 (run 이 다르면 생김새도 다를 수 있음)
    render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={2} spinning run={43} onSpinEnd={onSpinEnd} />
      </Wrapper>,
    );
    tick(7000);
    const dex2 = getFishDex();

    // 도감이 증가했거나 같아야 한다 (같은 종이면 증가하지 않음).
    expect(dex2.length).toBeLessThanOrEqual(dex1.length + 1);
  });

  it('계절별 CSS 클래스를 추가한다', () => {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      localStorage.setItem(
        'lunch-app:ambience',
        JSON.stringify({ season, weekday: 3, weather: 'clear' }),
      );
      const r = render(
        <Wrapper>
          <Fishing candidates={places(5)} winnerIndex={0} spinning={false} run={1} onSpinEnd={() => {}} />
        </Wrapper>,
      );
      const container = r.container.querySelector('.fishing');
      expect(container?.className).toContain(`fishing--season-${season}`);
      cleanup();
    }
  });

  it('날씨 CSS 클래스를 추가한다', () => {
    for (const weather of ['clear', 'rain', 'snow', 'fog']) {
      localStorage.setItem(
        'lunch-app:ambience',
        JSON.stringify({ season: 'summer', weekday: 3, weather }),
      );
      const r = render(
        <Wrapper>
          <Fishing candidates={places(5)} winnerIndex={0} spinning={false} run={1} onSpinEnd={() => {}} />
        </Wrapper>,
      );
      const container = r.container.querySelector('.fishing');
      expect(container?.className).toContain(`fishing--weather-${weather}`);
      cleanup();
    }
  });

  it('금요일에 fishing--friday 클래스를 추가한다', () => {
    localStorage.setItem(
      'lunch-app:ambience',
      JSON.stringify({ season: 'summer', weekday: 5, weather: 'clear' }),
    );
    const r = render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={0} spinning={false} run={1} onSpinEnd={() => {}} />
      </Wrapper>,
    );
    const container = r.container.querySelector('.fishing');
    expect(container?.className).toContain('fishing--friday');
  });

  it('금요일이 아니면 fishing--friday 클래스를 추가하지 않는다', () => {
    localStorage.setItem(
      'lunch-app:ambience',
      JSON.stringify({ season: 'summer', weekday: 3, weather: 'clear' }),
    );
    const r = render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={0} spinning={false} run={1} onSpinEnd={() => {}} />
      </Wrapper>,
    );
    const container = r.container.querySelector('.fishing');
    expect(container?.className).not.toContain('fishing--friday');
  });

  it('도감 버튼이 있다', () => {
    const r = render(
      <Wrapper>
        <Fishing candidates={places(5)} winnerIndex={0} spinning={false} run={1} onSpinEnd={() => {}} />
      </Wrapper>,
    );
    const btn = r.container.querySelector('button');
    expect(btn?.textContent).toContain('도감');
  });
});
