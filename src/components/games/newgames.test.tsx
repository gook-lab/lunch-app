// @vitest-environment jsdom
/**
 * 뽑기 기계 · 플링코 · 주사위 · 폭탄 · 풍선 · 낚시. 모두 App 이 정한 당첨을 보여 주기만 하고, 끝나면
 * onSpinEnd 를 한 번 부른다. 움직임 줄이기면 바로 결과를 보여 준다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Balloon } from './Balloon';
import { Bomb } from './Bomb';
import { Dice } from './Dice';
import { Fishing } from './Fishing';
import { Gacha, MAX_CAPSULES } from './Gacha';
import { Plinko } from './Plinko';

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

/** 이름이 긴 후보. 잘림을 확인할 때 쓴다. */
const longPlaces = (n: number): Place[] =>
  places(n).map((p, i) => ({ ...p, name: `할머니 김치찌개${i + 1}` }));

describe('뽑기 기계', () => {
  it('흔들고 떨어뜨린 뒤 당첨 캡슐을 연다', () => {
    for (const n of [1, 5, 20]) {
      const winner = n - 1;
      const onSpinEnd = vi.fn();
      const r = render(<Gacha candidates={places(n)} winnerIndex={winner} spinning run={n} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelector('.gacha--shake')).toBeTruthy();
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES));
      run(4_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(r.container.querySelector('.gacha__hint')?.textContent).toContain(`가게${n}`);
      // 나온 캡슐만큼 돔이 하나 줄었다.
      expect(r.container.querySelectorAll('.gacha__dome .gacha__capsule')).toHaveLength(Math.min(n, MAX_CAPSULES) - 1);
      r.unmount();
    }
  });

  it('20곳이 넘으면 나머지 수를 적는다', () => {
    const r = render(<Gacha candidates={places(26)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect(r.container.querySelector('.gacha__more')?.textContent).toBe('캡슐이 6개 더 있어요');
  });

  it('움직임 줄이기면 바로 연다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Gacha candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.gacha__hint')?.textContent).toContain('가게3');
  });
});

describe('플링코', () => {
  it('공은 당첨 칸에 들어간다', () => {
    for (const [n, winner] of [[1, 0], [5, 0], [5, 4], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const r = render(<Plinko candidates={places(n)} winnerIndex={winner} spinning run={n + winner} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.plinko__slot')).toHaveLength(n);
      expect(r.container.querySelectorAll('.plinko__pin')).toHaveLength((n * (n - 1)) / 2);
      run(5_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const wins = r.container.querySelectorAll('.plinko__slot--win');
      expect(wins).toHaveLength(1);
      expect(wins[0].getAttribute('title')).toBe(`가게${winner + 1}`);
      r.unmount();
    }
  });

  it('후보가 적어도 판은 칸 7개 폭 — 핀·공이 판을 꽉 채우지 않는다', () => {
    // 2곳이면 그림 폭이 48 이라 공이 7배로 불어나고 판이 폭보다 1.3배 길었다(리뷰 재현).
    const r = render(<Plinko candidates={places(2)} winnerIndex={1} spinning={false} run={1} onSpinEnd={() => {}} />);
    const vb = r.container.querySelector('.plinko__board')?.getAttribute('viewBox')?.split(' ').map(Number) ?? [];
    expect(vb[2]).toBe(168);
    // 판 폭 ÷ 높이(--fit)는 1 이상 — 크게 보기 폭 식이 이 값으로 높이에 맞춘다.
    const fit = Number((r.container.querySelector('.plinko') as HTMLElement).style.getPropertyValue('--fit'));
    expect(fit).toBeGreaterThan(1);
    // 당첨 칸(오른쪽) 가운데에 공이 선다.
    expect(Number(r.container.querySelector('.plinko__ball')?.getAttribute('cx'))).toBeCloseTo(126);
  });

  it('움직임 줄이기면 바로 칸을 보여 준다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Plinko candidates={places(5)} winnerIndex={3} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.plinko__slot--win')?.getAttribute('title')).toBe('가게4');
  });
});

describe('주사위', () => {
  it('말은 당첨 칸에 서고, 다음 판은 그 자리에서 출발한다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(10), onSpinEnd };
    const r = render(<Dice {...props} winnerIndex={7} spinning run={1} />);
    run(15_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    const here = r.container.querySelector('.dice__cell--here');
    expect(here?.getAttribute('title')).toBe('가게8');
    expect(here?.classList.contains('dice__cell--win')).toBe(true);
    r.rerender(<Dice {...props} winnerIndex={7} spinning={false} run={1} />);
    // 같은 칸이 당첨이면 한 바퀴를 돈다 — 첫 굴림 동안 말은 아직 출발점(8번)에 있다.
    r.rerender(<Dice {...props} winnerIndex={7} spinning run={2} />);
    expect(r.container.querySelector('.dice__cell--here')?.getAttribute('title')).toBe('가게8');
    run(15_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(r.container.querySelector('.dice__cell--win')?.getAttribute('title')).toBe('가게8');
  });

  it('후보 1·5·20곳 모두 끝나고, 상태 줄이 굴림을 센다', () => {
    for (const n of [1, 5, 20, 40]) {
      const onSpinEnd = vi.fn();
      const r = render(<Dice candidates={places(n)} winnerIndex={n - 1} spinning run={n} onSpinEnd={onSpinEnd} />);
      run(100);
      expect(r.container.querySelector('.dice__status')?.textContent).toMatch(/^1번째 (굴림|주사위)/);
      run(15_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      expect(r.container.querySelector('.dice__status')?.textContent).toBe(`가게${n} 칸에 도착했어요`);
      r.unmount();
    }
  });

  it('움직임 줄이기면 바로 도착한다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Dice candidates={places(6)} winnerIndex={4} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.dice__cell--win')?.getAttribute('title')).toBe('가게5');
  });
});

describe('주사위 이름 길이', () => {
  it('칸이 넓으면(후보 2곳·크게 보기) 이름을 다섯 자에서 자르지 않는다', () => {
    const r = render(<Dice candidates={longPlaces(2)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} expanded />);
    expect([...r.container.querySelectorAll('.dice__name')].map((e) => e.textContent)).toEqual([
      '할머니 김치찌개1',
      '할머니 김치찌개2',
    ]);
  });
});

/** 폭탄 그림의 위치(판 좌표). */
const bombXY = (c: HTMLElement) => {
  const m = (c.querySelector('.bomb__bomb') as HTMLElement).style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
  return [Number(m?.[1]), Number(m?.[2])];
};
/** 터질 때 기대 위치 — n 자리 중 i 번째(12시부터 시계 방향) 쪽으로 가운데(180)에서 30. */
const boomAt = (i: number, n: number) => {
  const a = (i / n) * 2 * Math.PI - Math.PI / 2;
  return [180 + 30 * Math.cos(a), 180 + 30 * Math.sin(a)];
};

describe('폭탄 돌리기', () => {
  it('폭탄은 당첨 자리에서 터진다', () => {
    for (const n of [2, 5, 10, 20]) {
      const winner = Math.floor(n / 2);
      const onSpinEnd = vi.fn();
      const r = render(<Bomb candidates={places(n)} winnerIndex={winner} spinning run={1} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.bomb__seat')).toHaveLength(n);
      run(7_500); // 폭탄이 돌아다니고 터지기까지의 충분한 시간
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const winSeat = r.container.querySelector('.bomb__seat--win');
      expect(winSeat).toBeTruthy();
      expect(winSeat?.querySelector('title')?.textContent).toBe(`가게${winner + 1}`);
      // 위 클래스는 폭탄 위치와 상관없이 winnerIndex 로 붙는다. 폭탄 자체가 당첨 자리 쪽에 있는지 본다.
      const [x, y] = bombXY(r.container);
      const [ex, ey] = boomAt(winner, n);
      expect(x).toBeCloseTo(ex, 3);
      expect(y).toBeCloseTo(ey, 3);
      r.unmount();
    }
  });

  it('지난 판보다 자리가 줄어도 있는 자리에서 출발한다(첫 자리 강조가 빠지지 않는다)', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Bomb candidates={places(10)} winnerIndex={9} spinning run={1} onSpinEnd={onSpinEnd} />);
    run(7_500);
    r.rerender(<Bomb candidates={places(10)} winnerIndex={9} spinning={false} run={1} onSpinEnd={onSpinEnd} />);
    r.rerender(<Bomb candidates={places(4)} winnerIndex={1} spinning run={2} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(0); });
    expect(r.container.querySelectorAll('.bomb__seat--hot')).toHaveLength(1);
    run(7_500);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(r.container.querySelector('.bomb__seat--win title')?.textContent).toBe('가게2');
  });

  it('터질 때는 판 가운데 쪽으로 옮겨 당첨 이름표를 덮지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Bomb candidates={places(7)} winnerIndex={0} spinning run={3} onSpinEnd={onSpinEnd} />);
    run(7_500);
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    // 12시 자리(이름표 y=48)에서 터져도 폭탄은 가운데(180)에서 30 안쪽이다. 거리만 보면 어느 자리든
    // 30 이라, 방향(12시 = 바로 위)까지 본다.
    const [x, y] = bombXY(r.container);
    expect(Math.hypot(x - 180, y - 180)).toBeLessThanOrEqual(31);
    expect(x).toBeCloseTo(180, 3);
    expect(y).toBeCloseTo(150, 3);
  });

  it('후보가 적으면 이름표를 넓혀 이름을 덜 자른다', () => {
    const r = render(<Bomb candidates={longPlaces(2)} winnerIndex={null} spinning={false} run={0} onSpinEnd={() => {}} />);
    expect([...r.container.querySelectorAll('.bomb__name')].map((e) => e.textContent)).toEqual([
      '할머니 김치찌개1',
      '할머니 김치찌개2',
    ]);
  });

  it('움직임 줄이기면 바로 당첨 자리를 보여 준다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Bomb candidates={places(5)} winnerIndex={2} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(r.container.querySelector('.bomb__seat--win title')?.textContent).toBe('가게3');
  });
});

describe('풍선 터뜨리기', () => {
  const left = (c: HTMLElement) => [...c.querySelectorAll('.balloon__item:not(.balloon__item--popped)')];

  it('당첨이 아닌 풍선이 다 터지고 당첨 하나만 남는다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 2], [10, 9], [20, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const r = render(<Balloon candidates={places(n)} winnerIndex={winner} spinning run={n * 31 + winner} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.balloon__item')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      run(1_000);
      // 연출이 실제로 움직인다(run 을 이번 판으로 바꾸지 않으면 여기서 멈춘다).
      if (n >= 10) expect(left(r.container).length).toBeLessThan(n);
      expect(r.container.querySelector('.balloon__status')?.textContent).toMatch(/^풍선이 터지고 있어요… 남은 풍선 \d+개$/);
      expect(onSpinEnd).not.toHaveBeenCalled();
      run(8_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const rest = left(r.container);
      expect(rest).toHaveLength(1);
      expect(rest[0].getAttribute('title')).toBe(`가게${winner + 1}`);
      expect(rest[0].classList.contains('balloon__item--win')).toBe(true);
      expect(r.container.querySelector('.balloon__status')?.textContent).toBe(`가게${winner + 1}만 남았어요!`);
      r.unmount();
    }
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Balloon candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    run(1_000);
    r.unmount();
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Balloon {...props} spinning />);
    run(1_000);
    r.rerender(<Balloon {...props} spinning={false} />);
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 풍선을 다시 다 띄우고 시작한다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Balloon {...props} winnerIndex={1} spinning run={1} />);
    run(8_000);
    r.rerender(<Balloon {...props} winnerIndex={1} spinning={false} run={1} />);
    expect(left(r.container)).toHaveLength(1);
    r.rerender(<Balloon {...props} winnerIndex={4} spinning run={2} />);
    expect(left(r.container)).toHaveLength(6);
    run(8_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(left(r.container).map((e) => e.getAttribute('title'))).toEqual(['가게5']);
  });

  it('움직임 줄이기면 바로 당첨만 남긴다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Balloon candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    const rest = left(r.container);
    expect(rest).toHaveLength(1);
    expect(rest[0].getAttribute('title')).toBe('가게6');
    expect(r.container.querySelector('.balloon__status')?.textContent).toBe('가게6만 남았어요!');
  });
});

describe('낚시', () => {
  const caught = (c: HTMLElement) => [...c.querySelectorAll('.fishing__fish--win')];
  const status = (c: HTMLElement) => c.querySelector('.fishing__status')?.textContent;

  it('입질을 몇 번 받다가 당첨 물고기를 낚아 올린다', () => {
    for (const [n, winner] of [[2, 0], [2, 1], [5, 2], [10, 9], [20, 0], [20, 13]]) {
      const onSpinEnd = vi.fn();
      const r = render(<Fishing candidates={places(n)} winnerIndex={winner} spinning run={n * 31 + winner} onSpinEnd={onSpinEnd} />);
      expect(r.container.querySelectorAll('.fishing__fish')).toHaveLength(n);
      expect(r.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('가게1');
      // 줄이 내려간다(run 을 이번 판으로 바꾸지 않으면 줄도 없고 여기서 멈춘다).
      expect(r.container.querySelector('.fishing__line')).not.toBeNull();
      const seen = new Set<string>();
      for (let t = 0; t < 3_500; t += 50) {
        run(50);
        seen.add(status(r.container) ?? '');
        const biting = r.container.querySelector('.fishing__fish--bite');
        // 헛입질 동안 당첨 물고기는 다가오지 않는다.
        if (biting && status(r.container) === '입질이 왔어요…' && t < 2_000) {
          expect(biting.getAttribute('title')).not.toBe(`가게${winner + 1}`);
        }
      }
      expect(seen).toContain('입질이 왔어요…');
      expect(seen).toContain('앗, 놓쳤어요');
      expect(caught(r.container)).toHaveLength(0);
      expect(onSpinEnd).not.toHaveBeenCalled();
      run(3_000);
      expect(onSpinEnd).toHaveBeenCalledTimes(1);
      const win = caught(r.container);
      expect(win).toHaveLength(1);
      expect(win[0].getAttribute('title')).toBe(`가게${winner + 1}`);
      expect(status(r.container)).toMatch(new RegExp(`^가게${winner + 1}(을|를) 낚았어요!$`));
      r.unmount();
    }
  });

  it('언마운트하면 타이머가 멈춰 onSpinEnd 를 부르지 않는다', () => {
    const onSpinEnd = vi.fn();
    const r = render(<Fishing candidates={places(8)} winnerIndex={3} spinning run={5} onSpinEnd={onSpinEnd} />);
    run(1_000);
    r.unmount();
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('spinning 이 꺼지면 타이머가 멈춘다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(8), winnerIndex: 3, run: 5, onSpinEnd };
    const r = render(<Fishing {...props} spinning />);
    run(1_000);
    r.rerender(<Fishing {...props} spinning={false} />);
    run(8_000);
    expect(onSpinEnd).not.toHaveBeenCalled();
  });

  it('다음 판은 낚은 물고기를 연못에 돌려놓고 다시 시작한다', () => {
    const onSpinEnd = vi.fn();
    const props = { candidates: places(6), onSpinEnd };
    const r = render(<Fishing {...props} winnerIndex={1} spinning run={1} />);
    run(7_000);
    r.rerender(<Fishing {...props} winnerIndex={1} spinning={false} run={1} />);
    expect(caught(r.container).map((e) => e.getAttribute('title'))).toEqual(['가게2']);
    r.rerender(<Fishing {...props} winnerIndex={4} spinning run={2} />);
    expect(caught(r.container)).toHaveLength(0);
    expect(status(r.container)).toBe('낚싯줄을 드리웠어요…');
    run(7_000);
    expect(onSpinEnd).toHaveBeenCalledTimes(2);
    expect(caught(r.container).map((e) => e.getAttribute('title'))).toEqual(['가게5']);
  });

  it('낚은 물고기는 줄 끝(바늘)에 매달린다 — 하늘 띠 안, 이름표는 연못 가운데 쪽', () => {
    reduced = true;
    for (const [n, winner] of [[7, 0], [7, 3], [2, 1]]) {
      const r = render(<Fishing candidates={places(n)} winnerIndex={winner} spinning run={1} onSpinEnd={() => {}} />);
      act(() => { vi.advanceTimersByTime(1); });
      const fish = caught(r.container)[0] as HTMLElement;
      const line = r.container.querySelector('.fishing__line') as HTMLElement;
      // 물고기 자리 = 바늘 자리. 예전엔 바늘 6%·물고기 10% 로 떨어져 있었다.
      expect(fish.style.left).toBe(line.style.left);
      expect(fish.style.top).toBe(line.style.height);
      expect(parseFloat(fish.style.top)).toBeLessThan(20);
      // 오른쪽 절반이면 이름표를 왼쪽에 — 연못 밖으로 나가지 않게.
      expect(fish.classList.contains('fishing__fish--tagLeft')).toBe(parseFloat(fish.style.left) >= 50);
      r.unmount();
    }
  });

  it('움직임 줄이기면 바로 낚아 올린 모습을 보인다', () => {
    reduced = true;
    const onSpinEnd = vi.fn();
    const r = render(<Fishing candidates={places(7)} winnerIndex={5} spinning run={1} onSpinEnd={onSpinEnd} />);
    act(() => { vi.advanceTimersByTime(1); });
    expect(onSpinEnd).toHaveBeenCalledTimes(1);
    expect(caught(r.container).map((e) => e.getAttribute('title'))).toEqual(['가게6']);
    expect(status(r.container)).toBe('가게6을 낚았어요!');
  });
});

describe('플링코 연출 시간 — 후보가 적어도 너무 짧지 않다', () => {
  it('후보 2곳도 공이 칸에 닿기까지 2.2초 이상, 20곳은 줄당 170ms 그대로', async () => {
    const { plinkoDuration, plinkoStepMs, PLINKO_STEP_MS } = await import('./Plinko');
    expect(2 * plinkoStepMs(2)).toBeGreaterThanOrEqual(2200);
    expect(plinkoDuration(2)).toBeGreaterThan(2200);
    expect(plinkoStepMs(20)).toBe(PLINKO_STEP_MS);
  });
});
