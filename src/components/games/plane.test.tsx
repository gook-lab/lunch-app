// @vitest-environment jsdom
/**
 * 종이비행기 — App 이 정한 당첨 비행기만 점심 테이블에 내려앉고, 나머지는 하나씩 떨어진다.
 * 끝나면 onSpinEnd 를 한 번 부른다. 움직임 줄이기면 바로 마지막 장면을 보여 준다.
 * jsdom 엔 element.animate 가 없어 비행기는 장면마다 뛰어 옮겨 간다 — 여기선 장면 순서·클래스·문구를 본다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { planePlan } from '../../lib/plane';
import { seededRandom } from '../../lib/random';
import { PaperPlane } from './PaperPlane';

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
  for (let t = 0; t < ms; t += 50) act(() => { vi.advanceTimersByTime(50); });
};

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`, name: `가게${i + 1}`, category: i % 2 ? '한식' : '중식', lat: 0, lng: 0, walkMin: 5,
    kakaoPlaceId: `k${i}`, active: true, createdBy: 'test',
  }));

const winLanes = (c: HTMLElement) => [...c.querySelectorAll('.plane__lane--win')].map((e) => e.getAttribute('title'));
const outLanes = (c: HTMLElement) => c.querySelectorAll('.plane__lane--out').length;
const status = (c: HTMLElement) => c.querySelector('.plane__status')?.textContent;

describe('종이비행기', () => {
  it('하나씩 떨어지다 당첨 비행기만 점심 테이블에 내려앉는다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 2], [10, 9], [15, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const r = render(<PaperPlane candidates={places(n)} winnerIndex={winner} spinning run={n * 31 + winner} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.plane__craft')).toHaveLength(n);
      expect(r.container.querySelectorAll('.plane__lane')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      expect(status(r.container)).toBe('하나, 둘, 셋 — 날려요!');
      let prevOut = 0;
      for (let t = 0; t < 4_900; t += 50) {
        run(50);
        // 탈락은 늘기만 하고, 당첨 레인은 떨어지지 않는다.
        const out = outLanes(r.container);
        expect(out).toBeGreaterThanOrEqual(prevOut);
        prevOut = out;
        expect(r.container.querySelectorAll('.plane__lane')[winner].classList.contains('plane__lane--out')).toBe(false);
        expect(winLanes(r.container)).toHaveLength(0);
      }
      expect(onSpinEnd).not.toHaveBeenCalled();
      run(1_600);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(outLanes(r.container)).toBe(n - 1);
      expect(winLanes(r.container)).toEqual([`가게${winner + 1}`]);
      expect(r.container.querySelectorAll('.plane__craft--win')).toHaveLength(1);
      expect(status(r.container)).toMatch(new RegExp(`^가게${winner + 1}(이|가) 점심 테이블에 착륙했어요!$`));
      run(2_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      r.unmount();
    }
  });

  it('사건 문구가 판마다 나온다 — 그래도 당첨은 그대로', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 16; k += 1) {
      const n = 3 + (k % 6);
      const winner = k % n;
      const onSpinEnd = vi.fn();
      const r = render(<PaperPlane candidates={places(n)} winnerIndex={winner} spinning run={500 + k} onSpinEnd={onSpinEnd} />);
      for (let t = 0; t < 6_500; t += 50) {
        run(50);
        const s = status(r.container) ?? '';
        if (/바람이 불어요/.test(s)) seen.add('gust');
        if (/공중제비/.test(s)) seen.add('loop');
        if (/비둘기/.test(s)) seen.add('pigeon');
        if (/유리창에 쾅/.test(s)) seen.add('window');
        if (/빙글빙글/.test(s)) seen.add('spiral');
        if (/^아깝다!/.test(s)) seen.add('bounce');
        if (/에어컨 바람/.test(s)) seen.add('updraft');
        if (s.endsWith('떨어진다…!')) seen.add('dip');
      }
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(winLanes(r.container)).toEqual([`가게${winner + 1}`]);
      r.unmount();
    }
    for (const k of ['gust', 'loop', 'pigeon', 'window', 'spiral', 'bounce', 'updraft', 'dip']) expect(seen, k).toContain(k);
  });

  it('유리창·비둘기는 그 비행기가 떨어지기 전에 나타난다, 구겨진 비행기는 종이 뭉치가 된다', () => {
    // 유리창과 비둘기가 같이 나오는 판을 찾는다.
    let seed = 0;
    for (; seed < 500; seed += 1) {
      const p = planePlan(8, 2, seededRandom(seed))!;
      if (p.tracks.some((t) => t.fate === 'window') && p.tracks.some((t) => t.fate === 'pigeon')) break;
    }
    const plan = planePlan(8, 2, seededRandom(seed))!;
    const win = plan.tracks.findIndex((t) => t.fate === 'window');
    const pig = plan.tracks.findIndex((t) => t.fate === 'pigeon');
    const r = render(<PaperPlane candidates={places(8)} winnerIndex={2} spinning run={seed} onSpinEnd={() => {}} />);
    const firstWin = Math.min(plan.tracks[win].downMs, plan.tracks[pig].downMs);
    run(firstWin - 650);
    let sawWindow = false;
    let sawPigeon = false;
    for (let t = 0; t < 4_000; t += 50) {
      run(50);
      if (r.container.querySelector('.plane__window')) sawWindow = true;
      if (r.container.querySelector('.plane__pigeon')) sawPigeon = true;
    }
    expect(sawWindow).toBe(true);
    expect(sawPigeon).toBe(true);
    expect(r.container.querySelector('.plane__window--cracked')).not.toBeNull();
    const crafts = r.container.querySelectorAll('.plane__craft');
    expect(crafts[win].classList.contains('plane__craft--crumpled')).toBe(true);
    expect(crafts[pig].classList.contains('plane__craft--crumpled')).toBe(true);
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<PaperPlane candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    run(1_000);
    r.unmount();
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<PaperPlane {...props} spinning />);
    run(1_000);
    r.rerender(<PaperPlane {...props} spinning={false} />);
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 비행기를 책상에 돌려놓고 다시 날린다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<PaperPlane {...props} winnerIndex={1} spinning run={1} />);
    run(7_000);
    r.rerender(<PaperPlane {...props} winnerIndex={1} spinning={false} run={1} />);
    expect(winLanes(r.container)).toEqual(['가게2']);
    r.rerender(<PaperPlane {...props} winnerIndex={4} spinning run={2} />);
    expect(winLanes(r.container)).toHaveLength(0);
    expect(outLanes(r.container)).toBe(0);
    expect(status(r.container)).toBe('하나, 둘, 셋 — 날려요!');
    run(7_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(winLanes(r.container)).toEqual(['가게5']);
  });

  it('끝난 판을 다시 그려도(크게 보기) 마지막 장면 그대로다', () => {
    const props = { candidates: places(5), winnerIndex: 0, run: 9, onSpinEnd: () => {} };
    const r = render(<PaperPlane {...props} spinning />);
    run(7_000);
    r.rerender(<PaperPlane {...props} spinning={false} expanded />);
    expect(r.container.querySelector('.plane--big')).not.toBeNull();
    expect(r.container.querySelector('.plane--settled')).toBeNull();
    expect(winLanes(r.container)).toEqual(['가게1']);
    // 판이 끝나 다른 판 번호가 와도(새로 그림) spinning 이 아니면 마지막 장면.
    r.unmount();
    const r2 = render(<PaperPlane {...props} spinning={false} />);
    expect(r2.container.querySelector('.plane--settled')).not.toBeNull();
    expect(winLanes(r2.container)).toEqual(['가게1']);
    expect(outLanes(r2.container)).toBe(4);
  });

  it('움직임 줄이기면 바로 내려앉은 모습을 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<PaperPlane candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(winLanes(r.container)).toEqual(['가게6']);
    expect(outLanes(r.container)).toBe(6);
    expect(status(r.container)).toBe('가게6이 점심 테이블에 착륙했어요!');
  });

  it('한 곳뿐이면 그 비행기가 곧장 내려앉는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<PaperPlane candidates={places(1)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(winLanes(r.container)).toEqual(['가게1']);
  });

  it('돌리기 전엔 비행기가 책상 위에서 기다린다', () => {
    const r = render(<PaperPlane candidates={places(4)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(status(r.container)).toBe('종이비행기 4대가 책상 위에서 기다려요');
    expect(r.container.querySelector('.plane--roomy')).not.toBeNull();
    const r2 = render(<PaperPlane candidates={places(12)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r2.container.querySelector('.plane--roomy')).toBeNull();
  });
});
