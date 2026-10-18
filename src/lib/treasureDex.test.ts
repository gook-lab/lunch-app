// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTreasureDex,
  recordTreasures,
  TREASURE_GROUPS,
  TREASURE_KINDS,
  TREASURE_TOTAL,
  treasureKindFor,
  treasureName,
  treasureNews,
  type TreasureId,
} from './treasureDex';

beforeEach(() => localStorage.clear());

describe('treasureDex', () => {
  it('56칸이고 칸마다 이름이 다르다', () => {
    expect(TREASURE_TOTAL).toBe(56);
    const names = TREASURE_GROUPS.flatMap((g) => TREASURE_KINDS.map((k) => treasureName(`${g}-${k}` as TreasureId)));
    expect(names.every(Boolean)).toBe(true);
    expect(new Set(names).size).toBe(56);
  });

  it('기록은 중복 없이 쌓이고 다시 읽힌다', () => {
    recordTreasures(['autumn-crown', 'fri-crown']);
    recordTreasures(['autumn-crown']);
    expect(getTreasureDex()).toEqual(['autumn-crown', 'fri-crown']);
  });

  it('새 보물·한 줄 완성·다 채움 순으로 한 줄만 말한다', () => {
    expect(treasureNews([], ['autumn-gem'])).toEqual({ text: '✨ 새 보물! 도감 1/56', big: false });
    expect(treasureNews(['autumn-gem'], ['autumn-gem'])).toBeNull();
    const six = TREASURE_KINDS.slice(1).map((k) => `autumn-${k}` as TreasureId);
    expect(treasureNews(six, ['autumn-crown'])?.text).toBe('🎉 가을 보물을 다 모았어요!');
    const all = TREASURE_GROUPS.flatMap((g) => TREASURE_KINDS.map((k) => `${g}-${k}` as TreasureId));
    expect(treasureNews(all.slice(1), [all[0]])?.big).toBe(true);
  });

  it('보물 종류는 난수로만 정해지고 언제나 일곱 가지 안이다', () => {
    expect(treasureKindFor(() => 0)).toBe('crown');
    expect(treasureKindFor(() => 0.9999)).toBe('map');
  });
});
