// @vitest-environment jsdom
/**
 * 보물찾기 — App 이 정한 당첨 X 에서만 진짜 보물 상자가 열리고, 끝나면 onSpinEnd 를 한 번 부른다.
 * 앞 구덩이의 사건(꽝·장화·동전 한 닢·미믹·앵무새·돌풍·꽃게)은 당첨을 바꾸지 않는다. 움직임 줄이기·한 곳뿐이면 바로 결과.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { treasureLayout, treasurePlan } from '../../lib/treasure';
import { seededRandom } from '../../lib/random';
import { Treasure } from './Treasure';

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

/** 컴포넌트와 같은 시드로 일정을 다시 만든다. */
const planFor = (n: number, winner: number, run: number) => treasurePlan(treasureLayout(n, seededRandom(23 + n)), winner, seededRandom(run))!;

const status = (c: HTMLElement) => c.querySelector('.treasure__status')?.textContent ?? '';
const winSpots = (c: HTMLElement) => [...c.querySelectorAll('.treasure__spot--win')].map((e) => e.getAttribute('title'));
/** 진짜 보물 상자가 있는 X. */
const treasures = (c: HTMLElement) =>
  [...c.querySelectorAll('.treasure__chest--treasure')].map((e) => e.closest('.treasure__spot')?.getAttribute('title'));
const openTreasures = (c: HTMLElement) =>
  [...c.querySelectorAll('.treasure__chest--treasure.treasure__chest--open')].map((e) => e.closest('.treasure__spot')?.getAttribute('title'));

describe('보물찾기', () => {
  it('지도가 펼쳐지고 → 가짜 구덩이를 판 뒤 → 마지막에 당첨 X 에서만 보물 상자가 열린다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [3, 2], [5, 2], [10, 9], [15, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const run = n * 31 + winner;
      const r = render(<Treasure candidates={places(n)} winnerIndex={winner} spinning run={run} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.treasure__spot')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      // 인트로가 바로 뜬다(run 을 이번 판으로 바꾸지 않으면 인트로도 없다).
      expect(r.container.querySelector('.treasure__range--intro')).not.toBeNull();
      expect(status(r.container)).toBe('보물 지도를 펼쳐요…');

      const plan = planFor(n, winner, run);
      const last = plan.digs.at(-1)!;
      const seen = new Set<string>();
      for (let t = 0; t < last.revealMs - 60; t += 50) {
        tick(50);
        seen.add(status(r.container));
        // 마지막 구덩이에서 상자가 솟기 전엔 보물 상자도, 당첨 표시도 없다.
        expect(treasures(r.container)).toHaveLength(0);
        expect(winSpots(r.container)).toHaveLength(0);
        // 마지막 구덩이를 파기 전까지 당첨 X 는 손대지 않는다.
        const dug = [...r.container.querySelectorAll('.treasure__spot--dug')].map((e) => e.getAttribute('title'));
        if (t + 50 < last.digMs) expect(dug).not.toContain(`가게${winner + 1}`);
        else expect(dug).toContain(`가게${winner + 1}`);
      }
      expect([...seen].some((s) => s.startsWith('파바박!'))).toBe(true);
      expect(onSpinEnd).not.toHaveBeenCalled();
      // 가짜 구덩이(두 곳이면 하나, 그 위로 둘)와 지금 파는 당첨 X.
      expect(r.container.querySelectorAll('.treasure__spot--dug')).toHaveLength(n >= 3 ? 3 : 2);

      tick(7_300 - last.revealMs);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(treasures(r.container)).toEqual([`가게${winner + 1}`]);
      expect(openTreasures(r.container)).toEqual([`가게${winner + 1}`]);
      expect(winSpots(r.container)).toEqual([`가게${winner + 1}`]);
      expect(status(r.container)).toBe(`보물 발견! 가게${winner + 1}`);
      // 끝 장면엔 당첨 이름표가 줄이지 않은 전체 이름이다.
      expect(r.container.querySelector('.treasure__spot--win .treasure__tag')?.textContent).toBe(`가게${winner + 1}`);
      r.unmount();
    }
  });

  it('사건이 판마다 달리 나오고, 무엇이 나와도 당첨은 그대로다', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 30; k += 1) {
      const n = k % 3 === 0 ? 2 : 2 + (k % 13);
      const winner = (k * 7) % n;
      const onSpinEnd = vi.fn();
      const r = render(<Treasure candidates={places(n)} winnerIndex={winner} spinning run={700 + k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t < 7_300; t += 50) {
        tick(50);
        const s = status(r.container);
        if (s === '앵무새: 저기예요!') seen.add('parrot');
        if (s.startsWith('휘잉~')) seen.add('gust');
        if (s.startsWith('아야!')) seen.add('crab');
        if (s.startsWith('어라')) seen.add('deep');
        if (s.startsWith('꽝!')) seen.add('empty');
        if (s.startsWith('낡은 장화')) seen.add('boot');
        if (s.startsWith('동전 한 닢')) seen.add('coin');
        if (s === '앗, 미믹이에요!') seen.add('mimic');
        // 아깝다(동전 한 닢·미믹) 상자가 나와도 당첨 표시는 마지막에만.
        if (onSpinEnd.mock.calls.length === 0 && (s.startsWith('동전') || s.startsWith('앗'))) {
          expect(winSpots(r.container)).toHaveLength(0);
          expect(treasures(r.container)).toHaveLength(0);
        }
        // 앵무새가 가리킨 X 는 당첨이 아니다.
        const hint = r.container.querySelector('.treasure__spot--hint');
        if (hint) expect(hint.getAttribute('title')).not.toBe(`가게${winner + 1}`);
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(openTreasures(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const e of ['parrot', 'gust', 'crab', 'deep', 'empty', 'boot', 'coin', 'mimic']) expect(seen, e).toContain(e);
  }, 30_000); // 시드 여러 개 × 2~20곳을 끝까지 돌린다. 다른 테스트와 같이 돌면 기본 5초를 넘긴다(10/15).

  it('후보 2~20곳, 판 번호 여럿 — 끝 장면의 보물은 언제나 App 이 정한 당첨', () => {
    for (let n = 2; n <= 20; n += 1)
      for (const seed of [1, 77, 4242]) {
        const winner = (seed * 13 + n) % n;
        const onSpinEnd = vi.fn();
        const r = render(<Treasure candidates={places(n)} winnerIndex={winner} spinning run={seed * 1000 + n} onSpinEnd={onSpinEnd} />);
        const plan = planFor(n, winner, seed * 1000 + n);
        act(() => { vi.advanceTimersByTime(plan.endMs - 1); });
        expect(onSpinEnd).not.toHaveBeenCalled();
        act(() => { vi.advanceTimersByTime(1); });
        expect(onSpinEnd).toHaveBeenCalledTimes(1);
        expect(openTreasures(r.container)).toEqual([`가게${winner + 1}`]);
        expect(winSpots(r.container)).toEqual([`가게${winner + 1}`]);
        act(() => { vi.advanceTimersByTime(5_000); });
        expect(onSpinEnd).toHaveBeenCalledTimes(1);
        r.unmount();
      }
  });

  it('미믹 — 상자가 솟아 덥석 물지만 당첨이 아니다', () => {
    const n = 6;
    let run = 0;
    let plan = planFor(n, 2, run);
    while (!plan.digs.some((d) => d.kind === 'mimic')) plan = planFor(n, 2, ++run);
    const dig = plan.digs.find((d) => d.kind === 'mimic')!;
    const r = render(<Treasure candidates={places(n)} winnerIndex={2} spinning run={run} onSpinEnd={() => {}} />);
    act(() => { vi.advanceTimersByTime(dig.revealMs + 10); });
    expect(status(r.container)).toBe('앗, 미믹이에요!');
    expect(r.container.querySelector('.treasure__callout')?.textContent).toBe('덥석!');
    const mimic = r.container.querySelector('.treasure__chest--mimic.treasure__chest--live');
    expect(mimic?.closest('.treasure__spot')?.getAttribute('title')).toBe(`가게${dig.spot + 1}`);
    expect(dig.spot).not.toBe(2);
    expect(r.container.querySelector('.treasure__pirate--startle')).not.toBeNull();
  });

  it('돌풍 — 바람 줄이 흐르고 지도가 흔들린 뒤 카메라가 해적을 다시 잡는다', () => {
    const n = 8;
    let run = 0;
    let plan = planFor(n, 5, run);
    while (!plan.digs.some((d) => d.gust)) plan = planFor(n, 5, ++run);
    const dig = plan.digs.find((d) => d.gust)!;
    const gustAt = dig.phases.find((p) => p.phase === 'gust')!.ms;
    const r = render(<Treasure candidates={places(n)} winnerIndex={5} spinning run={run} onSpinEnd={() => {}} />);
    act(() => { vi.advanceTimersByTime(gustAt + 10); });
    expect(r.container.querySelector('.treasure__wind')).not.toBeNull();
    expect(r.container.querySelector('.treasure__world--gust')).not.toBeNull();
    expect(status(r.container)).toBe('휘잉~ 바람에 지도가 날아가요!');
    act(() => { vi.advanceTimersByTime(dig.walkMs - gustAt); });
    expect(r.container.querySelector('.treasure__wind')).toBeNull();
    expect(r.container.querySelector('.treasure__world--walk')).not.toBeNull();
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Treasure candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    tick(1_000);
    r.unmount();
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Treasure {...props} spinning />);
    tick(1_000);
    r.rerender(<Treasure {...props} spinning={false} />);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 구덩이를 메우고 처음부터 다시 판다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Treasure {...props} winnerIndex={1} spinning run={1} />);
    tick(7_300);
    r.rerender(<Treasure {...props} winnerIndex={1} spinning={false} run={1} />);
    // 끝난 판을 다시 그려도(크게 보기 전환 등) 열린 보물 상자 그대로.
    expect(openTreasures(r.container)).toEqual(['가게2']);
    r.rerender(<Treasure {...props} winnerIndex={4} spinning run={2} />);
    expect(r.container.querySelectorAll('.treasure__spot--dug')).toHaveLength(0);
    expect(r.container.querySelectorAll('.treasure__chest')).toHaveLength(0);
    expect(status(r.container)).toBe('보물 지도를 펼쳐요…');
    tick(7_300);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(openTreasures(r.container)).toEqual(['가게5']);
  });

  it('움직임 줄이기면 파는 장면 없이 열린 보물 상자를 바로 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Treasure candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    expect(r.container.querySelector('.treasure__range--intro')).toBeNull();
    expect(r.container.querySelector('.treasure__callout')).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(openTreasures(r.container)).toEqual(['가게6']);
    expect(winSpots(r.container)).toEqual(['가게6']);
  });

  it('한 곳뿐이면 사건 없이 바로 보물', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Treasure candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.treasure__range--intro')).toBeNull();
    expect(openTreasures(r.container)).toEqual(['가게1']);
    expect(status(r.container)).toBe('보물 발견! 가게1');
  });

  it('끝난 판을 새로 그리면(크게 보기 전환) 파는 장면 없이 열린 보물 그대로', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Treasure candidates={places(9)} winnerIndex={6} spinning={false} run={42} onSpinEnd={onSpinEnd} expanded />);
    expect(r.container.querySelector('.treasure--settled')).not.toBeNull();
    expect(r.container.querySelector('.treasure--big')).not.toBeNull();
    expect(r.container.querySelector('.treasure__range--intro')).toBeNull();
    expect(openTreasures(r.container)).toEqual(['가게7']);
    tick(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('돌리기 전에는 X 표시만 있다', () => {
    const r = render(<Treasure candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelectorAll('.treasure__spot')).toHaveLength(4);
    expect(r.container.querySelectorAll('.treasure__spot--dug')).toHaveLength(0);
    expect(r.container.querySelectorAll('.treasure__chest')).toHaveLength(0);
    expect(status(r.container)).toBe('X 표시 4곳 — 보물은 딱 한 곳!');
  });

  it('긴 이름은 지도에서 줄이고 title 에 전체 이름을 남긴다', () => {
    const long = places(15).map((p, i) => ({ ...p, name: `아주아주 긴 가게 이름 ${i + 1}` }));
    const r = render(<Treasure candidates={long} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    const tag = r.container.querySelector('.treasure__tag')?.textContent ?? '';
    expect(tag.endsWith('…')).toBe(true);
    expect(tag.length).toBeLessThanOrEqual(6);
    expect(r.container.querySelector('.treasure__spot')?.getAttribute('title')).toBe('아주아주 긴 가게 이름 1');
  });

  it('상자를 열면 보물이 도감에 들고, 당첨 X 는 그대로다', () => {
    localStorage.clear();
    const onSpinEnd = vi.fn();
    const r = render(<Treasure candidates={places(5)} winnerIndex={2} spinning run={4} onSpinEnd={onSpinEnd} />);
    tick(planFor(5, 2, 4).endMs + 100);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(openTreasures(r.container)).toEqual(['가게3']);
    const dex = JSON.parse(localStorage.getItem('lunch-app:treasure-dex') ?? '{}').found as string[];
    expect(dex.length).toBeGreaterThan(0);
    // 끝 장면에 찾은 보물 이름과 처음 찾은 소식이 보인다.
    expect(r.container.querySelector('.treasure__found')?.textContent).toBeTruthy();
    expect(r.container.querySelector('.treasure__news')?.textContent).toMatch(/새 보물/);
  });
});
