/**
 * 이번 주 점심 리포트 — 가게 목록 탭의 좌측 패널 (공정성 무관).
 */
import { predictionKings, weeklyReport } from '../lib/report';
import type { VotesByDay } from '../hooks/useMonthVotes';
import { GAME_MODES, MODE_ICON, type GameMode } from './games/types';
import type { Place, Visit } from '../lib/candidates';
import type { DayId } from '../lib/date';

interface Props {
  places: Place[];
  visits: Visit[];
  today: DayId;
  votesByDay: VotesByDay;
}

export function WeeklyReport({ places, visits, today, votesByDay }: Props) {
  const report = weeklyReport(visits, places, today);
  const kings = predictionKings(votesByDay, visits, today);

  // 기록이 없으면 안내 문구
  if (report.decisionCount === 0) {
    return (
      <section className="weekly-report" aria-labelledby="weekly-title">
        <h2 id="weekly-title" className="list__heading">이번 주 점심</h2>
        <p className="muted small">이번 주는 아직 정한 곳이 없어요. 오늘 정하면 여기에 쌓여요.</p>
      </section>
    );
  }

  return (
    <section className="weekly-report" aria-labelledby="weekly-title">
      <h2 id="weekly-title" className="list__heading">이번 주 점심</h2>

      {/* 총 횟수 */}
      <div className="weekly-report__count">
        <p className="weekly-report__label">
          이번 주 <strong>{report.decisionCount}</strong>번 정했어요
        </p>
      </div>

      {/* 가장 자주 고른 카테고리 */}
      {report.topCategory && (
        <div className="weekly-report__top">
          <p className="weekly-report__label">자주 고른 메뉴: <strong>{report.topCategory}</strong></p>
        </div>
      )}

      {/* 가장 자주 쓴 게임 모드 */}
      {report.topMode && (
        <div className="weekly-report__top">
          <p className="weekly-report__label">
            <span aria-hidden="true">{MODE_ICON[report.topMode as GameMode] ?? '🎮'} </span>
            자주 쓴 게임: <strong>{GAME_MODES.find((m) => m.id === report.topMode)?.label ?? report.topMode}</strong>
          </p>
        </div>
      )}

      {/* 예측왕 — 이번 주 당첨을 가장 많이 맞힌 사람 */}
      {kings.length > 0 && (
        <div className="weekly-report__top">
          <p className="weekly-report__label">
            <span aria-hidden="true">🔮 </span>
            예측왕: <strong>{kings[0].name}</strong> · {kings[0].hits}번 맞혔어요
          </p>
          {kings.length > 1 && (
            <p className="muted small">
              {kings
                .slice(1, 4)
                .map((k) => `${k.name} ${k.hits}번`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}

      {/* 방문한 가게 목록 */}
      {report.places.length > 0 && (
        <div className="weekly-report__places">
          <h3 className="weekly-report__subheading">다녀온 곳</h3>
          <ul className="weekly-report__list">
            {report.places.map((item, idx) => (
              <li key={`${item.place.id}-${idx}`} className="weekly-report__item">
                <span className="weekly-report__day">{item.dayLabel}</span>
                <span className="weekly-report__name">{item.place.name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
