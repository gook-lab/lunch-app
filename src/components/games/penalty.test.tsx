// @vitest-environment jsdom
/**
 * 승부차기 — App 이 정한 당첨 구역 골망에 마지막 슛이 꽂히고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 앞 두 슛의 사건(선방·골대·홈런·캐치·크로스바)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 * 분위기(계절·날씨)는 시각적 변화만 줄 뿐 당첨을 바꾸지 않는다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { penaltyPlan } from '../../lib/penalty';
import { seededRandom } from '../../lib/random';
import { Penalty } from './Penalty';

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

const status = (c: HTMLElement) => c.querySelector('.penalty__status')?.textContent ?? '';
const winZones = (c: HTMLElement) => [...c.querySelectorAll('.penalty__zone--win')].map((e) => e.getAttribute('title'));
const goals = (c: HTMLElement) => [...c.querySelectorAll('.penalty__zone--hit')].map((e) => e.getAttribute('title'));

describe('승부차기', () => {
  it('눈싸움 → 도움닫기 → 뻥 → 슛 세 번, 마지막 슛만 당첨 구역 골망에 — 2~20곳', () => {
    for (let n = 2; n <= 20; n += 1) {
      const winner = (n * 7) % n;
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(<Penalty candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.penalty__zone')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      // 첫 컷신이 바로 뜬다(run 을 이번 판으로 바꾸지 않으면 컷신도 없다).
      expect(r.container.querySelector('.penalty__cut')).not.toBeNull();
      expect(status(r.container)).toBe('1번째 키커 — 눈치 싸움…');

      const plan = penaltyPlan(n, winner, seededRandom(run))!;
      const seen = new Set<string>();
      let flew = 0;
      let wasFlying = false;
      for (let t = 0; t < plan.shots[2].impactMs - 60; t += 50) {
        tick(50);
        seen.add(status(r.container));
        const flying = !!r.container.querySelector('.penalty__ball--fly');
        if (flying && !wasFlying) flew += 1;
        wasFlying = flying;
        // 마지막 슛이 닿기 전엔 골도, 당첨 표시도 없다.
        expect(goals(r.container)).toHaveLength(0);
        expect(winZones(r.container)).toHaveLength(0);
      }
      expect(flew).toBe(3);
      expect(seen).toContain('뻥!');
      expect(seen).toContain('1번째 슛 — 도움닫기!');
      expect(seen).toContain('마지막 키커 — 숨을 고르고…');
      expect(onSpinEnd).not.toHaveBeenCalled();

      tick(7_200 - plan.shots[2].impactMs + 200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(goals(r.container)).toEqual([`가게${winner + 1}`]);
      expect(winZones(r.container)).toEqual([`가게${winner + 1}`]);
      expect(r.container.querySelector('.penalty__zone--win .penalty__tag')?.textContent).toBe(`가게${winner + 1}`);
      expect(r.container.querySelector('.penalty__ball--in')).not.toBeNull();
      expect(status(r.container)).toMatch(new RegExp(`가게${winner + 1}`));
      // 컷신·날아가는 공은 남지 않는다.
      expect(r.container.querySelector('.penalty__cut')).toBeNull();
      expect(r.container.querySelector('.penalty__ball--fly')).toBeNull();
      r.unmount();
    }
  }, 30_000); // 시드 여러 개 × 2~20곳을 끝까지 돌린다. 다른 테스트와 같이 돌면 기본 5초를 넘긴다(10/15).

  it('사건이 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k += 1) {
      const n = k % 3 === 0 ? 2 : k % 3 === 1 ? 15 : 7;
      const winner = (k * 5) % n;
      const onSpinEnd = vi.fn();
      const r = render(<Penalty candidates={places(n)} winnerIndex={winner} spinning run={700 + k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t < 7_300; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s.startsWith('선방!')) seen.add('save');
        if (s.startsWith('깡!')) seen.add('post');
        if (s.startsWith('홈런')) seen.add('over');
        if (s.startsWith('골키퍼가 잡았어요')) seen.add('catch');
        if (s.startsWith('아깝다! 크로스바')) seen.add('bar');
        if (s.startsWith('파넨카')) seen.add('panenka');
        if (s.startsWith('손끝을 스치고')) seen.add('late');
        if (s.startsWith('골!!!')) seen.add('goal');
        // 아깝다 사건 동안엔 당첨 표시가 없다.
        if (onSpinEnd.mock.calls.length === 0 && /선방|깡|홈런|잡았어요|크로스바/.test(s)) expect(winZones(r.container)).toHaveLength(0);
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(winZones(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const e of ['save', 'post', 'over', 'catch', 'bar', 'goal', 'late']) expect(seen, e).toContain(e);
  }, 30_000); // 시드 여러 개 × 2~20곳을 끝까지 돌린다. 다른 테스트와 같이 돌면 기본 5초를 넘긴다(10/15).

  it('골대 — 깡! 불꽃이 튀고 노린 구역이 잠깐 빛난다(당첨 아님)', () => {
    const n = 9;
    let run = 0;
    let plan = penaltyPlan(n, 4, seededRandom(run))!;
    while (!plan.shots.some((s) => s.kind === 'post')) plan = penaltyPlan(n, 4, seededRandom(++run))!;
    const shot = plan.shots.find((s) => s.kind === 'post')!;
    const r = render(<Penalty candidates={places(n)} winnerIndex={4} spinning run={run} onSpinEnd={() => {}} />);
    act(() => { vi.advanceTimersByTime(shot.impactMs + 10); });
    expect(r.container.querySelector('.penalty__spark')).not.toBeNull();
    expect(r.container.querySelector('.penalty__callout')?.textContent).toBe('깡!');
    expect(r.container.querySelector('.penalty__zone--near')?.getAttribute('title')).toBe(`가게${shot.aim + 1}`);
    expect(shot.aim).not.toBe(4);
    expect(r.container.querySelector('.penalty__ball--post')).not.toBeNull();
  });

  it('마지막 슛은 슬로모션 — 위아래 검은 띠와 느린 화면 표시', () => {
    const plan = penaltyPlan(6, 2, seededRandom(9))!;
    const r = render(<Penalty candidates={places(6)} winnerIndex={2} spinning run={9} onSpinEnd={() => {}} />);
    act(() => { vi.advanceTimersByTime(plan.shots[2].flyMs + 10); });
    expect(r.container.querySelector('.penalty__ball--slow')).not.toBeNull();
    expect(r.container.querySelectorAll('.penalty__fx .penalty__bar')).toHaveLength(2);
    expect(r.container.querySelector('.penalty__slow')?.textContent).toBe('느린 화면');
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Penalty candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1_000);
    r.unmount();
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Penalty {...props} spinning />);
    tick(1_000);
    r.rerender(<Penalty {...props} spinning={false} />);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 처음부터 다시 찬다 — 같은 곳이 연달아 당첨돼도', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Penalty {...props} winnerIndex={1} spinning run={1} />);
    tick(7_300);
    r.rerender(<Penalty {...props} winnerIndex={1} spinning={false} run={1} />);
    // 끝난 판을 다시 그려도(크게 보기 전환 등) 골망에 꽂힌 모습 그대로.
    expect(winZones(r.container)).toEqual(['가게2']);
    r.rerender(<Penalty {...props} winnerIndex={1} spinning run={2} />);
    expect(winZones(r.container)).toHaveLength(0);
    expect(r.container.querySelector('.penalty__cut')).not.toBeNull();
    tick(7_300);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(winZones(r.container)).toEqual(['가게2']);
  });

  it('움직임 줄이기면 차는 장면 없이 골망에 꽂힌 모습을 바로 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Penalty candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.penalty__cut')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(winZones(r.container)).toEqual(['가게6']);
    expect(r.container.querySelector('.penalty__ball--in')).not.toBeNull();
  });

  it('한 곳뿐이면 사건 없이 바로 골', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Penalty candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.penalty__cut')).toBeNull();
    expect(winZones(r.container)).toEqual(['가게1']);
    expect(status(r.container)).toBe('골!!! 가게1 골망을 흔들었어요');
  });

  it('끝난 판을 새로 그리면(크게 보기 전환) 차는 장면 없이 골 장면 그대로', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Penalty candidates={places(9)} winnerIndex={6} spinning={false} run={42} onSpinEnd={onSpinEnd} expanded />);
    expect(r.container.querySelector('.penalty--settled')).not.toBeNull();
    expect(r.container.querySelector('.penalty--big')).not.toBeNull();
    expect(r.container.querySelector('.penalty__cut')).toBeNull();
    expect(winZones(r.container)).toEqual(['가게7']);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('긴 이름은 구역에서 줄이고, 당첨되면 전체 이름을 보인다', () => {
    const ps = places(15).map((p, i) => (i === 3 ? { ...p, name: '할머니 손맛 김치찌개 본점' } : p));
    const r = render(<Penalty candidates={ps} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    const tag = r.container.querySelector('.penalty__zone[title="할머니 손맛 김치찌개 본점"] .penalty__tag')!;
    expect(tag.textContent!.endsWith('…')).toBe(true);
    expect(tag.textContent!.length).toBeLessThanOrEqual(5);
    r.rerender(<Penalty candidates={ps} winnerIndex={3} spinning={false} run={8} onSpinEnd={() => {}} />);
    expect(r.container.querySelector('.penalty__zone--win .penalty__tag')?.textContent).toBe('할머니 손맛 김치찌개 본점');
    expect(r.container.querySelector('.penalty__banner')?.textContent).toContain('할머니 손맛 김치찌개 본점');
  });

  it('차기 전에는 골문과 구역만 있다', () => {
    const r = render(<Penalty candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelectorAll('.penalty__zone')).toHaveLength(4);
    expect(r.container.querySelector('.penalty__cut')).toBeNull();
    expect(winZones(r.container)).toHaveLength(0);
    expect(status(r.container)).toBe('구역 4개 — 골망을 흔들면 당첨!');
  });

  it('분위기(계절·날씨)가 변해도 당첨 구역이 바뀌지 않는다', () => {
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
      const r = render(<Penalty candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);

      const plan = penaltyPlan(n, winner, seededRandom(run))!;
      for (let t = 0; t < plan.endMs + 500; t += 50) {
        tick(50);
      }

      // 모든 분위기에서 동일한 당첨자.
      expect(winZones(r.container)).toEqual([`가게${winner + 1}`]);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();

      vi.doUnmock('../../hooks/useAmbience');
    }
  });
});
