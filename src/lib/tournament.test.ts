import { describe, expect, it } from 'vitest';
import { buildBracket, FAKE_RATE, gaugeSwaps, reachedRound, roundName, tournamentCues, tournamentPlan, type FightKind } from './tournament';
import { seededRandom } from './random';

describe('buildBracket — 정해진 우승이 모든 경기를 이긴다', () => {
  for (const count of [2, 3, 5, 6, 8, 12, 20]) {
    it(`후보 ${count}곳: 누가 우승이든 대진표가 그 우승으로 끝난다`, () => {
      for (let winner = 0; winner < count; winner += 1) {
        for (let seed = 1; seed <= 20; seed += 1) {
          const { rounds } = buildBracket(count, winner, seededRandom(seed));
          expect(rounds.at(-1)).toEqual([winner]);
          const first = rounds[0].filter((e) => e !== null);
          expect([...first].sort((a, b) => a! - b!)).toEqual(Array.from({ length: count }, (_, i) => i));
          // 다음 판 출전자는 앞 판 짝 둘 중 하나다.
          for (let r = 1; r < rounds.length; r += 1) {
            rounds[r].forEach((e, i) => {
              expect([rounds[r - 1][2 * i], rounds[r - 1][2 * i + 1]]).toContain(e);
            });
          }
          // 빈자리끼리 붙는 짝이 없다.
          for (let i = 0; i < rounds[0].length; i += 2) {
            expect(rounds[0][i] !== null || rounds[0][i + 1] !== null).toBe(true);
          }
        }
      }
    });
  }

  it('후보 1곳이면 바로 우승', () => {
    expect(buildBracket(1, 0, Math.random).rounds).toEqual([[0]]);
  });

  it('범위를 벗어난 우승은 빈 대진표', () => {
    expect(buildBracket(3, 3, Math.random).rounds).toEqual([]);
  });

  it('시드가 다르면 대진도 대체로 다르다', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed += 1) seen.add(JSON.stringify(buildBracket(8, 0, seededRandom(seed)).rounds));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('우승 아닌 가게도 결승까지 갈 수 있다 — 준우승이 늘 같지 않다', () => {
    const finalists = new Set<number>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const { rounds } = buildBracket(8, 0, seededRandom(seed));
      rounds.at(-2)!.forEach((e) => e !== 0 && e !== null && finalists.add(e));
    }
    expect(finalists.size).toBe(7);
  });
});

describe('roundName · reachedRound', () => {
  it('판 이름', () => {
    expect(roundName(2)).toBe('결승');
    expect(roundName(8)).toBe('8강');
    expect(roundName(32)).toBe('32강');
  });

  it('우승은 마지막 판까지, 나머지는 떨어진 판까지', () => {
    const b = buildBracket(4, 2, seededRandom(3));
    expect(reachedRound(b, 2)).toBe(b.rounds.length - 1);
    for (const e of [0, 1, 3]) expect(reachedRound(b, e)).toBeLessThan(b.rounds.length - 1);
  });
});


describe('tournamentPlan — 연출 일정은 승패를 바꾸지 않는다', () => {
  const CAP = 7200;

  it('2~20곳 · 여러 우승 · 여러 시드: 대진표 그대로, 결승 게이지는 우승 쪽 끝, 4.5~7.2초', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (let seed = 1; seed <= 25; seed += 1) {
          const bracket = buildBracket(count, winner, seededRandom(seed + 7));
          const before = JSON.stringify(bracket.rounds);
          const plan = tournamentPlan(bracket, seededRandom(seed * 13 + 5), CAP);
          // 일정을 만들어도 대진표(=승패)는 그대로다.
          expect(JSON.stringify(bracket.rounds)).toBe(before);
          expect(bracket.rounds.at(-1)).toEqual([winner]);

          const matchRounds = bracket.rounds.length - 1;
          expect(plan.rounds).toHaveLength(matchRounds);
          expect(plan.endMs).toBeLessThanOrEqual(CAP);
          expect(plan.endMs).toBeGreaterThanOrEqual(4500);
          expect(plan.endMs - plan.trophyMs).toBeGreaterThanOrEqual(800);

          let prevEnd = 0;
          plan.rounds.forEach((rp, r) => {
            expect(rp.startMs).toBeGreaterThanOrEqual(prevEnd - 1);
            expect(rp.clashMs).toBeGreaterThan(rp.startMs);
            expect(rp.resultMs).toBeGreaterThan(rp.clashMs);
            expect(rp.endMs).toBeGreaterThan(rp.resultMs);
            prevEnd = rp.endMs;
            const real = bracket.rounds[r].map((_, i) => i).filter((i) => i % 2 === 0 && bracket.rounds[r][i] !== null && bracket.rounds[r][i + 1] !== null).map((i) => i / 2);
            if (rp.fake) expect(real).toContain(rp.fake.match);
            const f = rp.feature;
            if (!f) return;
            expect(real).toContain(f.match);
            expect(f.gauge.at(-1)).toBe(1);
            for (const g of f.gauge) expect(g).toBeGreaterThanOrEqual(0);
            for (const g of f.gauge) expect(g).toBeLessThanOrEqual(1);
            expect(f.koMs).toBeGreaterThan(f.fightMs);
            for (const s of f.shouts) {
              expect(s.atMs).toBeGreaterThanOrEqual(f.fightMs);
              expect(s.atMs).toBeLessThanOrEqual(f.koMs);
            }
            // 역전 연출이면 진 쪽이 먼저 앞선다.
            if (f.kind === 'comeback' || f.kind === 'seesaw') expect(Math.min(...f.gauge.slice(0, -1))).toBeLessThan(0.5);
            expect(f.swaps).toHaveLength(f.kind === 'seesaw' ? 2 : f.kind === 'rout' ? 0 : f.kind === 'close' ? 2 : 1);
          });
          // 결승은 꼭 컷신, 압승은 없다. 결승 컷신의 이긴 쪽은 정해진 우승이다.
          const fin = plan.rounds.at(-1)!.feature!;
          expect(fin).not.toBeNull();
          expect(fin.kind).not.toBe('rout');
          expect(fin.stareMs).not.toBeNull();
          expect(bracket.rounds[matchRounds][fin.match]).toBe(winner);
        }
      }
    }
  });

  it('단계 목록: 0ms 에서 시작해 시각 순, 판마다 맞붙은 뒤에 결과, 마지막은 트로피', () => {
    for (const count of [2, 3, 5, 8, 15, 20]) {
      for (let seed = 1; seed <= 20; seed += 1) {
        const plan = tournamentPlan(buildBracket(count, 0, seededRandom(seed)), seededRandom(seed), CAP);
        const cues = tournamentCues(plan);
        expect(cues[0].atMs).toBe(0);
        expect(cues.at(-1)!.phase).toBe('trophy');
        expect(cues.at(-1)!.atMs).toBe(plan.trophyMs);
        for (let k = 1; k < cues.length; k += 1) expect(cues[k].atMs).toBeGreaterThanOrEqual(cues[k - 1].atMs);
        for (let k = 1; k < cues.length; k += 1) expect(cues[k].round).toBeGreaterThanOrEqual(cues[k - 1].round);
        plan.rounds.forEach((rp) => {
          const ph = cues.filter((c) => c.round === rp.round).map((c) => c.phase);
          const end = ph.includes('ko') ? ph.indexOf('ko') : ph.indexOf('result');
          expect(end).toBeGreaterThan(Math.max(ph.indexOf('clash'), ph.indexOf('fight')));
        });
      }
    }
  });

  it('사건 비율: 결승 모양 셋이 고루, 빠른 판 역전은 FAKE_RATE 언저리, 크게 볼 4강 경기는 우승 경기에 쏠리지 않는다', () => {
    const kinds: Record<FightKind, number> = { comeback: 0, seesaw: 0, close: 0, rout: 0 };
    let quick = 0;
    let fakes = 0;
    let semis = 0;
    let semiWithWinner = 0;
    const N = 600;
    for (let seed = 1; seed <= N; seed += 1) {
      const winner = seed % 12;
      const bracket = buildBracket(12, winner, seededRandom(seed + 7));
      const plan = tournamentPlan(bracket, seededRandom(seed * 13 + 5), CAP);
      kinds[plan.rounds.at(-1)!.feature!.kind] += 1;
      plan.rounds.forEach((rp) => {
        if (rp.feature && rp.round !== plan.rounds.length - 1) {
          semis += 1;
          const rd = bracket.rounds[rp.round];
          if (rd[2 * rp.feature.match] === winner || rd[2 * rp.feature.match + 1] === winner) semiWithWinner += 1;
        }
        if (!rp.feature) {
          quick += 1;
          if (rp.fake) fakes += 1;
        }
      });
    }
    expect(kinds.rout).toBe(0);
    for (const k of ['comeback', 'seesaw', 'close'] as const) {
      expect(kinds[k] / N).toBeGreaterThan(0.22);
      expect(kinds[k] / N).toBeLessThan(0.45);
    }
    expect(Math.abs(fakes / quick - FAKE_RATE)).toBeLessThan(0.08);
    expect(semiWithWinner / semis).toBeGreaterThan(0.38);
    expect(semiWithWinner / semis).toBeLessThan(0.62);
  });

  it('같은 시드는 같은 일정, 다른 시드는 대체로 다른 일정', () => {
    const b = buildBracket(9, 4, seededRandom(3));
    expect(tournamentPlan(b, seededRandom(42), CAP)).toEqual(tournamentPlan(b, seededRandom(42), CAP));
    const seen = new Set<string>();
    for (let s = 1; s <= 20; s += 1) {
      const p = tournamentPlan(b, seededRandom(s), CAP);
      seen.add(p.rounds.map((r) => `${r.feature?.kind ?? ''}${r.feature?.match ?? ''}${r.fake?.match ?? '-'}`).join('|'));
    }
    expect(seen.size).toBeGreaterThan(8);
  });

  it('한 곳뿐이면 일정이 비어 있다', () => {
    expect(tournamentPlan(buildBracket(1, 0, Math.random), Math.random, CAP)).toEqual({ rounds: [], trophyMs: 0, endMs: 0 });
  });

  it('gaugeSwaps: 처음 앞서는 순간은 빼고 뒤집힌 자리만', () => {
    expect(gaugeSwaps([0.5, 0.74, 0.88, 0.94, 1])).toEqual([]);
    expect(gaugeSwaps([0.5, 0.3, 0.2, 0.6, 1])).toHaveLength(1);
    const s = gaugeSwaps([0.5, 0.8, 0.2, 0.6, 1]);
    expect(s).toHaveLength(2);
    expect(s[0]).toBeGreaterThan(0.3);
    expect(s[0]).toBeLessThan(0.6);
    expect(s[1]).toBeGreaterThan(0.6);
    expect(s[1]).toBeLessThan(0.85);
  });
});
