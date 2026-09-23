/**
 * 결정 화면 — 링크를 열면 이게 첫 화면이다.
 *
 * 경쟁 상대는 메신저 스레드다. 스크롤 없이 돌리기까지 도달해야 하고,
 * 지도 SDK 는 여기서 한 바이트도 받지 않는다 (엔지니어링 리뷰 D7).
 */
import { useCallback, useMemo, useState } from 'react';
import { Button, Tag, Sheet } from '@gook-lab/ui';
import { Wheel } from './components/Wheel';
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
  const [confirming, setConfirming] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('decide');

  const result = useMemo(
    () => selectCandidates(places, visits, filters, today),
    [places, visits, filters, today],
  );

  const decidedPlace = useMemo(
    () => (decision ? (places.find((p) => p.id === decision.placeId) ?? null) : null),
    [decision, places],
  );

  const spin = useCallback(() => {
    if (result.candidates.length === 0 || spinning) return;
    const index = Math.floor(Math.random() * result.candidates.length);
    setWinnerIndex(index);
    setWinner(null);
    setSpinning(true);
  }, [result.candidates, spinning]);

  const onSpinEnd = useCallback(() => {
    setSpinning(false);
    if (winnerIndex !== null) setWinner(result.candidates[winnerIndex] ?? null);
  }, [winnerIndex, result.candidates]);

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
        <Wheel
          candidates={result.candidates}
          winnerIndex={winnerIndex}
          spinning={spinning}
          onSpinEnd={onSpinEnd}
        />

        {winner ? (
          <div className="card">
            <h2>{winner.name}</h2>
            <p className="muted small">
              {winner.category} · 도보 {winner.walkMin}분
            </p>
            <div className="row">
              <Button block onClick={() => onDecide(winner)} loading={saving}>
                여기로 결정
              </Button>
              <Button block variant="ghost" onClick={spin}>
                다시 돌리기
              </Button>
            </div>
            <p className="muted small">
              "여기로 결정"을 눌러야 방문 기록이 남고, 다음 2주 후보에서 빠집니다.
            </p>
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
        <div className="chips">
          <Tag
            as="button"
            variant={filters.excludeRecent ? 'accent' : 'outline'}
            onClick={() => setFilters((f) => ({ ...f, excludeRecent: !f.excludeRecent }))}
          >
            최근 2주 제외
          </Tag>
          {WALK_STEPS.map((step) => (
            <Tag
              key={step}
              as="button"
              variant={filters.maxWalkMin === step ? 'accent' : 'outline'}
              onClick={() => setFilters((f) => ({ ...f, maxWalkMin: step }))}
            >
              도보 {step}분
            </Tag>
          ))}
        </div>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <Tag
              key={c}
              as="button"
              variant={filters.categories.includes(c) ? 'accent' : 'outline'}
              onClick={() => toggleCategory(c)}
            >
              {c}
            </Tag>
          ))}
        </div>
        <p className="muted small">조건을 바꾸면 돌림판 후보가 바로 바뀝니다</p>
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
