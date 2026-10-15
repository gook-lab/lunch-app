/**
 * 카드 각본 테스트.
 *
 * 고른 카드에 당첨이 놓이고 마지막에 뒤집힌다. 아깝다·조커는 당첨이 아닌 카드에만 일어나 당첨을 바꾸지 않는다.
 * 나머지 카드는 마지막 단계 전에 전부 꽝으로 열린다. 한 판은 4.5 ~ 7.2초 안에 끝난다.
 */
import { describe, expect, it } from 'vitest';
import { CARDS_MAX_MS, CARDS_RATES, cardLooks, cardsPlan, waveGap, CARDS_MS } from './cards';
import { seededRandom } from './random';

const all = (fn: (count: number, pick: number, winner: number, seed: number) => void) => {
  for (let count = 2; count <= 20; count += 1)
    for (const winner of [0, Math.floor(count / 2), count - 1])
      for (const pick of [0, count - 1, (winner + 1) % count])
        for (let seed = 0; seed < 12; seed += 1) fn(count, pick, winner, seed * 977 + count);
};

describe('카드 각본', () => {
  it('한 장뿐이면 각본이 없다', () => {
    expect(cardsPlan(1, 0, 0, seededRandom(1))).toBeNull();
  });

  it('고른 자리에 당첨, 나머지 자리는 나머지 가게가 한 번씩', () => {
    all((count, pick, winner, seed) => {
      const p = cardsPlan(count, pick, winner, seededRandom(seed))!;
      expect(p.pick).toBe(pick);
      expect(p.slots[pick]).toBe(winner);
      expect([...p.slots].sort((a, b) => a - b)).toEqual(Array.from({ length: count }, (_, i) => i));
    });
  });

  it('꽝 · 아깝다 · 조커는 고른 카드가 아닌 카드를 한 번씩 나눠 맡는다', () => {
    all((count, pick, winner, seed) => {
      const p = cardsPlan(count, pick, winner, seededRandom(seed))!;
      const touched = [...p.wave, ...p.teases, ...(p.joker === null ? [] : [p.joker])].sort((a, b) => a - b);
      expect(touched).toEqual(Array.from({ length: count }, (_, i) => i).filter((i) => i !== pick));
      for (const st of p.steps) if (st.say !== 'final' && st.say !== 'won') expect(st.card).not.toBe(pick);
      expect(p.teases.length + (p.joker === null ? 0 : 1)).toBeGreaterThanOrEqual(1);
    });
  });

  it('고른 카드는 마지막 두 단계에서만 열리고, 그 전에 나머지는 전부 꽝으로 열린다', () => {
    all((count, pick, winner, seed) => {
      const p = cardsPlan(count, pick, winner, seededRandom(seed))!;
      const finalAt = p.steps.findIndex((s) => s.say === 'final');
      expect(finalAt).toBe(p.steps.length - 2);
      for (let k = 0; k < finalAt; k += 1) expect(cardLooks(p, k)[pick]).toBe('back');
      const before = cardLooks(p, finalAt - 1);
      before.forEach((l, i) => i !== pick && expect(l).toBe('lose'));
      const last = cardLooks(p, p.steps.length - 1);
      expect(last[pick]).toBe('win');
      expect(last.filter((l) => l === 'win')).toHaveLength(1);
      // 조커는 조커 단계에서만 조커로 보인다.
      if (p.joker !== null) {
        const jk = p.steps.findIndex((s) => s.say === 'joker');
        expect(cardLooks(p, jk)[p.joker]).toBe('joker');
        expect(cardLooks(p, jk + 1)[p.joker]).toBe('lose');
      }
    });
  });

  it('시각은 늘어나기만 하고 4.5 ~ 7.2초에 끝난다. 한꺼번에 뒤집기는 그 단계 안에 끝난다', () => {
    let min = Infinity;
    let max = 0;
    all((count, pick, winner, seed) => {
      const p = cardsPlan(count, pick, winner, seededRandom(seed))!;
      for (let k = 1; k < p.steps.length; k += 1) expect(p.steps[k].at).toBeGreaterThan(p.steps[k - 1].at);
      min = Math.min(min, p.endMs);
      max = Math.max(max, p.endMs);
      expect(waveGap(p.wave.length) * Math.max(0, p.wave.length - 1) + 420).toBeLessThanOrEqual(CARDS_MS.wave + 120);
    });
    expect(min).toBeGreaterThanOrEqual(4500);
    expect(max).toBeLessThanOrEqual(CARDS_MAX_MS);
  });

  it('같은 판 번호면 같은 각본, 조커·아깝다 두 장·리플 두 번이 정한 확률 근처로 나온다', () => {
    expect(cardsPlan(9, 2, 5, seededRandom(42))).toEqual(cardsPlan(9, 2, 5, seededRandom(42)));
    const N = 3000;
    let joker = 0;
    let two = 0;
    let riffles = 0;
    for (let s = 0; s < N; s += 1) {
      const p = cardsPlan(10, s % 10, (s * 3) % 10, seededRandom(s + 1))!;
      if (p.joker !== null) joker += 1;
      if (p.teases.length === 2) two += 1;
      if (p.riffles === 2) riffles += 1;
    }
    expect(Math.abs(joker / N - CARDS_RATES.joker)).toBeLessThan(0.04);
    expect(Math.abs(two / N - (1 - CARDS_RATES.joker) * CARDS_RATES.twoTeases)).toBeLessThan(0.04);
    expect(Math.abs(riffles / N - CARDS_RATES.twoRiffles)).toBeLessThan(0.04);
  });
});
