/**
 * 뽑기 기계 각본 테스트.
 *
 * 사건은 당첨을 바꾸지 않는다 — 출구까지 왔다 돌아가는 캡슐은 늘 당첨이 아닌 가게다.
 * 단계 시각은 늘어나기만 하고, 한 판은 4.5 ~ 7.2초 안에 끝난다. 사건은 판마다 달리 나온다.
 */
import { describe, expect, it } from 'vitest';
import { GACHA_MAX_MS, GACHA_RATES, gachaPlan, type GachaSay } from './gacha';
import { seededRandom } from './random';

const all = (fn: (count: number, winner: number, seed: number) => void) => {
  for (let count = 2; count <= 20; count += 1)
    for (const winner of [0, Math.floor(count / 2), count - 1])
      for (let seed = 0; seed < 40; seed += 1) fn(count, winner, seed * 977 + count);
};

describe('뽑기 기계 각본', () => {
  it('한 곳뿐이면 각본이 없다', () => {
    expect(gachaPlan(1, 0, seededRandom(1))).toBeNull();
  });

  it('출구까지 왔다 돌아가는 캡슐은 당첨이 아닌 가게다(사건이 당첨을 바꾸지 않는다)', () => {
    all((count, winner, seed) => {
      const p = gachaPlan(count, winner, seededRandom(seed))!;
      if (p.peek !== null) {
        expect(p.peek).not.toBe(winner);
        expect(p.peek).toBeGreaterThanOrEqual(0);
        expect(p.peek).toBeLessThan(count);
      }
    });
  });

  it('단계는 손잡이 → 섞기 → (아깝다) → 떨어짐 → (걸림·탁) → 열기 → 뽁 → 뽑았어요 차례이고, 4.5 ~ 7.2초에 끝난다', () => {
    let min = Infinity;
    let max = 0;
    all((count, winner, seed) => {
      const p = gachaPlan(count, winner, seededRandom(seed))!;
      const says = p.steps.map((s) => s.say);
      const want: GachaSay[] = [
        'crank',
        'tumble',
        ...(p.peek !== null ? (['peek', 'peek-back'] as GachaSay[]) : []),
        'drop',
        ...(p.jam ? (['jam', 'knock'] as GachaSay[]) : []),
        'open',
        'pop',
        'won',
      ];
      expect(says).toEqual(want);
      for (let k = 1; k < p.steps.length; k += 1) expect(p.steps[k].at).toBeGreaterThan(p.steps[k - 1].at);
      expect(p.steps[0].at).toBe(0);
      expect(p.endMs).toBeGreaterThan(p.steps[p.steps.length - 1].at);
      min = Math.min(min, p.endMs);
      max = Math.max(max, p.endMs);
    });
    expect(min).toBeGreaterThanOrEqual(4500);
    expect(max).toBeLessThanOrEqual(7200);
    expect(max).toBe(GACHA_MAX_MS);
  });

  it('같은 판 번호면 같은 각본, 사건은 판마다 다르다(확률은 정한 값 근처)', () => {
    expect(gachaPlan(9, 3, seededRandom(42))).toEqual(gachaPlan(9, 3, seededRandom(42)));
    const N = 3000;
    let peek = 0;
    let jam = 0;
    let gold = 0;
    let three = 0;
    for (let s = 0; s < N; s += 1) {
      const p = gachaPlan(8, s % 8, seededRandom(s * 7 + 3))!;
      if (p.peek !== null) peek += 1;
      if (p.jam) jam += 1;
      if (p.gold) gold += 1;
      if (p.cranks === 3) three += 1;
    }
    expect(Math.abs(peek / N - GACHA_RATES.peek)).toBeLessThan(0.04);
    expect(Math.abs(jam / N - GACHA_RATES.jam)).toBeLessThan(0.04);
    expect(Math.abs(gold / N - GACHA_RATES.gold)).toBeLessThan(0.03);
    expect(Math.abs(three / N - GACHA_RATES.threeCranks)).toBeLessThan(0.04);
  });
});
