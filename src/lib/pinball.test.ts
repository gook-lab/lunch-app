import { describe, it, expect } from 'vitest';
import { simulateRace, seedForWinner, buildCourse, COURSE_W, BOARD_H, FINISH_Y } from './pinball';

describe('simulateRace — 물리가 판을 벗어나지 않는다', () => {
  it('구슬이 항상 판 안에 있다', () => {
    for (const seed of [1, 7, 42, 1234]) {
      const { frames } = simulateRace(6, seed);
      for (const frame of frames) {
        for (const m of frame) {
          expect(m.x).toBeGreaterThanOrEqual(0);
          expect(m.x).toBeLessThanOrEqual(COURSE_W);
          expect(m.y).toBeGreaterThanOrEqual(0);
          expect(m.y).toBeLessThanOrEqual(BOARD_H);
        }
      }
    }
  });

  it('같은 시드는 같은 경기를 만든다', () => {
    const a = simulateRace(5, 99);
    const b = simulateRace(5, 99);
    expect(a.order).toEqual(b.order);
    expect(a.frames.length).toBe(b.frames.length);
    expect(a.frames.at(-1)).toEqual(b.frames.at(-1));
  });

  it('다른 시드는 대체로 다른 경기를 만든다', () => {
    const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => simulateRace(5, s).winner));
    expect(winners.size).toBeGreaterThan(1);
  });

  it('순위에 모든 구슬이 한 번씩 들어간다', () => {
    for (const count of [2, 3, 5, 8]) {
      const { order } = simulateRace(count, 17);
      expect(order).toHaveLength(count);
      expect(new Set(order).size).toBe(count);
      expect([...order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: count }, (_, i) => i),
      );
    }
  });

  it('구슬이 아래로 내려간다 — 마지막 프레임이 첫 프레임보다 낮다', () => {
    const { frames } = simulateRace(5, 3);
    const first = frames[0];
    const last = frames[frames.length - 1];
    for (let i = 0; i < first.length; i += 1) {
      expect(last[i].y).toBeGreaterThan(first[i].y);
    }
  });
});

describe('seedForWinner — 연출이 결과를 정하지 않는다', () => {
  it('모든 후보 수와 모든 목표에 대해 시드를 찾는다', () => {
    for (const count of [2, 3, 4, 5, 6, 7, 8]) {
      for (let target = 0; target < count; target += 1) {
        const seed = seedForWinner(count, target);
        expect(seed, `count=${count} target=${target} 시드를 못 찾음`).not.toBeNull();
        expect(simulateRace(count, seed!).winner).toBe(target);
      }
    }
  });

  it('후보가 1곳이면 그 구슬이 이긴다', () => {
    const seed = seedForWinner(1, 0);
    expect(seed).not.toBeNull();
    expect(simulateRace(1, seed!).winner).toBe(0);
  });

  it('범위를 벗어난 목표는 null', () => {
    expect(seedForWinner(5, 5)).toBeNull();
    expect(seedForWinner(5, -1)).toBeNull();
    expect(seedForWinner(0, 0)).toBeNull();
  });
});

describe('buildCourse', () => {
  it('코스가 판 안에 있고 시드와 무관하게 항상 같다', () => {
    const a = buildCourse();
    const b = buildCourse();
    expect(a).toEqual(b);
    expect(a.pegs.length).toBeGreaterThan(5);
    expect(a.walls.length).toBeGreaterThan(3);

    for (const peg of a.pegs) {
      expect(peg.x).toBeGreaterThan(0);
      expect(peg.x).toBeLessThan(COURSE_W);
      expect(peg.y).toBeGreaterThan(0);
      expect(peg.y).toBeLessThan(FINISH_Y);
    }
    for (const w of a.walls) {
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(COURSE_W);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(BOARD_H);
      }
    }
  });

  it('코스가 좌우 대칭이다 — 기울면 특정 레인이 영영 불리해진다', () => {
    const { walls, pegs } = buildCourse();
    const mirror = (v: number) => COURSE_W - v;
    for (const w of walls) {
      const twin = walls.find(
        (o) => Math.abs(o.x1 - mirror(w.x1)) < 0.001 && Math.abs(o.y1 - w.y1) < 0.001,
      );
      expect(twin, `벽 (${w.x1},${w.y1}) 의 짝이 없습니다`).toBeDefined();
    }
    for (const g of pegs) {
      const twin = pegs.find(
        (o) => Math.abs(o.x - mirror(g.x)) < 0.001 && Math.abs(o.y - g.y) < 0.001,
      );
      expect(twin, `핀 (${g.x},${g.y}) 의 짝이 없습니다`).toBeDefined();
    }
  });
});

describe('standings — 순위판이 읽는 값', () => {
  it('프레임마다 순위가 있고, 모든 구슬이 한 번씩 들어간다', () => {
    const { frames, standings } = simulateRace(6, 21);
    expect(standings).toHaveLength(frames.length);
    for (const s of standings) {
      expect(s).toHaveLength(6);
      expect(new Set(s).size).toBe(6);
    }
  });

  it('경기 중에 순위가 실제로 뒤바뀐다', () => {
    /*
     * 순위판이 처음부터 끝까지 그대로면 달아 둘 이유가 없다. 재생 구간
     * 안에서 선두가 바뀌는지 본다 — 실측으로 5곳·시드 5 에서 6가지 순서가
     * 나왔고, 당첨 구슬이 40% 지점에서 선두로 올라섰다.
     */
    const seed = seedForWinner(5, 2)!;
    const r = simulateRace(5, seed);
    const last = Math.max(1, r.winnerFrame);

    const seen = new Set<string>();
    for (let i = 0; i <= 10; i += 1) {
      const f = Math.min(r.frames.length - 1, Math.round((i / 10) * last));
      seen.add(r.standings[f].join('>'));
    }
    expect(seen.size, `순위가 ${seen.size}가지뿐입니다`).toBeGreaterThan(2);

    // 선두도 한 번은 바뀌어야 한다.
    const leaders = new Set<number>();
    for (let f = 0; f <= last; f += 1) leaders.add(r.standings[f][0]);
    expect(leaders.size).toBeGreaterThan(1);
  });

  it('마지막 순위가 최종 순서와 같다', () => {
    const { standings, order } = simulateRace(5, 33);
    expect(standings.at(-1)).toEqual(order);
  });

  it('들어온 구슬은 순위에서 다시 뒤로 밀리지 않는다', () => {
    // 완주한 구슬이 앞에 고정돼야 순위판이 요동치지 않는다.
    const { frames, standings, order } = simulateRace(5, 8);
    let finished = 0;
    for (let t = 0; t < frames.length; t += 1) {
      const atFinish = frames[t].filter((m) => m.y >= FINISH_Y).length;
      finished = Math.max(finished, atFinish);
      expect(standings[t].slice(0, finished)).toEqual(order.slice(0, finished));
    }
  });
});

describe('판이 특정 레인을 구조적으로 불리하게 만들지 않는다', () => {
  /**
   * 화면에 "어느 쪽으로 돌려도 확률은 같습니다" 라고 적어 두었다.
   * 그 약속은 어떤 구슬이든 이길 수 있어야 성립한다.
   *
   * 실제로 핀을 한쪽으로만 엇갈리게 깔았을 때는 오른쪽 끝 구슬이 600 시드 중
   * 한 번도 못 이겼다. 그러면 그 가게는 영원히 안 걸린다.
   * 출발 레인을 시드로 섞어서 고쳤고, 이 테스트가 그 회귀를 막는다.
   */
  const SEEDS = 150;

  it(
    '모든 구슬이 이길 수 있고, 한 구슬이 독차지하지 않는다',
    () => {
      for (const count of [2, 3, 4, 5, 6, 7, 8]) {
        const tally = new Array<number>(count).fill(0);
        for (let seed = 1; seed <= SEEDS; seed += 1) {
          tally[simulateRace(count, seed).winner] += 1;
        }

        for (let i = 0; i < count; i += 1) {
          expect(
            tally[i],
            `count=${count} 구슬 ${i} 가 ${SEEDS} 시드 중 한 번도 못 이김 — ${tally.join(',')}`,
          ).toBeGreaterThan(0);
        }

        // 2곳일 때는 한쪽이 절반을 넘는 게 정상이다. 3곳 이상만 본다.
        if (count >= 3) {
          expect(Math.max(...tally), `count=${count} 편중 — ${tally.join(',')}`).toBeLessThan(
            SEEDS * 0.5,
          );
        }
      }
    },
    20_000,
  );
});

describe('완주 — 마지막 프레임에 전원이 결승선 아래', () => {
  // 재생이 winnerFrame 에서 끊겨 순위판이 "1 / 5" 로 멈추던 버그의 회귀 테스트.
  // 화면은 마지막 프레임까지 돌리므로, 마지막 프레임이 전원 도착이어야
  // 순위판이 N / N 에 닿는다.
  for (const count of [2, 3, 5, 8, 12]) {
    it(`후보 ${count}곳`, () => {
      for (let target = 0; target < count; target += 1) {
        const seed = seedForWinner(count, target);
        expect(seed).not.toBeNull();
        const r = simulateRace(count, seed!);

        const last = r.frames[r.frames.length - 1];
        const arrived = last.filter((m) => m.y >= FINISH_Y).length;
        expect(arrived).toBe(count);

        // 순위판도 마지막 프레임에서 전원을 담는다.
        expect(r.standings[r.standings.length - 1]).toHaveLength(count);

        // 1등 도착은 전체보다 먼저다 — 꼬리 구간이 존재한다.
        expect(r.winnerFrame).toBeLessThan(r.frames.length);
      }
    });
  }

  it('1등 도착 뒤에도 프레임이 남는다 (꼬리 구간 최소 길이)', () => {
    let tailless = 0;
    for (let count = 2; count <= 8; count += 1) {
      for (let target = 0; target < count; target += 1) {
        const r = simulateRace(count, seedForWinner(count, target)!);
        if (r.frames.length - 1 - r.winnerFrame < 5) tailless += 1;
      }
    }
    // 후보 2곳에서 둘이 나란히 들어오는 경우는 있을 수 있으나 드물어야 한다.
    expect(tailless).toBeLessThan(4);
  });
})

describe('시드 탐색이 매번 같은 경기를 주지 않는다', () => {
  // 컴포넌트가 startSeed 를 안 넘기면 seedForWinner 는 (후보 수, 당첨) 마다
  // 늘 같은 시드를 준다 — 후보 5곳이면 항상 2, 1, 5, 4, 3 이라 같은 곳이
  // 당첨될 때마다 똑같은 경기가 재생된다. 시작 시드를 흔들어야 한다.
  it('기본 시작 시드는 결정적이다 — 그래서 흔들어야 한다', () => {
    for (const count of [3, 5, 8]) {
      for (let t = 0; t < count; t += 1) {
        expect(seedForWinner(count, t)).toBe(seedForWinner(count, t));
      }
    }
  });

  it('시작 시드를 흔들면 어디서 시작해도 찾는다', () => {
    // 후보 수를 1..12 전부 훑는다. 못 찾으면 race 가 null 이 되고 연출이
    // 끝나지 않는다 — 워치독이 12초 뒤 잠금만 풀 뿐 결과가 안 나온다.
    // 실측으로 4680회 탐색에서 실패 0회였지만, 물리를 건드리면 특정 레인이
    // 도달 불가가 될 수 있으므로 여기서 막는다.
    for (let count = 1; count <= 12; count += 1) {
      for (let k = 0; k < 16; k += 1) {
        const start = 1 + Math.floor(Math.random() * 100_000);
        const target = k % count;
        const seed = seedForWinner(count, target, 600, start);
        expect(seed).not.toBeNull();
        expect(seed).toBeGreaterThanOrEqual(start);
        // 흔들어도 당첨은 그대로다. 연출만 달라진다.
        expect(simulateRace(count, seed!).winner).toBe(target);
      }
    }
  });

  it('시작 시드가 다르면 경기도 대체로 다르다', () => {
    for (const count of [5, 12]) {
      const orders = new Set<string>();
      for (let k = 0; k < 60; k += 1) {
        const seed = seedForWinner(count, 0, 600, 1 + Math.floor(Math.random() * 100_000))!;
        orders.add(simulateRace(count, seed).order.join('>'));
      }
      // 후보 5곳은 1등이 고정이라 나머지 4곳의 순열 24개가 상한이다.
      expect(orders.size).toBeGreaterThan(count === 5 ? 8 : 20);
    }
  });
})

describe('경기 길이 — 슬로모션 없이 재생할 수 있어야 한다', () => {
  // 예전 코스는 1등이 52프레임(0.9초)에 들어와 4초로 늘려 틀었다. 0.22배
  // 슬로모션이라 출발 직후 구슬이 떠 있는 것처럼 보였다. 재생은 1등 도착을
  // 2.2~4.2초(132~252프레임)로 맞추므로, 경기 자체가 그 근처여야 배속이 1에 가깝다.
  it.each([3, 5, 12, 20])('후보 %i곳: 1등 도착이 평균 90~260프레임', (count) => {
    // 20곳은 구슬이 많아 누군가는 빨리 빠진다(평균 106프레임). 재생이 2.2초로
    // 당겨 0.8배 남짓 — 눈에 띄는 슬로모션은 아니다.
    let sum = 0;
    for (let s = 1; s <= 30; s += 1) sum += simulateRace(count, s).winnerFrame;
    const avg = sum / 30;
    expect(avg).toBeGreaterThan(90);
    expect(avg).toBeLessThan(260);
  });

  it.each([2, 5, 8, 12, 20])('후보 %i곳: 구슬이 어디에도 걸리지 않고 전원 완주한다', (count) => {
    // 장애물 사이 틈이 구슬 지름보다 좁으면 주머니가 생겨 경기가 안 끝난다.
    for (let s = 1; s <= 40; s += 1) {
      const { frames } = simulateRace(count, s);
      const last = frames[frames.length - 1];
      expect(last.every((m) => m.y >= FINISH_Y), `시드 ${s}`).toBe(true);
    }
  });

  it('출발하자마자 내려간다 — 3프레임 안에 평균 4px 이상', () => {
    const { frames } = simulateRace(8, 42);
    const mean = (f: { y: number }[]) => f.reduce((a, m) => a + m.y, 0) / f.length;
    expect(mean(frames[3]) - mean(frames[0])).toBeGreaterThan(4);
  });
});

describe('코스 — 구간이 달라야 단조롭지 않다', () => {
  it('범퍼가 있고 좌우 대칭이다', () => {
    const { pegs } = buildCourse();
    const bumpers = pegs.filter((p) => p.bumper);
    expect(bumpers.length).toBeGreaterThanOrEqual(2);
    for (const b of bumpers) {
      expect(bumpers.some((o) => Math.abs(o.x - (COURSE_W - b.x)) < 1e-9 && o.y === b.y)).toBe(true);
    }
  });

  it('장애물이 위아래로 고르게 퍼져 있다 — 빈 구간이 60px 를 넘지 않는다', () => {
    const { pegs, walls } = buildCourse();
    const ys = [...pegs.map((p) => p.y), ...walls.flatMap((w) => [w.y1, w.y2])].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeLessThanOrEqual(60);
  });
});
