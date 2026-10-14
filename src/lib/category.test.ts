import { describe, it, expect } from 'vitest';
import { CATEGORIES, MENUS, categoryFromKakao, categoryHue, categoryIcon, classify, subsOf } from './category';

describe('categoryFromKakao', () => {
  it('카카오 분류에서 세부를 고른다 — 구체적인 쪽이 이긴다', () => {
    expect(categoryFromKakao('음식점 > 한식 > 국수')).toBe('국수·냉면');
    expect(categoryFromKakao('음식점 > 한식 > 육류,고기')).toBe('고기구이');
    expect(categoryFromKakao('음식점 > 일식 > 돈까스,우동')).toBe('돈까스');
    expect(categoryFromKakao('음식점 > 중식 > 중국요리')).toBe('짬뽕·짜장');
    expect(categoryFromKakao('음식점 > 양식 > 이탈리안')).toBe('파스타');
    expect(categoryFromKakao('음식점 > 패스트푸드 > 피자')).toBe('피자');
    expect(categoryFromKakao('음식점 > 치킨')).toBe('치킨');
    expect(categoryFromKakao('음식점 > 아시아음식 > 베트남음식')).toBe('쌀국수');
  });

  it('음식점이 아니거나 애매하면 null', () => {
    expect(categoryFromKakao('카페 > 커피전문점')).toBeNull();
    expect(categoryFromKakao('음식점 > 한식')).toBeNull();
    expect(categoryFromKakao('')).toBeNull();
    expect(categoryFromKakao(undefined as unknown as string)).toBeNull();
  });
});

describe('classify', () => {
  it('세부 이름은 그대로 메뉴를 찾는다', () => {
    expect(classify('라멘·우동')).toEqual({ menu: '면', sub: '라멘·우동' });
  });

  it('예전 값은 가게 이름으로 세부를 짐작한다', () => {
    expect(classify('면', '천수냉면 이대점')).toEqual({ menu: '면', sub: '국수·냉면' });
    expect(classify('한식', '박가네')).toEqual({ menu: '밥', sub: null });
    expect(classify('한식', '할머니 김치찌개')).toEqual({ menu: '밥', sub: '국밥·찌개' });
    expect(classify('한식', '평양냉면집')).toEqual({ menu: '면', sub: '국수·냉면' });
    expect(classify('일식', '돈카츠 하루')).toEqual({ menu: '고기', sub: '돈까스' });
    expect(classify('일식', '스시 오마카세')).toEqual({ menu: '밥', sub: '덮밥·초밥' });
    expect(classify('중식', '홍콩반점')).toEqual({ menu: '면', sub: '짬뽕·짜장' });
    expect(classify('양식', '파스타 공방')).toEqual({ menu: '면', sub: '파스타' });
    expect(classify('양식', '르 비스트로')).toEqual({ menu: '빵·양식', sub: null });
    expect(classify('빵·양식')).toEqual({ menu: '빵·양식', sub: null });
  });

  it('음식 칩(면·고기·분식)은 이름이 다른 메뉴 쪽이어도 그 메뉴 안에서만 고른다', () => {
    expect(classify('분식', '버거 분식')).toEqual({ menu: '분식', sub: '떡볶이·튀김' });
    expect(classify('고기', '냉면 고깃집').menu).toBe('고기');
  });

  it('모르는 값은 메뉴 없음', () => {
    expect(classify('카페')).toEqual({ menu: null, sub: null });
  });
});

describe('메뉴 표', () => {
  it('세부 이름은 메뉴끼리 겹치지 않고, 저장 한도(20자) 안이다', () => {
    const subs = MENUS.flatMap((m) => m.subs);
    expect(new Set(subs).size).toBe(subs.length);
    for (const s of [...subs, ...CATEGORIES]) expect(s.length).toBeLessThanOrEqual(20);
    for (const s of subs) expect(CATEGORIES).not.toContain(s);
  });

  it('그림·색은 세부와 메뉴 모두 정해져 있다', () => {
    for (const m of MENUS) {
      expect(categoryIcon(m.id)).not.toBe('🍴');
      for (const s of subsOf(m.id)) {
        expect(categoryIcon(s)).not.toBe('🍴');
        expect(categoryHue(s)).toBe(m.hue);
      }
    }
  });
});
