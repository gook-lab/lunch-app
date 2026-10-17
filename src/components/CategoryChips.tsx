/**
 * 게임판 위 카테고리 칩 — "오늘은 면만", 더 좁히면 "라멘·우동만".
 *
 * 첫 줄은 메뉴(대분류), 메뉴를 하나만 골랐을 때 둘째 줄에 그 메뉴의 세부가 열린다.
 * 로드맵 조각과 같은 조건(filters.categories)을 바꾼다. 어느 쪽에서 바꿔도 서로 맞는다.
 * 켜진 가게가 하나도 없는 칩은 만들지 않는다. 눌러 봐야 후보가 0곳이다.
 *
 * onView 를 주면 맨 앞에 "메뉴 | 나라" 전환이 생긴다. 나라로 보면 첫 줄이 한식·중식·일식·양식·아시안이 되고
 * 세부 줄은 없다(10/17 사용자). 지도 탭처럼 onView 가 없으면 예전처럼 메뉴만.
 */
import { CATEGORIES, CUISINES, categoryIcon, cuisineIcon, cuisineOf, subsOf } from '../lib/category';
import './CategoryChips.css';

export type CategoryView = 'menu' | 'cuisine';
import type { Place } from '../lib/candidates';

interface Props {
  places: Place[];
  selected: string[];
  subs: string[];
  onToggle: (category: string) => void;
  onToggleSub: (sub: string) => void;
  onClear: () => void;
  onClearSubs: () => void;
  disabled?: boolean;
  view?: CategoryView;
  onView?: (view: CategoryView) => void;
  cuisines?: string[];
  onToggleCuisine?: (cuisine: string) => void;
}

export function CategoryChips({
  places,
  selected,
  subs,
  onToggle,
  onToggleSub,
  onClear,
  onClearSubs,
  disabled,
  view = 'menu',
  onView,
  cuisines = [],
  onToggleCuisine,
}: Props) {
  const active = places.filter((p) => p.active);
  const menus = new Set(active.map((p) => p.category));
  const shown = (CATEGORIES as readonly string[]).filter((c) => menus.has(c) || selected.includes(c));
  const open = selected.length === 1 ? selected[0] : null;
  const subsHere = new Set(active.filter((p) => p.category === open).map((p) => p.sub ?? ''));
  const subShown = open ? subsOf(open).filter((s) => subsHere.has(s) || subs.includes(s)) : [];
  const byCuisine = view === 'cuisine' && !!onToggleCuisine;
  const cuisinesHere = new Set<string>(active.map((p) => cuisineOf(p)));
  const cuisineShown = CUISINES.map((c) => c.id as string).filter((c) => cuisinesHere.has(c) || cuisines.includes(c));
  if (shown.length < 2 && subShown.length < 2 && cuisineShown.length < 2) return null;
  const switcher = onView && (
    <span className="catbar__view" role="group" aria-label="나눠 보기">
      {(['menu', 'cuisine'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onView(v)} disabled={disabled}>
          {v === 'menu' ? '메뉴' : '나라'}
        </button>
      ))}
    </span>
  );
  if (byCuisine)
    return (
      <div className="catbar-wrap">
        <div className="catbar" role="group" aria-label="나라 고르기">
          {switcher}
          <button
            type="button"
            className="catbar__chip"
            aria-pressed={cuisines.length === 0}
            onClick={onClear}
            disabled={disabled}
          >
            전체
          </button>
          {cuisineShown.map((c) => (
            <button
              key={c}
              type="button"
              className="catbar__chip"
              aria-pressed={cuisines.includes(c)}
              onClick={() => onToggleCuisine(c)}
              disabled={disabled}
            >
              <span aria-hidden="true">{cuisineIcon(c)} </span>
              {c}
            </button>
          ))}
        </div>
      </div>
    );
  return (
    <div className="catbar-wrap">
      <div className="catbar" role="group" aria-label="메뉴 고르기">
        {switcher}
        <button
          type="button"
          className="catbar__chip"
          aria-pressed={selected.length === 0}
          onClick={onClear}
          disabled={disabled}
        >
          전체
        </button>
        {shown.map((c) => (
          <button
            key={c}
            type="button"
            className="catbar__chip"
            aria-pressed={selected.includes(c)}
            onClick={() => onToggle(c)}
            disabled={disabled}
          >
            <span aria-hidden="true">{categoryIcon(c)} </span>
            {c}
          </button>
        ))}
      </div>
      {/* 세부가 하나뿐이면 메뉴를 고른 것과 같아서 줄을 열지 않는다. */}
      {subShown.length >= 2 && (
        <div className="catbar catbar--sub" role="group" aria-label={`${open} 세부 고르기`}>
          <button
            type="button"
            className="catbar__chip"
            aria-pressed={subs.length === 0}
            onClick={onClearSubs}
            disabled={disabled}
          >
            {open} 전체
          </button>
          {subShown.map((s) => (
            <button
              key={s}
              type="button"
              className="catbar__chip"
              aria-pressed={subs.includes(s)}
              onClick={() => onToggleSub(s)}
              disabled={disabled}
            >
              <span aria-hidden="true">{categoryIcon(s)} </span>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
