/**
 * 지금 후보 가게들. 로드맵 점만으로는 누가 후보인지 이름이 안 읽혀서 위에 따로 적는다.
 * "다시 넣음"(최근에 갔지만 5곳을 채우려고 꺼낸 곳)은 점선으로 구분한다 — 로드맵과 같은 약속.
 */
import { categoryIcon } from '../lib/category';
import type { CandidateResult } from '../lib/candidates';

export function CandidateChips({ result, winnerId }: { result: CandidateResult; winnerId?: string | null }) {
  if (result.candidates.length === 0) return null;
  const released = new Set(result.released.map((p) => p.id));
  return (
    <ul className="cands" aria-label={`후보 ${result.candidates.length}곳`}>
      {result.candidates.map((p) => (
        <li
          key={p.id}
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
    </ul>
  );
}
