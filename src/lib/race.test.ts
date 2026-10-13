import { describe, expect, it } from 'vitest';
import { buildRace, progress } from './race';
import { seededRandom } from './random';

describe('픽셀 경주 — 당첨이 1등', () => {
  it('후보 수·당첨·시드가 무엇이든 당첨이 단독 1등으로 들어온다', () => {
    for (let n = 1; n <= 20; n += 1) {
      for (let w = 0; w < n; w += 1) {
        for (let seed = 0; seed < 6; seed += 1) {
          const r = buildRace(n, w, seededRandom(n * 1000 + w * 31 + seed));
          expect(r.order[0]).toBe(w);
          const others = r.finish.filter((_, i) => i !== w);
          if (others.length) expect(Math.min(...others)).toBeGreaterThan(r.finish[w]);
          // 모두 결승한다.
          r.paces.forEach((p, i) => expect(progress(p, r.finish[i] + 1e-9)).toBe(1));
        }
      }
    }
  });

  it('2등 이하는 당첨과 무관하게 섞인다 — 같은 시드에서 당첨만 바꿔도 나머지 순서가 고정되지 않는다', () => {
    const seconds = new Set<number>();
    for (let seed = 0; seed < 60; seed += 1) seconds.add(buildRace(6, 0, seededRandom(seed)).order[1]);
    expect(seconds.size).toBeGreaterThanOrEqual(4);
  });

  it('선두가 한 번 이상 바뀌는 경기가 흔하다(긴장)', () => {
    let changed = 0;
    for (let seed = 0; seed < 50; seed += 1) {
      const r = buildRace(5, 2, seededRandom(seed));
      let lead = -1;
      let swaps = 0;
      for (let t = 0.05; t < r.finish[2]; t += 0.05) {
        const d = r.paces.map((p) => progress(p, t));
        const now = d.indexOf(Math.max(...d));
        if (lead !== -1 && now !== lead) swaps += 1;
        lead = now;
      }
      if (swaps > 0) changed += 1;
    }
    expect(changed).toBeGreaterThanOrEqual(30);
  });

  it('돌발 상황이 섞이고, 넘어진 주자가 1등 하는 역전도 생긴다', () => {
    let crashes = 0;
    let comeback = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const r = buildRace(6, 3, seededRandom(seed));
      crashes += r.events.flat().filter((e) => e.kind === 'crash').length;
      if (r.events[3].some((e) => e.kind === 'crash')) comeback += 1;
      // 사건은 결승 전 구간에서만.
      r.events.flat().forEach((e) => expect(e.slice).toBeLessThan(7));
    }
    expect(crashes).toBeGreaterThan(50);
    expect(comeback).toBeGreaterThan(0);
  });

  it('레이싱처럼 사건을 둘까지 주면 겹치지 않고, 당첨은 그대로 1등이다', () => {
    let twice = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const r = buildRace(8, 5, seededRandom(seed), { maxEvents: 2, eventChance: 0.55 });
      expect(r.order[0]).toBe(5);
      for (const evs of r.events) {
        expect(evs.length).toBeLessThanOrEqual(2);
        if (evs.length === 2) {
          twice += 1;
          expect(evs[0].slice).toBeLessThan(evs[1].slice);
        }
        evs.forEach((e) => expect(e.slice).toBeLessThan(7));
      }
    }
    expect(twice).toBeGreaterThan(100);
  });
});
