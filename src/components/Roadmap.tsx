/**
 * 도보권 지도 — 결정 화면의 첫 화면 (시안 1a).
 *
 * 링을 누르면 도보 범위, 조각을 누르면 카테고리가 바뀐다. 필터 칩을 따로 두지
 * 않고 그림 자체가 컨트롤이다.
 *
 * 필터 로직은 여기 없다. selectCandidates 의 결과를 받아 그리기만 한다 —
 * 화면이 자기만의 필터를 들고 있으면 후보 수와 그림이 어긋난다.
 */
import { Tag } from '@gook-lab/ui';
import type { CandidateResult, Filters, Place } from '../lib/candidates';
import { VIEW, buildRoadmap } from '../lib/roadmap';

interface Props {
  places: Place[];
  filters: Filters;
  result: CandidateResult;
  onWalk: (walkMin: number) => void;
  onCategory: (category: string) => void;
  onExcludeRecent: () => void;
  /** 당첨된 가게. 그 점에 빛 고리를 씌운다. */
  winnerId: string | null;
}

/*
 * 범례는 이름이 붙는 세 처지만. "조건 밖"·"꺼짐" 은 흐린 작은 점이라 설명 없이도
 * 빠진 곳으로 읽히고, 다섯 줄 범례가 그림보다 먼저 읽혔다(10/9 처음 쓰는 사람 시점 리뷰).
 * "다시 넣음" 이 무슨 뜻인지는 아래 안내 문구가 숫자까지 넣어 풀어 준다.
 */
const LEGEND: { status: string; label: string }[] = [
  { status: 'candidate', label: '후보' },
  { status: 'released', label: '다시 넣음' },
  { status: 'recent', label: '최근 제외' },
];

export function Roadmap({
  places,
  filters,
  result,
  onWalk,
  onCategory,
  onExcludeRecent,
  winnerId,
}: Props) {
  const model = buildRoadmap(places, filters, result);
  // 후보 수가 먼저다. 조건은 그 뒤에 붙인다. "→" 는 상태 변화로 읽혀 뺐다.
  const summary =
    `후보 ${result.candidates.length}곳 · 도보 ${filters.maxWalkMin}분 · ` +
    `${filters.categories.length > 0 ? filters.categories.join('·') : '카테고리 전체'}`;

  return (
    <section className="rm">
      <div className="rm__stage">
        <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="rm__svg" aria-hidden="true">
          <circle cx={VIEW / 2} cy={VIEW / 2} r={model.discR} className="rm__disc" />

          {model.wedges.map((w) =>
            w.fillPath ? <path key={`f-${w.category}`} d={w.fillPath} className="rm__wedgeFill" /> : null,
          )}

          {model.spokes.map((s, i) => (
            <line key={i} x1={VIEW / 2} y1={VIEW / 2} x2={s.x} y2={s.y} className="rm__spoke" />
          ))}

          {model.rings.map((r) => (
            <circle
              key={r.walkMin}
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={r.r}
              className={r.on ? 'rm__ring rm__ring--on' : 'rm__ring'}
            />
          ))}

          {/* 누를 수 있는 조각. 투명하지만 조각 전체가 과녁이다. */}
          {model.wedges.map((w) => (
            <path
              key={w.category}
              d={w.path}
              className="rm__hit"
              onClick={() => onCategory(w.category)}
            />
          ))}

          {model.dots.map((d) => (
            <g key={d.place.id}>
              {winnerId === d.place.id && (
                <circle cx={d.x} cy={d.y} r={11} className="rm__halo" />
              )}
              <circle cx={d.x} cy={d.y} r={d.r} className={`rm__dot rm__dot--${d.status}`} />
            </g>
          ))}

          <rect x={VIEW / 2 - 7} y={VIEW / 2 - 7} width={14} height={14} rx={3} className="rm__office" />
        </svg>

        {model.wedges.map((w) => (
          <button
            key={w.category}
            type="button"
            aria-pressed={w.on}
            className={
              'rm__wedgeLabel' +
              (w.on ? ' rm__wedgeLabel--on' : '') +
              (w.dimmed ? ' rm__wedgeLabel--dim' : '')
            }
            style={{ left: w.left, top: w.top }}
            onClick={() => onCategory(w.category)}
          >
            {w.category}
          </button>
        ))}

        {model.dots
          .filter((d) => d.labelled)
          .map((d) => (
            <span
              key={d.place.id}
              className={`rm__dotLabel rm__dotLabel--${d.status} rm__dotLabel--${d.labelSide}`}
              style={{ left: d.left, top: d.top }}
            >
              {d.label}
            </span>
          ))}

        {model.rings.map((r) => (
          <button
            key={r.walkMin}
            type="button"
            aria-pressed={r.on}
            className={r.on ? 'rm__pill rm__pill--on' : 'rm__pill'}
            style={{ left: r.left, top: r.top }}
            onClick={() => onWalk(r.walkMin)}
          >
            {r.label}
          </button>
        ))}

        <span className="rm__here">사무실</span>
      </div>

      <div className="rm__summary">
        <span className="small">{summary}</span>
        <Tag
          as="button"
          variant={filters.excludeRecent ? 'accent' : 'outline'}
          aria-pressed={filters.excludeRecent}
          className={filters.excludeRecent ? 'chip chip--on' : 'chip'}
          onClick={onExcludeRecent}
        >
          {/* 켜짐을 색만으로 알리면 늘 켜져 있는 화면에선 상태로 안 읽혔다(10/9 3회차 리뷰). */}
          {filters.excludeRecent ? '✓ 최근 2주 제외' : '최근 2주 제외'}
        </Tag>
      </div>

      <div className="rm__legend">
        {LEGEND.map((l) => (
          <span key={l.status}>
            <i className={`rm__key rm__key--${l.status}`} />
            {l.label}
          </span>
        ))}
      </div>
    </section>
  );
}
