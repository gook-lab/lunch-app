import { Tag } from '@gook-lab/ui';

/**
 * 칩 하나를 고르는 묶음 — 카테고리·가격대. 넣기·지도 고치기·목록 고치기가 같은
 * 칩을 따로 그리다 어긋났다(group 이름이 있는 곳과 없는 곳, 22회차). 한 곳에 둔다.
 * allowNone 이면 켜진 칩을 다시 눌러 끈다(가격대처럼 고르지 않아도 되는 값).
 */
export function ChipPicker<T extends string>({
  label,
  options,
  value,
  onPick,
  allowNone = false,
}: {
  label: string;
  options: readonly T[];
  value: T | null;
  onPick: (next: T | null) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => {
        const on = value === option;
        return (
          <Tag
            key={option}
            as="button"
            type="button"
            variant={on ? 'accent' : 'outline'}
            aria-pressed={on}
            className={on ? 'chip chip--on' : 'chip'}
            onClick={() => onPick(on && allowNone ? null : option)}
          >
            {option}
          </Tag>
        );
      })}
    </div>
  );
}
