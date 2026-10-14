/**
 * 카테고리 — 메뉴(대분류) > 세부(중분류) 두 단계.
 *
 * 예전 칩 7종(한식·면·고기·분식·양식·중식·일식)은 나라와 음식 종류가 섞여 있어서
 * "돈까스 우동집" 이 일식인지 면인지, 냉면집이 한식인지 면인지 사람마다 달랐다(10/14 사용자).
 * 고르는 사람이 떠올리는 순서대로 "오늘은 면 → 라멘·우동" 으로 나눈다.
 *
 * 저장은 문자열 하나(category)다. 세부 이름은 메뉴끼리 겹치지 않게 지었으므로 세부만
 * 저장해도 메뉴가 나온다. 예전 값("한식", "일식" …)은 읽을 때 가게 이름을 보고 나눈다
 * (classify). Firestore 규칙(문자열 20자)과 기존 문서는 그대로 둔다.
 */

export const MENUS = [
  { id: '밥', icon: '🍚', hue: 25, subs: ['백반·한정식', '국밥·찌개', '덮밥·초밥', '카레·볶음밥'] },
  { id: '면', icon: '🍜', hue: 80, subs: ['국수·냉면', '라멘·우동', '짬뽕·짜장', '쌀국수', '파스타'] },
  { id: '고기', icon: '🥩', hue: 355, subs: ['고기구이', '돈까스', '닭요리', '족발·보쌈'] },
  { id: '분식', icon: '🍢', hue: 145, subs: ['떡볶이·튀김', '김밥', '라면·만두'] },
  { id: '빵·양식', icon: '🥪', hue: 250, subs: ['버거·샌드위치', '피자', '샐러드', '브런치·양식'] },
] as const;

/** 메뉴(대분류). 순서가 로드맵 조각 순서다. */
export const CATEGORIES = MENUS.map((m) => m.id) as readonly Category[];

export type Category = (typeof MENUS)[number]['id'];

const SUB_ICON: Record<string, string> = {
  '백반·한정식': '🍱',
  '국밥·찌개': '🍲',
  '덮밥·초밥': '🍣',
  '카레·볶음밥': '🍛',
  '국수·냉면': '🍜',
  '라멘·우동': '🍥',
  '짬뽕·짜장': '🥢',
  쌀국수: '🍜',
  파스타: '🍝',
  고기구이: '🥩',
  돈까스: '🍖',
  닭요리: '🍗',
  '족발·보쌈': '🐷',
  '떡볶이·튀김': '🌶️',
  김밥: '🍙',
  '라면·만두': '🥟',
  '버거·샌드위치': '🍔',
  피자: '🍕',
  샐러드: '🥗',
  '브런치·양식': '🍳',
};

const MENU_OF_SUB = new Map<string, Category>(MENUS.flatMap((m) => m.subs.map((s) => [s, m.id] as const)));

/** 메뉴의 세부 목록. */
export function subsOf(menu: string): readonly string[] {
  return MENUS.find((m) => m.id === menu)?.subs ?? [];
}

/** 이름·카카오 분류에서 세부를 고르는 규칙. 구체적인 것부터, 첫 일치가 이긴다. */
const SUB_RULES: { sub: string; tokens: string[] }[] = [
  // 카카오는 돈까스집을 "일식 > 돈까스,우동" 으로 준다. 우동보다 먼저 봐야 한다.
  { sub: '돈까스', tokens: ['돈까스', '돈카츠', '카츠', '돈가스'] },
  { sub: '덮밥·초밥', tokens: ['초밥', '스시', '덮밥', '규동', '사케동', '참치', '회덮밥'] },
  { sub: '라멘·우동', tokens: ['라멘', '일본식라면', '우동', '소바'] },
  { sub: '짬뽕·짜장', tokens: ['짬뽕', '짜장', '중식', '중국', '반점', '마라'] },
  { sub: '쌀국수', tokens: ['쌀국수', '베트남', '포 ', '분짜', '팟타이', '아시아'] },
  { sub: '파스타', tokens: ['파스타', '이탈리', '스파게티'] },
  { sub: '피자', tokens: ['피자'] },
  { sub: '버거·샌드위치', tokens: ['버거', '햄버거', '샌드위치', '서브웨이', '패스트푸드'] },
  { sub: '샐러드', tokens: ['샐러드', '포케'] },
  { sub: '브런치·양식', tokens: ['브런치', '스테이크', '양식', '레스토랑'] },
  { sub: '떡볶이·튀김', tokens: ['떡볶이', '튀김', '분식'] },
  { sub: '김밥', tokens: ['김밥'] },
  { sub: '라면·만두', tokens: ['만두', '라면'] },
  { sub: '국수·냉면', tokens: ['냉면', '국수', '칼국수', '막국수', '밀면', '면옥'] },
  { sub: '닭요리', tokens: ['치킨', '닭강정', '닭요리', '찜닭', '닭갈비', '닭한마리'] },
  { sub: '족발·보쌈', tokens: ['족발', '보쌈'] },
  { sub: '고기구이', tokens: ['육류', '고기', '갈비', '삼겹', '곱창', '구이', '정육'] },
  { sub: '국밥·찌개', tokens: ['국밥', '찌개', '해장', '순대', '곰탕', '설렁탕', '감자탕', '삼계탕', '탕'] },
  { sub: '카레·볶음밥', tokens: ['카레', '커리', '볶음밥'] },
  { sub: '백반·한정식', tokens: ['백반', '한정식', '정식', '밥상', '식당'] },
];

function subFromText(text: string, allowed?: ReadonlySet<string>): string | null {
  for (const rule of SUB_RULES) {
    if (allowed && !allowed.has(rule.sub)) continue;
    if (rule.tokens.some((t) => text.includes(t))) return rule.sub;
  }
  return null;
}

const subsIn = (...menus: Category[]) => menus.flatMap((m) => subsOf(m));

/**
 * 예전 칩 7종이 어느 메뉴였는지, 이름으로 고를 수 있는 세부는 어디까지인지.
 * 나라 칩(한식·일식·중식·양식)은 메뉴를 넘나든다 — 냉면집·고깃집이 "한식" 으로, 돈까스집이
 * "일식" 으로 들어가 있었다. 음식 칩(면·고기·분식)은 그 메뉴 안에서만 고른다.
 */
const LEGACY: Record<string, { menu: Category; sub: string | null; allowed: ReadonlySet<string> }> = {
  // 지금 메뉴 이름만 저장된 경우(세부를 안 고름)도 같은 표로 읽는다.
  밥: { menu: '밥', sub: null, allowed: new Set(subsIn('밥')) },
  '빵·양식': { menu: '빵·양식', sub: null, allowed: new Set(subsIn('빵·양식')) },
  한식: { menu: '밥', sub: null, allowed: new Set([...subsIn('밥', '고기', '분식'), '국수·냉면']) },
  면: { menu: '면', sub: null, allowed: new Set(subsIn('면')) },
  고기: { menu: '고기', sub: null, allowed: new Set(subsIn('고기')) },
  분식: { menu: '분식', sub: null, allowed: new Set(subsIn('분식')) },
  양식: { menu: '빵·양식', sub: null, allowed: new Set([...subsIn('빵·양식'), '파스타']) },
  중식: { menu: '면', sub: '짬뽕·짜장', allowed: new Set(['짬뽕·짜장', '카레·볶음밥', '라면·만두']) },
  // 이름으로 못 고르면 세부는 비운다. "일식" 만으로 덮밥·초밥이라 짐작하면 일식집이 초밥집이 됐다.
  일식: { menu: '밥', sub: null, allowed: new Set(['덮밥·초밥', '라멘·우동', '돈까스', '카레·볶음밥']) },
};

/**
 * 저장된 문자열(+가게 이름) → 메뉴와 세부.
 * 세부 이름이면 그대로, 예전 값이면 가게 이름으로 세부를 짐작한다(LEGACY 의 허용 범위 안에서만).
 */
export function classify(stored: string, name = ''): { menu: Category | null; sub: string | null } {
  const direct = MENU_OF_SUB.get(stored);
  if (direct) return { menu: direct, sub: stored };
  const legacy = LEGACY[stored];
  if (!legacy) return { menu: null, sub: null };
  const guess = subFromText(name, legacy.allowed);
  if (guess) return { menu: MENU_OF_SUB.get(guess)!, sub: guess };
  return { menu: legacy.menu, sub: legacy.sub };
}

/**
 * 카카오 분류 문자열("음식점 > 한식 > 국수") → 저장할 세부. 못 맞히면 null — 사람이 고른다.
 * 지어내서 넣으면 사람이 고치지 않고 그냥 두고, 그 칩이 조용히 거짓말을 한다.
 */
export function categoryFromKakao(categoryName: string): string | null {
  const text = categoryName ?? '';
  if (!text.includes('음식점')) return null;
  return subFromText(text);
}

/** 화면에 쓸 이름. 세부가 있으면 세부, 없으면 메뉴. */
export function categoryLabel(place: { category: string; sub?: string | null }): string {
  return place.sub ?? place.category;
}

/** 그림. 세부가 있으면 세부 그림, 메뉴면 메뉴 그림, 모르면 포크. */
export function categoryIcon(category: string): string {
  return SUB_ICON[category] ?? MENUS.find((m) => m.id === category)?.icon ?? '🍴';
}

/**
 * 카테고리 틴트용 색상각(oklch hue). 메뉴 단위로 준다.
 * MODUL 토큰에는 카테고리 팔레트가 없다. 도메인 어휘가 들어간 값은 코어에 넣지 않는 게 규칙이라
 * 여기 데이터로 둔다. 모르는 값은 중립 하늘색.
 */
export function categoryHue(category: string): number {
  const menu = MENU_OF_SUB.get(category) ?? category;
  return MENUS.find((m) => m.id === menu)?.hue ?? 200;
}

/** 조건 요약 한 마디. 세부를 골랐으면 세부, 아니면 메뉴, 둘 다 없으면 "카테고리 전체". */
export function categorySummary(filters: { categories: string[]; subs?: string[] }): string {
  if (filters.subs && filters.subs.length > 0) return filters.subs.join('·');
  return filters.categories.length > 0 ? filters.categories.join('·') : '카테고리 전체';
}
