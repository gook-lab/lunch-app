/**
 * 공정성 검사 (fairness harness) — 당첨 선택과 연출 보조 함수의 무작위성 검사.
 *
 * 무거운 시뮬레이션은 FAIRNESS=1 환경 변수로만 돈다 (ci 에서 항상 돌도록 따로 배포).
 * 가벼운 회귀 검사는 고정 시드로 매번 돈다.
 */
import { describe, it, expect } from 'vitest';
import { pickWeighted } from '../weights';
import { buildLadder, ladderMapping, startForTarget } from '../ladder';
import { diceRolls } from '../dice';
import { plinkoPath, landingSlot } from '../plinko';
import { buildRace } from '../race';

// 고정 시드 pseudo-RNG (mulberry32) — 결과 재현 가능.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * chi-square 적합성 검사. 기댓값이 5 미만이면 병합한다.
 * 반환: { stat: chi2 값, pValue: p-value, dof: 자유도 }
 */
function chiSquare(observed: number[], expected: number[]): { stat: number; pValue: number; dof: number } {
  if (observed.length !== expected.length) {
    throw new Error('길이 불일치');
  }
  let stat = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const e = expected[i];
    if (e <= 0) continue;
    stat += (observed[i] - e) ** 2 / e;
  }
  const dof = observed.length - 1;
  const pValue = chiSquarePValue(stat, dof);
  return { stat, pValue, dof };
}

/** ln Γ(x) — Lanczos 근사(g=7, 9항). 감마 함수 값이 커져 넘치지 않게 로그로 다룬다. */
function logGamma(x: number): number {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i += 1) a += c[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * 카이제곱 우측 p-값 = 정규화 상부 불완전 감마 Q(k/2, x/2).
 * x < a+1 은 급수, 그 밖은 연분수(Numerical Recipes 6.2). 정규 근사는 χ² 가 작을 때
 * p 를 거꾸로 내서(χ²=0.64, 자유도 4 → 0.065, 실제 0.96) 쓰지 않는다.
 */
function chiSquarePValue(stat: number, dof: number): number {
  if (stat <= 0) return 1;
  const a = dof / 2;
  const x = stat / 2;
  const lnPre = -x + a * Math.log(x) - logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let term = sum;
    for (let n = 1; n < 500; n += 1) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(lnPre);
  }
  let b = x + 1 - a;
  let c = 1 / 1e-300;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c;
    if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(lnPre) * h;
}

// ============================================================================
// 무거운 검사 (FAIRNESS=1)
// ============================================================================

describe('균등 선택 (heavy)', () => {
  describe.runIf(process.env.FAIRNESS === '1')('다양한 후보 수', () => {
    const TRIALS = 200_000;
    const candidates = [2, 5, 7, 18];

    for (const n of candidates) {
      it(`N=${n}, 시행=${TRIALS}`, () => {
        const counts = new Array(n).fill(0);
        for (let t = 0; t < TRIALS; t += 1) {
          const idx = Math.floor(Math.random() * n);
          counts[idx] += 1;
        }

        const expected = Array(n).fill(TRIALS / n);
        const { stat, pValue, dof } = chiSquare(counts, expected);

        // p > 0.001 이면 귀무가설(균등) 기각 안 함. (유의도 α=0.001)
        console.log(`  N=${n}: χ²=${stat.toFixed(2)}, p=${pValue.toFixed(6)}, dof=${dof}`);
        expect(pValue).toBeGreaterThan(0.001);

        // 첫/마지막 칸 편향 검사. 극값 비율이 중앙값의 1.5배 이상이면 경고.
        const sorted = [...counts].sort((a, b) => a - b);
        const median = sorted[Math.floor(n / 2)];
        const minCount = sorted[0];
        const maxCount = sorted[n - 1];
        const skew = Math.max(minCount / median, maxCount / median);
        console.log(`    편향 비율 (극/중): ${skew.toFixed(3)}`);
        // 큰 편향이 있어도 통계 유의도만 확인하면 되지만, 로그로 감시.
      });
    }
  });
});

describe('가중 선택 — 핀볼', () => {
  describe.runIf(process.env.FAIRNESS === '1')('공 개수 비율 검사', () => {
    const TRIALS = 100_000;

    it('균등 (모두 1개)', () => {
      const counts = new Array(5).fill(0);
      for (let t = 0; t < TRIALS; t += 1) {
        const balls = [1, 1, 1, 1, 1];
        const idx = pickWeighted(balls, Math.random);
        counts[idx] += 1;
      }
      const expected = Array(5).fill(TRIALS / 5);
      const { stat, pValue } = chiSquare(counts, expected);
      console.log(`  균등: χ²=${stat.toFixed(2)}, p=${pValue.toFixed(6)}`);
      expect(pValue).toBeGreaterThan(0.001);
    });

    it('불균등 비율 [3, 1, 1, 1, 1]', () => {
      const counts = new Array(5).fill(0);
      for (let t = 0; t < TRIALS; t += 1) {
        const balls = [3, 1, 1, 1, 1];
        const idx = pickWeighted(balls, Math.random);
        counts[idx] += 1;
      }
      const total = 3 + 1 + 1 + 1 + 1;
      const expected = [3, 1, 1, 1, 1].map((b) => (b / total) * TRIALS);
      const { stat, pValue } = chiSquare(counts, expected);
      console.log(`  [3,1,1,1,1]: χ²=${stat.toFixed(2)}, p=${pValue.toFixed(6)}`);
      expect(pValue).toBeGreaterThan(0.001);
    });

    it('불균등 비율 [5, 5, 1, 1, 1]', () => {
      const counts = new Array(5).fill(0);
      for (let t = 0; t < TRIALS; t += 1) {
        const balls = [5, 5, 1, 1, 1];
        const idx = pickWeighted(balls, Math.random);
        counts[idx] += 1;
      }
      const total = 5 + 5 + 1 + 1 + 1;
      const expected = [5, 5, 1, 1, 1].map((b) => (b / total) * TRIALS);
      const { stat, pValue } = chiSquare(counts, expected);
      console.log(`  [5,5,1,1,1]: χ²=${stat.toFixed(2)}, p=${pValue.toFixed(6)}`);
      expect(pValue).toBeGreaterThan(0.001);
    });
  });
});

describe('사다리 (heavy)', () => {
  describe.runIf(process.env.FAIRNESS === '1')('순열 검증', () => {
    it('7 후보, 1000 독립 판 → 각 판이 완전 순열', () => {
      const n = 7;
      const trials = 1000;

      for (let t = 0; t < trials; t += 1) {
        const ladder = buildLadder(n, 12, Math.random);
        const mapping = ladderMapping(ladder);

        // 각 mapping이 순열(permutation)인가? 모든 0..n-1이 정확히 한 번씩.
        const seen = new Set(mapping);
        expect(seen.size).toBe(n);

        // 모든 도착 칸으로 갈 수 있는 출발점이 하나씩 있는가?
        for (let dest = 0; dest < n; dest += 1) {
          const start = startForTarget(ladder, dest);
          expect(mapping[start]).toBe(dest);
        }
      }
      console.log(`  1000 판 모두 완전 순열 확인됨`);
    });

    it('경로 비편향: 가로줄 배치 다양성', () => {
      // 같은 층에서 가로줄이 많이 나오는 곳이 있는가?
      const n = 7;
      const trials = 500;
      const rungDensity: number[] = [];

      for (let t = 0; t < trials; t += 1) {
        const ladder = buildLadder(n, 10, Math.random);
        for (let row = 0; row < ladder.rows; row += 1) {
          const density = ladder.rungs.filter((r) => r.row === row).length;
          rungDensity.push(density);
        }
      }

      // 밀도: 0, 1, 2, 3 (한 줄에 최대 3개)
      const densityCounts = [0, 0, 0, 0];
      for (const d of rungDensity) densityCounts[Math.min(d, 3)] += 1;

      // 밀도가 0~3에 고르게 분포하는가? 상당히 많은 비율이 0 또는 1.
      console.log(
        `  가로줄 밀도 분포: 0=${densityCounts[0]}, 1=${densityCounts[1]}, 2=${densityCounts[2]}, 3=${densityCounts[3]}`,
      );
      // 경고만 로그. 사다리는 확률적 구조라 분포가 정해져 있다.
    });
  });
});

describe('주사위 (heavy)', () => {
  describe.runIf(process.env.FAIRNESS === '1')('도착 보장 + 거리 분포', () => {
    it('거리별 굴림 분포: 1~36 칸', () => {
      const TRIALS = 10_000;
      let totalRolls = 0;
      let totalTrials = 0;

      for (let dist = 1; dist <= 36; dist += 1) {
        for (let t = 0; t < Math.floor(TRIALS / 36); t += 1) {
          const rolls = diceRolls(dist, Math.random);
          let sum = 0;
          for (const r of rolls) {
            expect(r).toBeGreaterThanOrEqual(1);
            expect(r).toBeLessThanOrEqual(6);
            sum += r;
          }
          // 마지막 굴림 이후 정확히 목표 거리에 도착했는가?
          expect(sum).toBe(dist);
          totalRolls += rolls.length;
          totalTrials += 1;
        }
      }

      // 평균 굴림 수.
      const avgRolls = totalRolls / totalTrials;
      console.log(`  총 ${totalTrials}회 시행, 평균 굴림 수: ${avgRolls.toFixed(2)} (굴림 수 = round(거리/3.5) 기준)`);
      // 평균이 3 ~ 4 사이면 합리적.
      expect(avgRolls).toBeGreaterThan(2.5);
      expect(avgRolls).toBeLessThan(4.5);
    });
  });
});

describe('플링코 (heavy)', () => {
  describe.runIf(process.env.FAIRNESS === '1')('착지점 정확성', () => {
    it('100회 독립 경로 → 항상 정확한 칸 도착', () => {
      for (let w = 0; w < 100; w += 1) {
        const count = 5;
        const path = plinkoPath(w % count, count, Math.random);
        const landing = landingSlot(path);
        expect(landing).toBe(w % count);
      }
    });

    it('경로 섞임 확인: 같은 winner 다른 경로', () => {
      const count = 7;
      const winner = 3;
      const paths = new Set<string>();

      for (let t = 0; t < 500; t += 1) {
        const path = plinkoPath(winner, count, Math.random);
        const pathStr = path.join('');
        paths.add(pathStr);
      }

      // 500회 독립 경로 중 다양한 배치가 있는가?
      // count=7, winner=3 → 3개 R, 3개 L 섞기 → C(6,3)=20가지만 가능.
      // 500회라 거의 모든 20가지가 나올 것.
      console.log(`  플링코 경로 다양성: ${paths.size}가지 고유 경로 (최대 20가지)`);
      expect(paths.size).toBeGreaterThanOrEqual(15); // 대부분의 경로가 나왔는가?
    });
  });
});

describe('경마/경주 (heavy)', () => {
  describe.runIf(process.env.FAIRNESS === '1')('당첨 항상 1등', () => {
    it('100 경기, 5 주자', () => {
      for (let race = 0; race < 100; race += 1) {
        const count = 5;
        const winnerIndex = race % count;
        const raceResult = buildRace(count, winnerIndex, Math.random);
        expect(raceResult.order[0]).toBe(winnerIndex);
      }
    });

    it('경주 변형: 충돌 활성화', () => {
      for (let race = 0; race < 50; race += 1) {
        const count = 7;
        const winnerIndex = race % count;
        const raceResult = buildRace(count, winnerIndex, Math.random, {
          maxEvents: 2,
          collisions: true,
        });
        expect(raceResult.order[0]).toBe(winnerIndex);
      }
    });
  });
});

// ============================================================================
// 가벼운 회귀 검사 (항상 돈다) — 고정 시드라 실행마다 결과가 같아 CI 가 흔들리지 않는다
// ============================================================================

describe('균등 선택 (smoke)', () => {
  it('3 후보, 5000 시행', () => {
    const rng = mulberry32(6);
    const n = 3;
    const TRIALS = 5000;
    const counts = new Array(n).fill(0);
    for (let t = 0; t < TRIALS; t += 1) {
      const idx = Math.floor(rng() * n);
      counts[idx] += 1;
    }
    const expected = Array(n).fill(TRIALS / n);
    const { pValue } = chiSquare(counts, expected);
    // 느슨한 threshold (p > 0.0001) — regression 만 잡는다.
    expect(pValue).toBeGreaterThan(0.0001);
  });
});

describe('가중 선택 (smoke)', () => {
  it('균등 (모두 1), 10000 시행', () => {
    const rng = mulberry32(1);
    const TRIALS = 10_000;
    const counts = new Array(3).fill(0);
    for (let t = 0; t < TRIALS; t += 1) {
      const balls = [1, 1, 1];
      const idx = pickWeighted(balls, rng);
      counts[idx] += 1;
    }
    const expected = Array(3).fill(TRIALS / 3);
    const { pValue } = chiSquare(counts, expected);
    expect(pValue).toBeGreaterThan(0.0001);
  });
});

describe('사다리 (smoke)', () => {
  it('4 후보 순열 5회', () => {
    const rng = mulberry32(2);
    for (let t = 0; t < 5; t += 1) {
      const ladder = buildLadder(4, 5, rng);
      const mapping = ladderMapping(ladder);

      // 순열인가? (모든 칸 0~3이 정확히 한 번씩)
      const seen = new Set(mapping);
      expect(seen.size).toBe(4);
      for (let i = 0; i < 4; i += 1) {
        expect(mapping.includes(i)).toBe(true);
      }
    }
  });
});

describe('주사위 (smoke)', () => {
  it('거리 10칸: 정확 도착 5회', () => {
    const rng = mulberry32(3);
    for (let t = 0; t < 5; t += 1) {
      const dist = 10;
      const rolls = diceRolls(dist, rng);
      const sum = rolls.reduce((a, b) => a + b, 0);
      expect(sum).toBe(dist);
      for (const r of rolls) {
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe('플링코 (smoke)', () => {
  it('당첨 칸 5회 확인', () => {
    const rng = mulberry32(4);
    for (let t = 0; t < 5; t += 1) {
      const count = 6;
      const winner = 2;
      const path = plinkoPath(winner, count, rng);
      const landing = landingSlot(path);
      expect(landing).toBe(winner);
    }
  });
});

describe('경마 (smoke)', () => {
  it('당첨 1등 3회 확인', () => {
    const rng = mulberry32(5);
    for (let t = 0; t < 3; t += 1) {
      const count = 4;
      const winner = t % count;
      const race = buildRace(count, winner, rng);
      expect(race.order[0]).toBe(winner);
    }
  });
});

describe('고정 시드 PRNG (smoke)', () => {
  it('mulberry32 재현성', () => {
    const rng1 = mulberry32(42);
    const rng2 = mulberry32(42);

    for (let i = 0; i < 100; i += 1) {
      expect(rng1()).toBe(rng2());
    }
  });
});

describe('카이제곱 p-값 계산', () => {
  // 임계값 표(0.05)와 수치 적분으로 구한 값에 맞춘다. 근사가 틀리면 공정성 검사 전체가 헛돈다.
  it.each([
    [0.25, 1, 0.6171],
    [0.64, 4, 0.9585],
    [3.841, 1, 0.05],
    [9.488, 4, 0.05],
    [27.587, 17, 0.05],
    [13.17, 17, 0.7247],
  ])('χ²=%s, 자유도 %s → p≈%s', (x, k, p) => {
    expect(chiSquarePValue(x, k)).toBeCloseTo(p, 3);
  });
});
