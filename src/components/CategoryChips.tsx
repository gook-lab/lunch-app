/**
 * 게임판 위 카테고리 칩 — "오늘은 한식만" 을 바로 고른다.
 *
 * 로드맵 조각과 같은 조건(filters.categories)을 바꾼다. 어느 쪽에서 바꿔도 서로 맞는다.
 * 예전엔 로드맵 안·휴대폰 "바꾸기" 시트 안에만 있어서 있는지 모르고 지나쳤다(10/13 사용자).
 * 켜진 가게가 하나도 없는 카테고리 칩은 만들지 않는다. 눌러 봐야 후보가 0곳이다.
 */
import { CATEGORIES, categoryIcon } from '../lib/category';
import type { Place } from '../lib/candidates';

interface Props {
  places: Place[];
  selected: string[];
  onToggle: (category: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function CategoryChips({ places, selected, onToggle, onClear, disabled }: Props) {
  const counts = new Map<string, number>();
  for (const p of places) if (p.active) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  const shown = (CATEGORIES as readonly string[]).filter((c) => counts.has(c) || selected.includes(c));
  if (shown.length < 2) return null;
  return (
    <div className="catbar" role="group" aria-label="카테고리 고르기">
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
  );
}
