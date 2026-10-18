import type { Filters } from './candidates';

/**
 * 고른 메뉴 한마디 — 조건 요약 줄 맨 앞. 휴대폰은 메뉴 칩이 바꾸기 시트 안에 있어(10/18)
 * 지금 무엇으로 거르는지가 이 말로만 보인다. 나라 → 세부 → 메뉴 순으로 실제 거르는 쪽을 쓴다.
 */
export function menuSummary(filters: Pick<Filters, 'categories' | 'subs' | 'cuisines'>): string {
  const picked =
    filters.cuisines && filters.cuisines.length > 0
      ? filters.cuisines
      : filters.subs && filters.subs.length > 0
        ? filters.subs
        : filters.categories;
  if (picked.length === 0) return '전체 메뉴';
  if (picked.length <= 2) return picked.join('·');
  return `${picked.slice(0, 2).join('·')} 외 ${picked.length - 2}`;
}
