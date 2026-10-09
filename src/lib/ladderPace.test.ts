import { describe, expect, it } from 'vitest';
import { ladderPace } from './ladder';

describe('ladderPace — 도착 직전에 느려진다', () => {
  it('시작 0, 끝 1 — 도착 칸이 바뀌지 않는다', () => {
    expect(ladderPace(0)).toBe(0);
    expect(ladderPace(1)).toBe(1);
  });

  it('줄곧 앞으로만 간다', () => {
    let prev = -1;
    for (let i = 0; i <= 100; i += 1) {
      const p = ladderPace(i / 100);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });

  it('마지막 구간이 앞 구간보다 느리다', () => {
    const early = ladderPace(0.3) - ladderPace(0.2);
    const late = ladderPace(0.95) - ladderPace(0.85);
    expect(late).toBeLessThan(early);
  });
});
