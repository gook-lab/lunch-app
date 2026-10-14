/**
 * 카테고리 고르기 — 메뉴를 먼저, 그다음 세부(고르지 않아도 된다).
 * 넣기·지도 고치기·목록 고치기가 같이 쓴다. 값은 저장할 문자열 하나(세부가 있으면 세부, 없으면 메뉴).
 */
import { CATEGORIES, classify, subsOf } from '../lib/category';
import { ChipPicker } from './ChipPicker';

export function CategoryPicker({ value, onPick }: { value: string | null; onPick: (next: string | null) => void }) {
  const { menu, sub } = value ? classify(value) : { menu: null, sub: null };
  return (
    <>
      <ChipPicker label="메뉴" options={CATEGORIES} value={menu} onPick={onPick} />
      {menu && (
        <ChipPicker
          label={`${menu} 세부`}
          options={subsOf(menu)}
          value={sub}
          onPick={(next) => onPick(next ?? menu)}
          allowNone
        />
      )}
    </>
  );
}
