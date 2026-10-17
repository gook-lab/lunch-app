// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveClock, handAngles, kstClock } from './LiveClock';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('지금 시각', () => {
  it('KST 24시간제 시:분:초', () => {
    expect(kstClock(new Date(Date.UTC(2026, 9, 17, 3, 4, 5)))).toBe('12:04:05');
    expect(kstClock(new Date(Date.UTC(2026, 9, 17, 15, 0, 9)))).toBe('00:00:09');
  });

  it('바늘 각도 — 3시 정각, 9시 30분, 초침', () => {
    expect(handAngles('15:00:00')).toEqual({ h: 90, m: 0, s: 0 });
    expect(handAngles('09:30:15')).toEqual({ h: 285, m: 181.5, s: 90 });
  });

  it('1초마다 바뀐다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 17, 3, 4, 5)));
    const r = render(<LiveClock />);
    expect(r.container.querySelector('time')?.getAttribute('aria-label')).toBe('지금 12:04:05');
    act(() => {
      vi.advanceTimersByTime(1010);
    });
    expect(r.container.querySelector('time')?.getAttribute('aria-label')).toBe('지금 12:04:06');
  });
});
