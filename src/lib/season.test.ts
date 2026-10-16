import { describe, it, expect } from 'vitest';
import { seasonOf, resolvedSeason, savedSeason } from './season';

describe('seasonOf', () => {
  it('should return spring for March-May (KST)', () => {
    expect(seasonOf(new Date('2024-03-15'))).toBe('spring');
    expect(seasonOf(new Date('2024-04-15'))).toBe('spring');
    expect(seasonOf(new Date('2024-05-15'))).toBe('spring');
  });

  it('should return summer for June-August (KST)', () => {
    expect(seasonOf(new Date('2024-06-15'))).toBe('summer');
    expect(seasonOf(new Date('2024-07-15'))).toBe('summer');
    expect(seasonOf(new Date('2024-08-15'))).toBe('summer');
  });

  it('should return autumn for September-November (KST)', () => {
    expect(seasonOf(new Date('2024-09-15'))).toBe('autumn');
    expect(seasonOf(new Date('2024-10-15'))).toBe('autumn');
    expect(seasonOf(new Date('2024-11-15'))).toBe('autumn');
  });

  it('should return winter for December-February (KST)', () => {
    expect(seasonOf(new Date('2024-12-15'))).toBe('winter');
    expect(seasonOf(new Date('2025-01-15'))).toBe('winter');
    expect(seasonOf(new Date('2025-02-15'))).toBe('winter');
  });

  it('should handle month boundaries correctly', () => {
    // Last day of spring
    expect(seasonOf(new Date('2024-05-31'))).toBe('spring');
    // First day of summer
    expect(seasonOf(new Date('2024-06-01'))).toBe('summer');
    // First day of spring
    expect(seasonOf(new Date('2024-03-01'))).toBe('spring');
    // Last day of winter
    expect(seasonOf(new Date('2024-02-29'))).toBe('winter');
  });
});

describe('resolvedSeason', () => {
  it('should return off when mode is off', () => {
    expect(resolvedSeason('off')).toBe('off');
  });

  it('should return the mode when it is a specific season', () => {
    expect(resolvedSeason('spring')).toBe('spring');
    expect(resolvedSeason('summer')).toBe('summer');
    expect(resolvedSeason('autumn')).toBe('autumn');
    expect(resolvedSeason('winter')).toBe('winter');
  });

  it('should resolve auto to current season', () => {
    const resolved = resolvedSeason('auto');
    expect(['spring', 'summer', 'autumn', 'winter']).toContain(resolved);
  });
});

describe('savedSeason', () => {
  it('should return auto by default when nothing is saved', () => {
    expect(savedSeason()).toBe('auto');
  });
});
