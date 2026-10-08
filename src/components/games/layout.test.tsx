// @vitest-environment jsdom
/**
 * 후보 수에 따른 라벨 배치 전환.
 *
 * 20곳에서 돌림판 라벨이 겹치고(테두리 호 43px vs 라벨 78px) 사다리 라벨이
 * 전부 "샘플…" 로 잘리는 것을 실측해 세로쓰기로 바꿨다. 임계값이 밀리면
 * 같은 화면이 다시 나오므로 여기서 고정한다.
 */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Ladder, TALL_LABELS_FROM } from './Ladder';
import { RADIAL_FROM, Wheel } from './Wheel';

afterEach(cleanup);

const places = (n: number): Place[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `샘플 가게 ${i + 1}`,
    category: '한식',
    lat: 0,
    lng: 0,
    walkMin: 5,
    kakaoPlaceId: `k${i}`,
    active: true,
    createdBy: 'test',
  }));

const noop = () => {};
const idle = { winnerIndex: null, spinning: false, run: 0, onSpinEnd: noop };
const wheel = (candidates: Place[]) => render(<Wheel candidates={candidates} {...idle} />);
const ladder = (candidates: Place[], run = 0) =>
  render(<Ladder candidates={candidates} {...idle} run={run} />);

describe('돌림판 라벨 배치', () => {
  it(`${RADIAL_FROM}곳까지는 테두리를 따라, 그 위부터는 바퀴살 방향`, () => {
    const a = wheel(places(RADIAL_FROM));
    expect(a.container.querySelector('.wheel--radial')).toBeNull();
    a.unmount();
    const b = wheel(places(RADIAL_FROM + 1));
    expect(b.container.querySelector('.wheel--radial')).not.toBeNull();
  });

  it('세로쓰기에서는 이름을 6글자로 줄이고 전체 이름은 title 로 남긴다', () => {
    const r = wheel([{ ...places(1)[0], name: '샘플 아주아주긴가게이름' }, ...places(RADIAL_FROM)]);
    const label = r.container.querySelector('.wheel__label') as HTMLElement;
    expect(label.textContent).toBe('아주아주긴…');
    expect(label.title).toBe('샘플 아주아주긴가게이름');
  });
});

describe('사다리 — 가린 바닥과 사용자 판', () => {
  it(`${TALL_LABELS_FROM}곳까지는 가로, 그 위부터는 세로 칸`, () => {
    const a = ladder(places(TALL_LABELS_FROM));
    expect(a.container.querySelector('.ladder__labels--tall')).toBeNull();
    a.unmount();
    const b = ladder(places(TALL_LABELS_FROM + 1));
    expect(b.container.querySelector('.ladder__labels--tall')).not.toBeNull();
  });

  it('돌리기 전에는 바닥 칸이 전부 가려져 있다', () => {
    const r = ladder(places(5));
    const labels = [...r.container.querySelectorAll('.ladder__label')].map((l) => l.textContent);
    expect(labels).toEqual(['?', '?', '?', '?', '?']);
    expect(r.container.textContent).not.toContain('샘플 가게');
  });

  it('출발 번호를 누르면 판 시작을 요청한다', () => {
    const onRequestSpin = vi.fn();
    const r = render(<Ladder candidates={places(4)} {...idle} onRequestSpin={onRequestSpin} />);
    fireEvent.click(r.getByRole('button', { name: '3번 줄에서 출발' }));
    expect(onRequestSpin).toHaveBeenCalledTimes(1);
  });

  it('연출 중에는 출발 번호와 새 사다리가 잠긴다', () => {
    const r = render(<Ladder candidates={places(4)} {...idle} winnerIndex={1} spinning run={3} />);
    expect((r.getByRole('button', { name: '1번 줄에서 출발' }) as HTMLButtonElement).disabled).toBe(true);
    expect((r.getByRole('button', { name: '새 사다리' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('판 번호가 바뀌어도 사용자가 보던 사다리는 그대로다', () => {
    const r = ladder(places(5), 7);
    const before = [...r.container.querySelectorAll('.ladder__rung')].map((l) => l.getAttribute('y1')).join(',');
    r.rerender(<Ladder candidates={places(5)} {...idle} run={8} />);
    const after = [...r.container.querySelectorAll('.ladder__rung')].map((l) => l.getAttribute('y1')).join(',');
    expect(after).toBe(before);
  });
});
