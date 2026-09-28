/**
 * 결정 화면 — 링크를 열면 이게 첫 화면이다.
 *
 * 경쟁 상대는 메신저 스레드다. 스크롤 없이 돌리기까지 도달해야 하고,
 * 지도 SDK 는 여기서 한 바이트도 받지 않는다 (엔지니어링 리뷰 D7).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Tag, Sheet } from '@gook-lab/ui';
import { Wheel } from './components/games/Wheel';
import { Ladder } from './components/games/Ladder';
import { Slot } from './components/games/Slot';
import { Race } from './components/games/Race';
import { GAME_MODES, type GameMode } from './components/games/types';
import { PlaceList } from './components/PlaceList';
import { useTodayKST } from './hooks/useTodayKST';
import { useLunchData } from './hooks/useLunchData';
import { selectCandidates, WALK_STEPS, type Filters, type Place } from './lib/candidates';
import { emptyMessage, noticeMessage } from './lib/messages';
import { decideToday } from './services/lunch';
import './App.css';

const CATEGORIES = ['한식', '면', '고기', '분식', '양식', '중식'];

type Tab = 'decide' | 'list';

export default function App() {
  const today = useTodayKST();
  const { state, error, places, visits, today: decision, reload } = useLunchData(today);

  const [filters, setFilters] = useState<Filters>({
    maxWalkMin: 10,
    categories: [],
    excludeRecent: true,
  });
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Place | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);
  /**
   * 돌린 순간의 후보 목록. 게임 화면은 이걸 본다.
   *
   * 결정을 저장하면 onSnapshot 이 오늘 방문을 돌려주고 후보가 다시 계산된다.
   * 게임은 인덱스로 이름을 읽으므로, 얼려두지 않으면 바뀐 배열에 옛 인덱스를
   * 꽂아 엉뚱한 가게를 보여준다. 돌린 판은 그대로 두는 게 맞기도 하다.
   */
  const [board, setBoard] = useState<Place[] | null>(null);
  const [confirming, setConfirming] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('decide');
  // 마지막에 고른 게임 방식은 이 브라우저에만 남는다. 공유 상태가 아니다.
  const [mode, setMode] = useState<GameMode>(() => {
    try {
      const saved = localStorage.getItem('lunch-app:mode');
      return GAME_MODES.some((m) => m.id === saved) ? (saved as GameMode) : 'wheel';
    } catch {
      return 'wheel';
    }
  });

  const pickMode = useCallback((next: GameMode) => {
    setMode(next);
    try {
      localStorage.setItem('lunch-app:mode', next);
    } catch {
      // 시크릿 창에서는 저장이 막힌다. 동작에는 영향 없다.
    }
  }, []);

  const result = useMemo(
    () => selectCandidates(places, visits, filters, today),
    [places, visits, filters, today],
  );

  const decidedPlace = useMemo(
    () => (decision ? (places.find((p) => p.id === decision.placeId) ?? null) : null),
    [decision, places],
  );

  /**
   * 방금 돌린 결과가 오늘 결정으로 저장됐는가.
   * onSnapshot 이 돌려준 값과 비교하므로, true 면 쓰기가 실제로 서버에
   * 닿았다는 뜻이다. 버튼 스피너만으로는 저장 여부를 알 수 없다.
   */
  const confirmed = winner !== null && decision?.placeId === winner.id;

  const spin = useCallback(() => {
    if (result.candidates.length === 0 || spinning) return;
    const frozen = result.candidates;
    const index = Math.floor(Math.random() * frozen.length);
    setBoard(frozen);
    setWinnerIndex(index);
    setWinner(null);
    setSpinning(true);
  }, [result.candidates, spinning]);

  const onSpinEnd = useCallback(() => {
    setSpinning(false);
    setWinner((prev) => (winnerIndex === null ? prev : (board?.[winnerIndex] ?? prev)));
  }, [winnerIndex, board]);

  // 조건을 바꾸면 얼려둔 판을 버리고 현재 후보로 돌아간다.
  // 안 그러면 칩을 눌러도 지난 결과가 그대로 떠 있어 화면이 거짓말을 한다.
  useEffect(() => {
    setBoard(null);
    setWinner(null);
    setWinnerIndex(null);
  }, [filters]);

  const commit = useCallback(
    async (place: Place) => {
      setSaving(true);
      try {
        await decideToday(today, place.id);
        setConfirming(null);
      } finally {
        setSaving(false);
      }
    },
    [today],
  );

  const onDecide = useCallback(
    (place: Place) => {
      // 오늘 이미 다른 곳으로 정해져 있으면 덮어쓰기 전에 물어본다.
      if (decision && decision.placeId !== place.id) setConfirming(place);
      else void commit(place);
    },
    [decision, commit],
  );

  const toggleCategory = (c: string) =>
    setFilters((f) => ({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    }));

  if (state === 'loading') {
    return <main className="app app--center"><p className="muted">불러오는 중입니다</p></main>;
  }

  if (state === 'error') {
    return (
      <main className="app app--center">
        <p>목록을 불러오지 못했습니다.</p>
        <p className="muted small">{String((error as Error)?.message ?? error)}</p>
        <Button onClick={reload}>다시 시도</Button>
      </main>
    );
  }

  const empty = emptyMessage(result);
  const notice = noticeMessage(result);

  return (
    <main className="app">
      <header className="app__header">
        <h1>{tab === 'decide' ? '오늘 점심' : '우리 도보권'}</h1>
        <span className="muted small">{places.filter((p) => p.active).length}곳 등록됨</span>
      </header>

      <nav className="tabs">
        <button className={tab === 'decide' ? 'on' : ''} onClick={() => setTab('decide')}>
          돌림판
        </button>
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>
          목록
        </button>
      </nav>

      {tab === 'list' ? (
        <PlaceList places={places} visits={visits} today={today} onChanged={reload} />
      ) : (
      <>

      {decidedPlace && !winner && (
        <section className="card card--decided">
          <p className="muted small">오늘은 이미 정했습니다</p>
          <h2>{decidedPlace.name}</h2>
          <p className="muted small">
            {decidedPlace.category} · 도보 {decidedPlace.walkMin}분
          </p>
        </section>
      )}

      <section className="stage">
        <div className="stage__board">
          {(() => {
            const game = { candidates: board ?? result.candidates, winnerIndex, spinning, onSpinEnd };
            if (mode === 'ladder') return <Ladder {...game} />;
            if (mode === 'slot') return <Slot {...game} />;
            if (mode === 'race') return <Race {...game} />;
            return <Wheel {...game} />;
          })()}
        </div>

        {winner ? (
          <div className="card card--result">
            <h2>{winner.name}</h2>
            <p className="muted small">
              {winner.category} · 도보 {winner.walkMin}분
            </p>
            {confirmed ? (
              <>
                <p className="confirmed">오늘 점심으로 정했습니다</p>
                <Button block variant="secondary" onClick={spin}>
                  그래도 다시 돌리기
                </Button>
                <p className="muted small">다시 돌려 다른 곳을 정하면 오늘 기록을 덮어씁니다.</p>
              </>
            ) : (
              <>
                <div className="card__actions">
                  <Button block size="lg" onClick={() => onDecide(winner)} loading={saving}>
                    여기로 결정
                  </Button>
                  <Button block variant="secondary" onClick={spin}>
                    다시 돌리기
                  </Button>
                </div>
                <p className="muted small">
                  눌러야 방문 기록이 남고, 다음 2주 후보에서 빠집니다.
                </p>
              </>
            )}
          </div>
        ) : (
          <Button block size="lg" onClick={spin} disabled={result.candidates.length === 0 || spinning}>
            {spinning ? '돌리는 중' : `돌리기 (후보 ${result.candidates.length}곳)`}
          </Button>
        )}

        {empty && <p className="notice notice--empty">{empty}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section className="filters">
        <div className="filters__row">
          <span className="filters__label">도보</span>
          <div className="segmented" role="group" aria-label="도보 시간 상한">
            {WALK_STEPS.map((step) => (
              <button
                key={step}
                type="button"
                aria-pressed={filters.maxWalkMin === step}
                className={filters.maxWalkMin === step ? 'on' : ''}
                onClick={() => setFilters((f) => ({ ...f, maxWalkMin: step }))}
              >
                {step}분
              </button>
            ))}
          </div>
          <Tag
            as="button"
            variant={filters.excludeRecent ? 'accent' : 'outline'}
            aria-pressed={filters.excludeRecent}
            className={filters.excludeRecent ? 'chip chip--on' : 'chip'}
            onClick={() => setFilters((f) => ({ ...f, excludeRecent: !f.excludeRecent }))}
          >
            최근 2주 제외
          </Tag>
        </div>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <Tag
              key={c}
              as="button"
              variant={filters.categories.includes(c) ? 'accent' : 'outline'}
              aria-pressed={filters.categories.includes(c)}
              className={filters.categories.includes(c) ? 'chip chip--on' : 'chip'}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </Tag>
          ))}
        </div>
        <p className="muted small">조건을 바꾸면 후보가 바로 바뀝니다</p>
      </section>

      <section className="modes">
        <div className="filters__row">
          <span className="filters__label">방식</span>
          {GAME_MODES.map((m) => (
            <Tag
              key={m.id}
              as="button"
              variant={mode === m.id ? 'accent' : 'outline'}
              aria-pressed={mode === m.id}
              className={mode === m.id ? 'chip chip--on' : 'chip'}
              onClick={() => pickMode(m.id)}
              disabled={spinning}
            >
              {m.label}
            </Tag>
          ))}
        </div>
        <p className="muted small">
          방식은 보여주는 것만 다릅니다 — 어느 쪽으로 돌려도 후보와 확률은 같습니다.
        </p>
      </section>

      </>
      )}

      <footer className="muted small">로그인 없음 · 링크만 있으면 누구나</footer>

      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="오늘은 이미 정했습니다"
        description={
          decidedPlace && confirming
            ? `${decidedPlace.name} 에서 ${confirming.name} 으로 바꿀까요?`
            : undefined
        }
      >
        <div className="row">
          <Button block onClick={() => confirming && void commit(confirming)} loading={saving}>
            바꾸기
          </Button>
          <Button block variant="ghost" onClick={() => setConfirming(null)}>
            그대로 두기
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
