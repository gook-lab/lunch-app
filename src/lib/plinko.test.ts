import { describe, it, expect } from 'vitest';
import { createPath, tracePath, pinsForRow } from './plinko';

describe('plinko', () => {
  describe('createPath', () => {
    it('should create path with correct right moves for each winnerIndex', () => {
      // 5 가지 도착점(0~4), 행 수 4.
      for (let w = 0; w < 5; w += 1) {
        const path = createPath(w, 4);
        const rights = path.filter((d) => d === 'R').length;
        expect(rights).toBe(w);
      }
    });

    it('should have correct total moves', () => {
      const path = createPath(2, 4);
      expect(path.length).toBe(4); // rows
    });

    it('should handle single place', () => {
      const path = createPath(0, 0);
      expect(path).toEqual([]);
    });
  });

  describe('tracePath', () => {
    it('should start at center', () => {
      const path = createPath(0, 3);
      const trace = tracePath(path, 100, 30);
      expect(trace[0]).toEqual({ x: 50, y: 0 });
    });

    it('should move down by pinSpacing each step', () => {
      const path = createPath(0, 3);
      const trace = tracePath(path, 100, 30);
      for (let i = 1; i < trace.length; i += 1) {
        expect(trace[i].y).toBe(trace[i - 1].y + 30);
      }
    });

    it('should move horizontally based on direction', () => {
      const path = ['R', 'L', 'R'] as const;
      const trace = tracePath(path, 100, 20);
      expect(trace[0].x).toBe(50); // start
      expect(trace[1].x).toBeGreaterThan(50); // right
      expect(trace[2].x).toBeLessThan(trace[1].x); // left
      expect(trace[3].x).toBeGreaterThan(trace[2].x); // right
    });
  });

  describe('pinsForRow', () => {
    it('should create correct number of pins', () => {
      const pins = pinsForRow(2, 100, 30);
      expect(pins).toHaveLength(3); // row 2 has 2+1 pins
    });

    it('should place pins at correct y position', () => {
      const pins = pinsForRow(2, 100, 30);
      expect(pins.every((p) => p.y === 90)).toBe(true); // (2+1) * 30
    });

    it('should be centered around mid x', () => {
      const pins = pinsForRow(1, 100, 30);
      const mid = 50;
      expect(pins[0].x).toBeLessThan(mid);
      expect(pins[1].x).toBeGreaterThan(mid);
    });
  });
});
