/**
 * 이번 달 점심 통계와 뱃지 — 목록 탭 좌측 패널 (공정성 무관).
 */
import { calculateStats } from '../lib/stats';
import { GAME_MODES, MODE_ICON, type GameMode } from './games/types';
import type { Place, Visit } from '../lib/candidates';
import type { DayId } from '../lib/date';

interface Props {
  places: Place[];
  visits: Visit[];
  today: DayId;
}

/**
 * NumberRoller: @gook-lab/motion 에서 제공.
 * 숫자가 부드럽게 올라간다.
 */
function NumberRoller({ value }: { value: number }) {
  return (
    <span
      className="stats__roller"
      style={{ '--stat-value': value } as React.CSSProperties & Record<string, any>}
    >
      {value}
    </span>
  );
}

export function LunchStats({ places, visits, today }: Props) {
  const stats = calculateStats(visits, places, today);

  // 기록이 없으면 안내 문구
  if (stats.totalCount === 0) {
    return (
      <section className="stats" aria-labelledby="stats-title">
        <h2 id="stats-title" className="list__heading">이번 달 점심</h2>
        <p className="muted small">이번 달 기록이 아직 없어요. 오늘 정하면 여기에 쌓여요.</p>
      </section>
    );
  }

  const maxCount = stats.topPlaces.length > 0 ? stats.topPlaces[0].count : 1;

  return (
    <section className="stats" aria-labelledby="stats-title">
      <h2 id="stats-title" className="list__heading">이번 달 점심</h2>

      {/* 총 횟수 */}
      <div className="stats__total">
        <div className="stats__totalNumber">
          <NumberRoller value={stats.totalCount} />
        </div>
        <p className="stats__totalLabel">번</p>
      </div>

      {/* 상위 3곳 (있으면) */}
      {stats.topPlaces.length > 0 && (
        <div className="stats__topPlaces">
          <h3 className="stats__subheading">자주 간 곳</h3>
          <ul className="stats__topList">
            {stats.topPlaces.map(({ place, count }) => (
              <li key={place.id} className="stats__topItem">
                <span className="stats__topName">{place.name}</span>
                <span className="stats__topCount">{count}번</span>
                <span className="stats__topBar" aria-hidden="true">
                  <span className="stats__topFill" style={{ width: `${(count / maxCount) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 자주 쓴 게임 — 게임을 남기기 시작한 10/14 이후 기록만 있다. 없으면 줄을 안 그린다. */}
      {stats.topGames.length > 0 && (
        <div className="stats__games">
          <h3 className="stats__subheading">자주 쓴 게임</h3>
          <ul className="stats__gameList">
            {stats.topGames.map(({ mode, count }) => (
              <li key={mode} className="stats__game">
                <span aria-hidden="true">{MODE_ICON[mode as GameMode] ?? '🎮'} </span>
                {GAME_MODES.find((m) => m.id === mode)?.label ?? mode}
                <span className="stats__gameCount">{count}번</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 뱃지 */}
      <div className="stats__badges">
        <h3 className="stats__subheading">뱃지</h3>
        <div className="stats__badgeList">
          {stats.badges.map((badge) => (
            <div
              key={badge.id}
              className={badge.earned ? 'stats__badge stats__badge--earned' : 'stats__badge'}
              title={`${badge.label} 뱃지, ${badge.current}/${badge.target}`}
            >
              <span className="stats__badgeIcon" aria-hidden="true">{badge.icon}</span>
              <span className="stats__badgeLabel">{badge.label}</span>
              {badge.earned ? (
                <span className="sr-only"> 뱃지, 받았어요</span>
              ) : (
                <span className="stats__badgeProgress">
                  <span className="sr-only"> 뱃지, 달성도 </span>
                  {badge.current}/{badge.target}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
