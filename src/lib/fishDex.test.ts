// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearFishDex, fishName, getFishDex, recordCaughtFish, specialsFor, type FishSpeciesId } from './fishDex';

describe('fishDex', () => {
  beforeEach(() => {
    clearFishDex();
    localStorage.clear();
  });

  afterEach(() => {
    clearFishDex();
  });

  it('처음엔 도감이 비어있다', () => {
    const dex = getFishDex();
    expect(dex).toEqual([]);
  });

  it('낚은 물고기를 기록한다', () => {
    const speciesId: FishSpeciesId = 'spring-carp';
    recordCaughtFish(speciesId);
    const dex = getFishDex();
    expect(dex).toContain(speciesId);
  });

  it('같은 물고기를 두 번 기록하면 한 번만 저장된다', () => {
    const speciesId: FishSpeciesId = 'summer-mackerel';
    recordCaughtFish(speciesId);
    recordCaughtFish(speciesId);
    const dex = getFishDex();
    expect(dex.filter((id) => id === speciesId)).toHaveLength(1);
  });

  it('여러 물고기를 기록할 수 있다', () => {
    const species: FishSpeciesId[] = ['spring-carp', 'summer-mackerel', 'autumn-sardine', 'winter-whale'];
    species.forEach((s) => recordCaughtFish(s));
    const dex = getFishDex();
    expect(dex).toEqual(expect.arrayContaining(species));
  });

  it('도감을 초기화한다', () => {
    recordCaughtFish('spring-carp');
    clearFishDex();
    const dex = getFishDex();
    expect(dex).toEqual([]);
  });

  it('localStorage 가 없으면 빈 도감을 반환한다', () => {
    localStorage.clear();
    const dex = getFishDex();
    expect(dex).toEqual([]);
  });

  it('잘못된 JSON 데이터는 무시한다', () => {
    localStorage.setItem('lunch-app:fish-dex', '{invalid json}');
    const dex = getFishDex();
    expect(dex).toEqual([]);
  });

  it('버전이 맞지 않으면 도감을 리셋한다', () => {
    localStorage.setItem('lunch-app:fish-dex', JSON.stringify({ version: 999, caught: ['spring-carp'] }));
    const dex = getFishDex();
    expect(dex).toEqual([]);
  });

  it('저장 실패는 무시한다', () => {
    const originalSetItem = localStorage.setItem;
    try {
      localStorage.setItem = () => {
        throw new Error('Storage error');
      };
      // 저장에 실패해도 에러를 던지지 않는다.
      expect(() => recordCaughtFish('spring-carp')).not.toThrow();
    } finally {
      localStorage.setItem = originalSetItem;
    }
  });

  it('특별한 날 — 비·눈·안개는 하나, 금요일은 더해진다', () => {
    expect(specialsFor({ weather: 'clear', weekday: 2 })).toEqual([]);
    expect(specialsFor({ weather: 'cloudy', weekday: 5 })).toEqual(['fri']);
    expect(specialsFor({ weather: 'rain', weekday: 5 })).toEqual(['rain', 'fri']);
    expect(specialsFor({ weather: 'snow', weekday: 1 })).toEqual(['snow']);
  });

  it('특별한 날 물고기 이름과 기록', () => {
    expect(fishName('rain-squid')).toBe('먹물 문어');
    expect(fishName('fri-carp')).toBe('황금 잉어');
    expect(fishName('autumn-sardine')).toBe('전어');
    recordCaughtFish('snow-sardine');
    expect(getFishDex()).toContain('snow-sardine');
  });
});
