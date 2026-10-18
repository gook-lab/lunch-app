import { describe, expect, it } from 'vitest';
import { menuSummary } from './filterSummary';

describe('menuSummary', () => {
  it('아무것도 안 골랐으면 전체 메뉴', () => {
    expect(menuSummary({ categories: [] })).toBe('전체 메뉴');
  });
  it('메뉴·세부·나라 중 실제로 거르는 쪽을 쓴다', () => {
    expect(menuSummary({ categories: ['면'] })).toBe('면');
    expect(menuSummary({ categories: ['면'], subs: ['라멘·우동'] })).toBe('라멘·우동');
    expect(menuSummary({ categories: ['면'], cuisines: ['중식', '일식'] })).toBe('중식·일식');
  });
  it('셋 이상이면 둘만 쓰고 나머지는 수로', () => {
    expect(menuSummary({ categories: ['밥', '면', '고기', '분식'] })).toBe('밥·면 외 2');
  });
});
