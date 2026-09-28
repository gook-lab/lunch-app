import { describe, it, expect } from 'vitest';
import { wheelAngle, wheelLabelOffset, slotStops, slotReelCopies } from './spin';

const COUNTS = [1, 2, 3, 4, 5, 6, 8, 12];

describe('wheelAngle — 당첨 칸이 바늘 밑에 선다', () => {
  it('모든 후보 수와 모든 당첨에 대해 라벨이 바늘에서 0도', () => {
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        for (const turns of [0, 4, 8, 40]) {
          expect(wheelLabelOffset(i, count, turns)).toBeCloseTo(0, 6);
        }
      }
    }
  });

  it('판을 거듭해도 항상 앞으로 돈다 — 제자리에 서지 않는다', () => {
    // turns 는 판마다 4씩 는다. 같은 곳이 또 당첨돼도 4바퀴를 더 돈다.
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        for (let run = 1; run < 5; run += 1) {
          const before = wheelAngle(i, count, run * 4 - 4);
          const after = wheelAngle(i, count, run * 4);
          expect(after - before).toBe(4 * 360);
        }
      }
    }
  });

  it('후보 0곳이면 0도', () => {
    expect(wheelAngle(0, 0, 4)).toBe(0);
    expect(wheelLabelOffset(0, 0, 4)).toBe(0);
  });
});

describe('slotStops — 릴이 매 판 돈다', () => {
  const LOOPS = 6;

  it('멈춘 칸이 당첨과 같다', () => {
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        for (const current of [0, 1, 7, 31, 99]) {
          const { target } = slotStops(current, i, count, LOOPS);
          expect(target % count).toBe(i);
        }
      }
    }
  });

  it('항상 앞으로 LOOPS 바퀴 이상 돈다', () => {
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        for (const current of [0, 1, 7, 31, 99]) {
          const { home, target } = slotStops(current, i, count, LOOPS);
          expect(target - home).toBeGreaterThanOrEqual(LOOPS * count);
        }
      }
    }
  });

  it('되감기가 화면을 바꾸지 않는다 — home 은 현재와 같은 칸', () => {
    for (const count of COUNTS) {
      for (const current of [0, 1, 7, 31, 99]) {
        const { home } = slotStops(current, 0, count, LOOPS);
        expect(home % count).toBe(((current % count) + count) % count);
        expect(home).toBeGreaterThanOrEqual(0);
        expect(home).toBeLessThan(count);
      }
    }
  });

  it('연달아 여러 판을 돌려도 매 판 이동량이 LOOPS 바퀴 이상', () => {
    // 두 판째부터 릴이 서던 회귀. 같은 곳이 연속 당첨되는 경우를 포함한다.
    for (const count of COUNTS) {
      let cur = 0;
      const winners = [0, 0, count - 1, count - 1, 0, 1 % count];
      for (const w of winners) {
        const { home, target } = slotStops(cur, w, count, LOOPS);
        expect(target - home).toBeGreaterThanOrEqual(LOOPS * count);
        expect(target % count).toBe(w);
        cur = target;
      }
    }
  });

  it('멈출 위치가 붙여 둔 목록 안에 있다 — 창이 idx+1 까지 본다', () => {
    for (const count of COUNTS) {
      const len = slotReelCopies(LOOPS) * count;
      let cur = 0;
      for (let run = 0; run < 20; run += 1) {
        const w = run % count;
        const { target } = slotStops(cur, w, count, LOOPS);
        expect(target + 1).toBeLessThan(len);
        cur = target;
      }
    }
  });

  it('후보 0곳이면 0', () => {
    expect(slotStops(5, 0, 0, 6)).toEqual({ home: 0, target: 0 });
  });
});
