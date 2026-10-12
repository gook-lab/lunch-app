import { describe, expect, it } from 'vitest';
import { landingSlot, pinHits, plinkoPath } from './plinko';
import { seededRandom } from './random';

describe('플링코 — 경로 역산', () => {
  it('모든 후보 수·모든 당첨 칸에서 공이 그 칸에 떨어진다', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let w = 0; w < n; w += 1) {
        const path = plinkoPath(w, n, seededRandom(n * 100 + w));
        expect(path).toHaveLength(n - 1);
        expect(landingSlot(path)).toBe(w);
      }
    }
  });

  it('판 번호가 다르면 길도 대체로 다르다', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, s) => plinkoPath(5, 12, seededRandom(s)).join('')));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('맞는 핀은 줄마다 하나, 그 줄 안의 번호다', () => {
    const path = plinkoPath(3, 8, seededRandom(1));
    const hits = pinHits(path);
    expect(hits).toHaveLength(7);
    hits.forEach((h, r) => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(r);
    });
  });
});
