// @vitest-environment jsdom
/** 첫 방문 안내 — 화면에 있는 요소만 단계로, 다음·건너뛰기·Escape, 끝나면 기억한다. */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Tour, tourSeen } from './Tour';

beforeEach(() => localStorage.removeItem('lunch-app:tour-v1'));
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function stage(withChips: boolean) {
  document.body.insertAdjacentHTML(
    'beforeend',
    `${withChips ? '<div class="catbar"></div>' : ''}<div class="modebar"></div><button class="stage__run"></button><nav class="tabs"></nav>`,
  );
  Element.prototype.scrollIntoView = vi.fn();
}

describe('첫 방문 안내', () => {
  it('처음엔 안 본 것으로 나오고, 끝까지 넘기면 기억한다', () => {
    stage(true);
    expect(tourSeen()).toBe(false);
    const onClose = vi.fn();
    const r = render(<Tour onClose={onClose} />);
    expect(r.getByRole('dialog').textContent).toContain('1 / 5');
    for (let i = 0; i < 4; i += 1) act(() => r.getByRole('button', { name: '다음' }).click());
    expect(r.getByRole('dialog').textContent).toContain('5 / 5');
    expect(r.queryByRole('button', { name: '건너뛰기' })).toBeNull();
    act(() => r.getByRole('button', { name: '시작하기' }).click());
    expect(onClose).toHaveBeenCalled();
    expect(tourSeen()).toBe(true);
  });

  it('밝힐 요소가 없는 단계는 건너뛰고, 밝힐 곳이 있으면 구멍을 낸다', () => {
    stage(false);
    const r = render(<Tour onClose={() => {}} />);
    expect(r.getByRole('dialog').textContent).toContain('1 / 4');
    expect(r.container.querySelector('.tour__hole')).toBeNull();
    act(() => r.getByRole('button', { name: '다음' }).click());
    expect(r.getByRole('dialog').textContent).toContain('게임을 골라요');
    expect(r.container.querySelector('.tour__hole')).toBeTruthy();
  });

  it('건너뛰기와 Escape 도 기억하고 닫는다', () => {
    stage(true);
    const onClose = vi.fn();
    const r = render(<Tour onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tourSeen()).toBe(true);
    r.unmount();
    localStorage.removeItem('lunch-app:tour-v1');
    const r2 = render(<Tour onClose={onClose} />);
    act(() => r2.getByRole('button', { name: '건너뛰기' }).click());
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(tourSeen()).toBe(true);
  });
});
