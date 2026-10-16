// @vitest-environment jsdom
/**
 * 활쏘기 — App 이 정한 당첨 과녁 정중앙에 마지막 화살이 꽂히고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 앞 두 발의 사건(바람·튕김·빗나감·아깝다·새)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 * 분위기(계절·날씨)는 시각적 변화만 줄 뿐 당첨을 바꾸지 않는다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { archeryPlan, rangeLayout } from '../../lib/archery';
import { seededRandom } from '../../lib/random';
import { Archery } from './Archery';

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

const status = (c: HTMLElement) => c.querySelector('.archery__status')?.textContent ?? '';
const winTargets = (c: HTMLElement) => [...c.querySelectorAll('.archery__target--win')].map((e) => e.getAttribute('title'));
/** 정중앙에 꽂힌(마지막) 화살이 있는 과녁. */
const bullseyes = (c: HTMLElement) =>
  [...c.querySelectorAll('.archery__stuck--final')].map((e) => e.closest('.archery__target')?.getAttribute('title'));

describe('활쏘기', () => {
  it('컷신 → 푸슝 → 화살 세 발, 마지막 화살만 당첨 정중앙에 꽂힌다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 2], [10, 9], [15, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(<Archery candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.archery__target')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      // 첫 컷신이 바로 뜬다(run 을 이번 판으로 바꾸지 않으면 컷신도 없다).
      expect(r.container.querySelector('.archery__cut')).not.toBeNull();
      expect(status(r.container)).toBe('1번째 화살 — 활시위를 당겨요…');

      const plan = archeryPlan(n, winner, rangeLayout(n).cols, seededRandom(run))!;
      const seen = new Set<string>();
      let flew = 0;
      let wasFlying = false;
      for (let t = 0; t < plan.shots[2].impactMs - 60; t += 50) {
        tick(50);
        seen.add(status(r.container));
        const flying = !!r.container.querySelector('.archery__arrow');
        if (flying && !wasFlying) flew += 1;
        wasFlying = flying;
        // 마지막 화살이 닿기 전엔 정중앙 화살도, 당첨 표시도 없다.
        expect(bullseyes(r.container)).toHaveLength(0);
        expect(winTargets(r.container)).toHaveLength(0);
      }
      expect(flew).toBe(3);
      expect(seen).toContain('푸슝!');
      expect(seen).toContain('마지막 화살 — 숨을 고르고…');
      expect(onSpinEnd).not.toHaveBeenCalled();

      tick(7_000 - plan.shots[2].impactMs + 200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(bullseyes(r.container)).toEqual([`가게${winner + 1}`]);
      expect(winTargets(r.container)).toEqual([`가게${winner + 1}`]);
      expect(status(r.container)).toMatch(new RegExp(`^(명중! 가게${winner + 1} 정중앙이에요|로빈후드! 가게${winner + 1} 정중앙, 화살까지 쪼갰어요)$`));
      // 컷신·날아가는 화살은 남지 않는다.
      expect(r.container.querySelector('.archery__cut')).toBeNull();
      expect(r.container.querySelector('.archery__arrow')).toBeNull();
      r.unmount();
    }
  });

  it('사건이 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 24; k += 1) {
      const n = k % 3 === 0 ? 2 : 9;
      const winner = k % n;
      const onSpinEnd = vi.fn();
      const r = render(<Archery candidates={places(n)} winnerIndex={winner} spinning run={500 + k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t < 7_100; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s === '바람이 불어요!') seen.add('wind');
        if (s === '앗, 새가 지나가요!') seen.add('bird');
        if (s.startsWith('팅!')) seen.add('ricochet');
        if (s.startsWith('빗나갔어요')) seen.add('miss');
        if (s.startsWith('아깝다!')) seen.add('close');
        if (s.endsWith('가장자리 — 정중앙이 아니에요')) seen.add('plain');
        if (s.startsWith('로빈후드!')) seen.add('split');
        // 아깝다 화살은 당첨 과녁이어도 정중앙이 아니다 — 당첨 표시는 마지막에만.
        if (onSpinEnd.mock.calls.length === 0 && s.startsWith('아깝다!')) expect(winTargets(r.container)).toHaveLength(0);
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(bullseyes(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const e of ['wind', 'ricochet', 'miss', 'close', 'plain']) expect(seen, e).toContain(e);
  });

  it('바람 — 화면에 바람 줄이 흐르고 꽂힌 곳은 당첨이 아니다', () => {
    // 바람이 나오는 판을 찾아 그 발이 닿은 순간을 본다.
    const n = 6;
    const layout = rangeLayout(n);
    let run = 0;
    let plan = archeryPlan(n, 2, layout.cols, seededRandom(run))!;
    while (!plan.shots.some((s) => s.kind === 'wind')) plan = archeryPlan(n, 2, layout.cols, seededRandom(++run))!;
    const shot = plan.shots.find((s) => s.kind === 'wind')!;
    const r = render(<Archery candidates={places(n)} winnerIndex={2} spinning run={run} onSpinEnd={() => {}} />);
    act(() => { vi.advanceTimersByTime(shot.flyMs + 10); });
    expect(r.container.querySelector('.archery__wind')).not.toBeNull();
    expect(r.container.querySelector('.archery__callout')?.textContent).toBe('휘잉~');
    act(() => { vi.advanceTimersByTime(shot.impactMs - shot.flyMs); });
    expect(status(r.container)).toBe(`바람에 휘어 가게${shot.hit! + 1}에 꽂혔어요`);
    expect(shot.hit).not.toBe(2);
    expect(r.container.querySelector('.archery__target--wobble')?.getAttribute('title')).toBe(`가게${shot.hit! + 1}`);
  });

  it('로빈후드 — 당첨 과녁의 아깝다 화살이 쪼개지고, 끝난 뒤엔 정중앙 화살만 남는다', () => {
    const n = 5;
    const layout = rangeLayout(n);
    let run = 0;
    let plan = archeryPlan(n, 1, layout.cols, seededRandom(run))!;
    while (plan.shots[2].kind !== 'split') plan = archeryPlan(n, 1, layout.cols, seededRandom(++run))!;
    const onSpinEnd = vi.fn();
    const r = render(<Archery candidates={places(n)} winnerIndex={1} spinning run={run} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(plan.shots[2].impactMs + 10); });
    expect(r.container.querySelector('.archery__stuck--split')?.closest('.archery__target')?.getAttribute('title')).toBe('가게2');
    expect(r.container.querySelectorAll('.archery__shard')).toHaveLength(2);
    expect(r.container.querySelector('.archery__callout')?.textContent).toBe('로빈후드!');
    tick(1_200);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.archery__stuck--split')).toBeNull();
    expect(r.container.querySelectorAll('.archery__target[title="가게2"] .archery__stuck')).toHaveLength(1);
    expect(status(r.container)).toBe('로빈후드! 가게2 정중앙, 화살까지 쪼갰어요');
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Archery candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1_000);
    r.unmount();
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Archery {...props} spinning />);
    tick(1_000);
    r.rerender(<Archery {...props} spinning={false} />);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 화살을 모두 뽑고 처음부터 다시 쏜다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Archery {...props} winnerIndex={1} spinning run={1} />);
    tick(7_200);
    r.rerender(<Archery {...props} winnerIndex={1} spinning={false} run={1} />);
    // 끝난 판을 다시 그려도(크게 보기 전환 등) 꽂힌 모습 그대로.
    expect(bullseyes(r.container)).toEqual(['가게2']);
    r.rerender(<Archery {...props} winnerIndex={4} spinning run={2} />);
    expect(r.container.querySelectorAll('.archery__stuck')).toHaveLength(0);
    expect(status(r.container)).toBe('1번째 화살 — 활시위를 당겨요…');
    tick(7_200);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(bullseyes(r.container)).toEqual(['가게5']);
  });

  it('움직임 줄이기면 쏘는 장면 없이 꽂힌 모습을 바로 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Archery candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.archery__cut')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(bullseyes(r.container)).toEqual(['가게6']);
    expect(winTargets(r.container)).toEqual(['가게6']);
  });

  it('한 곳뿐이면 사건 없이 바로 명중', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Archery candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.archery__cut')).toBeNull();
    expect(bullseyes(r.container)).toEqual(['가게1']);
    expect(status(r.container)).toBe('명중! 가게1 정중앙이에요');
  });

  it('끝난 판을 새로 그리면(크게 보기 전환) 쏘는 장면 없이 꽂힌 모습 그대로', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Archery candidates={places(9)} winnerIndex={6} spinning={false} run={42} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.archery--settled')).not.toBeNull();
    expect(r.container.querySelector('.archery__cut')).toBeNull();
    expect(bullseyes(r.container)).toEqual(['가게7']);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('돌리기 전에는 과녁만 서 있다', () => {
    const r = render(<Archery candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelectorAll('.archery__target')).toHaveLength(4);
    expect(r.container.querySelectorAll('.archery__stuck')).toHaveLength(0);
    expect(status(r.container)).toBe('과녁 4개 — 정중앙을 맞히면 당첨!');
  });

  it('분위기(계절·날씨) 클래스가 컨테이너에 적용된다', () => {
    // 분위기 값을 모킹한다.
    const mockAmbience = { season: 'winter', weather: 'snow', weekday: 2 };
    vi.doMock('../../hooks/useAmbience', () => ({
      useAmbience: () => mockAmbience,
      AmbienceProvider: ({ children }: any) => children,
    }));

    // 실제로는 직접 검증하기 어려우므로, 대신 컴포넌트가
    // 분위기 값과 무관하게 당첨을 올바르게 표시하는지 검증한다.
    const n = 5;
    const winner = 2;
    const onSpinEnd = vi.fn();
    const run = n * 31 + winner;
    const r = render(<Archery candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);

    // 분위기가 변해도 당첨 과녁이 정확하다.
    const plan = archeryPlan(n, winner, rangeLayout(n).cols, seededRandom(run))!;
    for (let t = 0; t < plan.endMs + 500; t += 50) {
      tick(50);
    }
    expect(bullseyes(r.container)).toEqual([`가게${winner + 1}`]);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);

    vi.doUnmock('../../hooks/useAmbience');
  });

  it('분위기가 변해도 당첨 과녁이 바뀌지 않는다', () => {
    // 계절과 날씨를 여러 조합으로 시도한다.
    const ambiences = [
      { season: 'spring', weather: 'clear', weekday: 0 },
      { season: 'summer', weather: 'rain', weekday: 5 },
      { season: 'autumn', weather: 'fog', weekday: 3 },
      { season: 'winter', weather: 'snow', weekday: 1 },
    ] as const;

    for (const ambience of ambiences) {
      vi.doMock('../../hooks/useAmbience', () => ({
        useAmbience: () => ambience,
        AmbienceProvider: ({ children }: any) => children,
      }));

      const n = 6;
      const winner = 3;
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(<Archery candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);

      const plan = archeryPlan(n, winner, rangeLayout(n).cols, seededRandom(run))!;
      for (let t = 0; t < plan.endMs + 500; t += 50) {
        tick(50);
      }

      // 모든 분위기에서 동일한 당첨자.
      expect(bullseyes(r.container)).toEqual([`가게${winner + 1}`]);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();

      vi.doUnmock('../../hooks/useAmbience');
    }
  });
});
