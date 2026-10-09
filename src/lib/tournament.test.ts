import { describe, expect, it } from 'vitest';
import { buildBracket, reachedRound, roundName } from './tournament';
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
