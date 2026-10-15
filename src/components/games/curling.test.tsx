// @vitest-environment jsdom
/**
 * 컬링 화면. App 이 정한 당첨 스톤이 끝에 버튼에 가장 가까이 멈춰 반짝이고, onSpinEnd 를 한 번 부른다.
 * 움직임 줄이기면 바로 끝 장면, 언마운트·spinning 꺼짐·다음 판이면 타이머가 멈춘다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { curlingPlan } from '../../lib/curling';
import { seededRandom } from '../../lib/random';
import { Curling } from './Curling';

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
  for (let t = 0; t < ms; t += 50)
    act(() => {
      vi.advanceTimersByTime(50);
    });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `가게${i + 1}`,
    category: i % 2 ? '한식' : '중식',
    lat: 0,
    lng: 0,
    walkMin: 5,
    kakaoPlaceId: `k${i}`,
    active: true,
    createdBy: 'test',
  }));

const won = (c: HTMLElement) => [...c.querySelectorAll('.curling__stone--win')].map((e) => e.getAttribute('title'));
const status = (c: HTMLElement) => c.querySelector('.curling__status')?.textContent ?? '';
/** 화면 % 좌표를 시트 단위로(가로 100, 세로 SHEET_L=120). */
const at = (el: Element) => {
  const s = (el as HTMLElement).style;
  return { x: parseFloat(s.left), y: (parseFloat(s.top) * 120) / 100 };
};
const BUTTON = { x: 50, y: 36 };
const d = (p: { x: number; y: number }) => Math.hypot(p.x - BUTTON.x, p.y - BUTTON.y);

describe('컬링', () => {
  it('스톤이 미끄러져 부딪치고, 끝엔 당첨 스톤이 버튼에 가장 가까이 멈춰 반짝인다', () => {
    for (const [n, winner, r] of [
      [2, 0, 1],
      [2, 1, 2],
      [5, 2, 3],
      [9, 8, 4],
      [15, 0, 5],
      [15, 11, 6],
      [20, 7, 7],
    ]) {
      const onSpinEnd = vi.fn();
      const c = render(
        <Curling candidates={places(n)} winnerIndex={winner} spinning run={r} onSpinEnd={onSpinEnd} />,
      ).container;
      expect(c.querySelectorAll('.curling__stone:not(.curling__stone--ours)')).toHaveLength(n);
      expect(c.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      const plan = curlingPlan(n, winner, seededRandom(r))!;
      const seen = new Set<string>();
      let sweepers = 0;
      for (let t = 0; t < plan.revealMs - 100; t += 50) {
        run(50);
        seen.add(status(c));
        sweepers = Math.max(sweepers, c.querySelectorAll('.curling__sweeper').length);
        expect(won(c)).toHaveLength(0);
      }
      expect([...seen].some((s) => /번째 스톤이 미끄러져요|마지막 스톤이 미끄러져요/.test(s))).toBe(true);
      expect(seen).toContain('닦아요! 닦아요!');
      expect(sweepers).toBe(2);
      expect(onSpinEnd).not.toHaveBeenCalled();
      run(plan.endMs - plan.revealMs + 200);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(won(c)).toEqual([`가게${winner + 1}`]);
      expect(status(c)).toMatch(new RegExp(`^가게${winner + 1}(이|가) 버튼에 제일 가까워요!$`));
      // 화면에서도 당첨 스톤이 가장 가깝다.
      const stones = [...c.querySelectorAll('.curling__stone:not(.curling__stone--ours)')];
      const dw = d(at(stones[winner]));
      stones.forEach((s, i) => {
        if (i !== winner) expect(d(at(s))).toBeGreaterThan(dw);
      });
      // 우리 스톤(던진 수만큼)이 시트 위에 있다.
      expect(c.querySelectorAll('.curling__stone--ours')).toHaveLength(plan.throws);
      run(3_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      cleanup();
    }
  }, 30_000);

  it('간발의 차면 "측정 중…" 테이프가 2등·당첨 차례로 펴지고, 숫자를 상태 줄에 보인다', () => {
    let measured = 0;
    for (let r = 0; r < 30 && measured < 3; r += 1) {
      const plan = curlingPlan(6, r % 6, seededRandom(r))!;
      if (!plan.measure) continue;
      measured += 1;
      const c = render(
        <Curling candidates={places(6)} winnerIndex={r % 6} spinning run={r} onSpinEnd={() => {}} />,
      ).container;
      run(plan.measure.startMs + 100);
      expect(status(c)).toMatch(/^측정 중…/);
      expect(c.querySelector('.curling__tape')).not.toBeNull();
      expect(c.querySelectorAll('.curling__stone--measured')).toHaveLength(2);
      run(plan.measure.endMs - plan.measure.startMs - 200);
      expect(status(c)).toMatch(/^측정 중… \d+\.\dcm vs \d+\.\dcm$/);
      expect(c.querySelectorAll('.curling__tape')).toHaveLength(2);
      // 버튼 위쪽 2등 이름표는 스톤 위에 달린다(버튼·테이프와 겹치지 않게).
      const ups = [...c.querySelectorAll('.curling__stone--tagUp')].map((e) => e.getAttribute('title'));
      expect(ups).toEqual(plan.tagUp.map((i) => `가게${i + 1}`));
      expect(plan.tagUp).toContain(plan.measure.runner);
      run(400);
      expect(won(c)).toEqual([`가게${(r % 6) + 1}`]);
      cleanup();
    }
    expect(measured).toBe(3);
  }, 30_000);

  it('부딪치면 "탕!" 이 뜬다', () => {
    const r = [...Array(40).keys()].find((k) =>
      curlingPlan(7, 1, seededRandom(k))!.events.some((e) => e.kind === 'hit'),
    )!;
    const plan = curlingPlan(7, 1, seededRandom(r))!;
    const hit = plan.events.find((e) => e.kind === 'hit')!;
    const c = render(
      <Curling candidates={places(7)} winnerIndex={1} spinning run={r} onSpinEnd={() => {}} />,
    ).container;
    run(hit.t + 50);
    expect(c.querySelector('.curling__burst')?.textContent).toBe('탕!');
    expect(status(c)).toBe('탕! 테이크아웃!');
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Curling candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    run(1_000);
    r.unmount();
    run(9_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Curling {...props} spinning />);
    run(1_000);
    r.rerender(<Curling {...props} spinning={false} />);
    run(9_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 스톤을 새로 놓고 다시 시작한다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Curling {...props} winnerIndex={1} spinning run={1} />);
    run(8_000);
    r.rerender(<Curling {...props} winnerIndex={1} spinning={false} run={1} />);
    // 끝난 판을 다시 그려도(크게 보기 전환 등) 끝 장면이다.
    expect(won(r.container)).toEqual(['가게2']);
    r.rerender(<Curling {...props} winnerIndex={4} spinning run={2} />);
    expect(won(r.container)).toHaveLength(0);
    expect(r.container.querySelectorAll('.curling__stone--ours')).toHaveLength(0);
    run(8_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(won(r.container)).toEqual(['가게5']);
  });

  it('움직임 줄이기면 바로 끝 장면을 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Curling candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(won(r.container)).toEqual(['가게6']);
    expect(status(r.container)).toBe('가게6이 버튼에 제일 가까워요!');
    expect(r.container.querySelector('.curling__sweeper')).toBeNull();
  });

  it('한 곳뿐이면 버튼 위 스톤 하나로 바로 끝난다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Curling candidates={places(1)} winnerIndex={0} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(won(r.container)).toEqual(['가게1']);
  });

  it('돌리기 전엔 스톤만 하우스 둘레에 놓여 있다', () => {
    const r = render(
      <Curling candidates={places(9)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />,
    );
    expect(r.container.querySelectorAll('.curling__stone')).toHaveLength(9);
    expect(status(r.container)).toBe('스톤 9개가 하우스를 노려요');
    expect(won(r.container)).toHaveLength(0);
  });
});
