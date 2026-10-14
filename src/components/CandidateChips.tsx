/**
 * 지금 고를 가게들. 로드맵 점만으로는 어느 가게인지 이름이 안 읽혀서 위에 따로 적는다.
 * "다시 넣음"(최근에 갔지만 5곳을 채우려고 꺼낸 곳)은 점선으로 구분한다 — 로드맵과 같은 약속.
 *
 * 18곳쯤 되면 칩이 열 줄을 넘겨 로드맵이 화면 밖으로 밀렸다(10/14 사용자). 처음엔
 * 몇 곳만 보이고 "N곳 더 보기" 로 편다. 이름이 길면 말줄임. 뽑힌 곳은 접혀 있어도 보인다.
 */
import { useState } from 'react';
import { categoryIcon } from '../lib/category';
import type { CandidateResult } from '../lib/candidates';

export const CHIPS_FOLDED = 8;

export function CandidateChips({ result, winnerId }: { result: CandidateResult; winnerId?: string | null }) {
  const [open, setOpen] = useState(false);
  if (result.candidates.length === 0) return null;
  const released = new Set(result.released.map((p) => p.id));
  const all = result.candidates;
  const folded = !open && all.length > CHIPS_FOLDED;
  const shown = folded ? all.filter((p, i) => i < CHIPS_FOLDED || p.id === winnerId) : all;
  const hidden = all.length - shown.length;
  return (
    <ul className="cands" aria-label={`고를 가게 ${all.length}곳`}>
      {shown.map((p) => (
        <li
          key={p.id}
          title={p.name}
          className={['cands__item', released.has(p.id) ? 'cands__item--released' : '', p.id === winnerId ? 'cands__item--win' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <span aria-hidden="true">{categoryIcon(p.sub ?? p.category)}</span>
          <span className="cands__name">{p.name}</span>
          <span className="cands__walk">{p.walkMin}분</span>
          {released.has(p.id) && <span className="sr-only">, 최근에 갔지만 다시 넣음</span>}
        </li>
      ))}
      {(hidden > 0 || open) && all.length > CHIPS_FOLDED && (
        <li className="cands__more">
          <button type="button" className="linkish" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : `${hidden}곳 더 보기`}
          </button>
        </li>
      )}
    </ul>
  );
}
