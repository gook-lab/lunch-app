import { describe, it, expect } from 'vitest';
import { CATEGORIES, categoryFromKakao } from './category';

describe('categoryFromKakao', () => {
  it('구체적인 하위 분류가 상위 분류를 이긴다', () => {
    // 카카오는 국수집도 한식 아래에 넣는다. 칩은 "면" 이 맞다.
    expect(categoryFromKakao('음식점 > 한식 > 국수')).toBe('면');
    expect(categoryFromKakao('음식점 > 한식 > 육류,고기')).toBe('고기');
    expect(categoryFromKakao('음식점 > 한식 > 칼국수')).toBe('면');
  });

  it('상위 분류만 있으면 그걸 쓴다', () => {
    expect(categoryFromKakao('음식점 > 한식')).toBe('한식');
    expect(categoryFromKakao('음식점 > 중식')).toBe('중식');
    expect(categoryFromKakao('음식점 > 분식')).toBe('분식');
  });

  it('양식 계열을 모은다', () => {
    expect(categoryFromKakao('음식점 > 양식 > 이탈리안')).toBe('양식');
    expect(categoryFromKakao('음식점 > 패스트푸드 > 피자')).toBe('양식');
    expect(categoryFromKakao('음식점 > 양식 > 스테이크,립')).toBe('양식');
  });

  it('애매하면 null — 지어내지 않는다', () => {
    expect(categoryFromKakao('음식점 > 일식 > 초밥,롤')).toBeNull();
    expect(categoryFromKakao('음식점 > 치킨')).toBeNull();
    expect(categoryFromKakao('음식점 > 아시아음식 > 베트남음식')).toBeNull();
    expect(categoryFromKakao('카페 > 커피전문점')).toBeNull();
  });

  it('빈 문자열과 빠진 값에도 던지지 않는다', () => {
    expect(categoryFromKakao('')).toBeNull();
    expect(categoryFromKakao(undefined as unknown as string)).toBeNull();
  });

  it('돌려주는 값은 항상 칩 목록 안에 있다', () => {
    const samples = [
      '음식점 > 한식 > 국수',
      '음식점 > 한식 > 육류,고기',
      '음식점 > 분식',
      '음식점 > 중식 > 중국요리',
      '음식점 > 양식 > 이탈리안',
      '음식점 > 한식 > 백반',
    ];
    for (const s of samples) {
      const got = categoryFromKakao(s);
      expect(got).not.toBeNull();
      expect(CATEGORIES).toContain(got!);
    }
  });
});
