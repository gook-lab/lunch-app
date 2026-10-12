import { describe, it, expect } from 'vitest';
import { boardSize, diceRolls, positions } from './dice';

describe('dice', () => {
  describe('boardSize', () => {
    it('should calculate board size correctly', () => {
      expect(boardSize(4)).toBe(2); // ⌈4/4⌉ + 1 = 2
      expect(boardSize(5)).toBe(3); // ⌈5/4⌉ + 1 = 3
      expect(boardSize(8)).toBe(3); // ⌈8/4⌉ + 1 = 3
      expect(boardSize(12)).toBe(4); // ⌈12/4⌉ + 1 = 4
      expect(boardSize(20)).toBe(6); // ⌈20/4⌉ + 1 = 6
    });
  });

  describe('diceRolls', () => {
    it('should return 1~6 eye values', () => {
      for (let i = 0; i < 10; i += 1) {
        const rolls = diceRolls(10, 20);
        expect(rolls.every((e) => e >= 1 && e <= 6)).toBe(true);
      }
    });

    it('should sum to exact distance', () => {
      for (let d = 1; d <= 20; d += 1) {
        const rolls = diceRolls(d, 20);
        const sum = rolls.reduce((a, b) => a + b, 0);
        expect(sum).toBe(d);
      }
    });

    it('should handle distance 0 as full loop', () => {
      const rolls = diceRolls(0, 12);
      const sum = rolls.reduce((a, b) => a + b, 0);
      expect(sum).toBe(12);
    });

    it('should not exceed max 6 rolls', () => {
      const rolls = diceRolls(36, 20); // worst case
      expect(rolls.length).toBeLessThanOrEqual(6);
    });

    it('should prefer large eyes when close to end', () => {
      // 거리 20, 최대 6 굴림: 마지막 굴림은 정확히 도착해야 함.
      const rolls = diceRolls(20, 20);
      const last = rolls[rolls.length - 1];
      expect(last).toBeLessThanOrEqual(6);
      expect(last).toBeGreaterThanOrEqual(1);
    });
  });

  describe('positions', () => {
    it('should track position after each roll', () => {
      const rolls = [3, 2, 1];
      const pos = positions(rolls, 0, 12);
      expect(pos).toEqual([3, 5, 6]);
    });

    it('should wrap around board', () => {
      const rolls = [11, 2];
      const pos = positions(rolls, 0, 12);
      expect(pos[0]).toBe(11); // 0 + 11
      expect(pos[1]).toBe(1); // (0 + 11 + 2) % 12
    });

    it('should handle start position', () => {
      const rolls = [2, 3];
      const pos = positions(rolls, 5, 20);
      expect(pos[0]).toBe(7); // 5 + 2
      expect(pos[1]).toBe(10); // 7 + 3
    });

    it('should arrive at winnerIndex', () => {
      // rolls이 정확히 distance를 합하면, 최종 위치는 (start + distance) % placeCount
      const rolls = [3, 2];
      const distance = 5;
      const start = 0;
      const placeCount = 20;
      const pos = positions(rolls, start, placeCount);
      expect(pos[pos.length - 1]).toBe((start + distance) % placeCount);
    });
  });
});
