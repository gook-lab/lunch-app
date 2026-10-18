// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { RunDock } from './RunDock';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RunDock', () => {
  it('제자리가 화면 위로 지나갔을 때만 띄우고, 아직 아래에 있으면 띄우지 않는다', () => {
    let fire: (entry: Partial<IntersectionObserverEntry>) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: Partial<IntersectionObserverEntry>[]) => void) {
          fire = (entry) => cb([entry]);
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(<RunDock><button type="button">시작</button></RunDock>);
    const dock = container.querySelector('.run-dock')!;
    act(() => fire({ isIntersecting: false, boundingClientRect: { top: 900 } as DOMRect }));
    expect(dock.classList.contains('run-dock--on')).toBe(false);
    act(() => fire({ isIntersecting: false, boundingClientRect: { top: -60 } as DOMRect }));
    expect(dock.classList.contains('run-dock--on')).toBe(true);
    act(() => fire({ isIntersecting: true, boundingClientRect: { top: 300 } as DOMRect }));
    expect(dock.classList.contains('run-dock--on')).toBe(false);
  });
});
