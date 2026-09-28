import { describe, it, expect } from 'vitest';
import {
  wheelAngle,
  wheelLabelOffset,
  wheelLabelFlipped,
  slotStops,
  slotReelCopies,
} from './spin';

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

describe('wheelLabelFlipped — 멈춘 뒤 당첨 이름이 바로 선다', () => {
  it('당첨 라벨은 어떤 후보 수에서도 안 뒤집힌다', () => {
    // 당첨 칸은 항상 화면 0도(바늘 밑)로 온다. 거기서 뒤집으면 거꾸로 읽힌다.
    for (const count of COUNTS) {
      for (let i = 0; i < count; i += 1) {
        for (const turns of [0, 4, 8, 40]) {
          expect(wheelLabelFlipped(i, count, wheelAngle(i, count, turns))).toBe(false);
        }
      }
    }
  });

  it('화면 아래쪽 절반에 선 라벨은 뒤집는다', () => {
    // 원판이 안 돌아간 상태: mid 가 그대로 화면 각도다.
    // 90 도와 270 도는 경계다 — 글자가 세로로 서서 어느 쪽도 거꾸로가 아니다.
    expect(wheelLabelFlipped(0, 2, 0)).toBe(false); // mid 90
    expect(wheelLabelFlipped(1, 2, 0)).toBe(false); // mid 270
    for (const count of [4, 5, 8, 12]) {
      const slice = 360 / count;
      for (let i = 0; i < count; i += 1) {
        const mid = i * slice + slice / 2;
        expect(wheelLabelFlipped(i, count, 0)).toBe(mid > 90 && mid < 270);
      }
    }
  });

  it('후보 1곳 — mid 가 180 이라 안 고치면 매번 거꾸로 선다', () => {
    expect(wheelLabelFlipped(0, 1, 0)).toBe(true); // 안 돌린 상태에서는 뒤집힌다
    expect(wheelLabelFlipped(0, 1, wheelAngle(0, 1, 4))).toBe(false); // 멈추면 바로 선다
  });

  it('후보 0곳이면 안 뒤집는다', () => {
    expect(wheelLabelFlipped(0, 0, 0)).toBe(false);
  });
})
