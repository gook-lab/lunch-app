/**
 * 카카오 카테고리 → 우리 칩 6종.
 *
 * 카카오는 "음식점 > 한식 > 육류,고기" 처럼 계층 문자열을 준다. 칩은 6개뿐이라
 * 그대로 쓸 수 없고, 구체적인 쪽을 먼저 본다 — "한식 > 국수" 는 한식이 아니라
 * 면이다. 앞에서부터 순서대로 검사하는 이유가 그것이다.
 *
 * 애매한 것(일식·치킨·아시아음식·카페)은 null 을 준다. 지어내서 넣으면 사람이
 * 고치지 않고 그냥 두고, 그 카테고리 칩이 조용히 거짓말을 한다. 추가 화면이
 * 직접 고르게 하는 게 맞다.
 */

/** 필터 칩과 추가 화면이 공유하는 카테고리. 이 6개가 전부다. */
export const CATEGORIES = ['한식', '면', '고기', '분식', '양식', '중식'] as const;

export type Category = (typeof CATEGORIES)[number];

/** 구체적인 것부터. 첫 일치가 이긴다. */
const RULES: { category: Category; tokens: string[] }[] = [
  { category: '면', tokens: ['국수', '냉면', '칼국수', '라면', '우동', '소바', '막국수', '쌀국수'] },
  {
    category: '고기',
    tokens: ['육류', '고기', '갈비', '삼겹', '곱창', '족발', '보쌈', '구이', '삼계탕'],
  },
  { category: '분식', tokens: ['분식'] },
  { category: '중식', tokens: ['중식'] },
  {
    category: '양식',
    tokens: ['양식', '이탈리', '피자', '파스타', '스테이크', '햄버거', '패스트푸드'],
  },
  { category: '한식', tokens: ['한식'] },
];

/**
 * 못 맞히면 null. 호출하는 쪽이 사람에게 고르게 해야 한다.
 */
export function categoryFromKakao(categoryName: string): Category | null {
  const text = categoryName ?? '';
  for (const rule of RULES) {
    if (rule.tokens.some((token) => text.includes(token))) return rule.category;
  }
  return null;
}
