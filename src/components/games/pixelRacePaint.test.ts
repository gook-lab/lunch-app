import { describe, expect, it } from 'vitest';
import { shouldPaintRaceFrame } from './racePaint';

describe('레이스 화면 갱신 간격', () => {
  it('30fps 간격 전에는 건너뛰고 간격이 지나면 그린다', () => {
    expect(shouldPaintRaceFrame(32, 0, false)).toBe(false);
    expect(shouldPaintRaceFrame(34, 0, false)).toBe(true);
  });

  it('결승 프레임은 갱신 간격과 상관없이 반드시 그린다', () => {
    expect(shouldPaintRaceFrame(1, 0, true)).toBe(true);
  });
});
