/**
 * 결정 화면 — 링크를 열면 이게 첫 화면이다.
 *
 * 경쟁 상대는 메신저 스레드다. 스크롤 없이 돌리기까지 도달해야 하고,
 * 지도 SDK 는 여기서 한 바이트도 받지 않는다 (엔지니어링 리뷰 D7).
 *
 * 지도·추가 화면은 lazy 로 갈라 둔다. 주석으로 "받지 않는다" 고 적어 두면
 * 누군가 import 한 줄을 늘리는 순간 조용히 깨진다. 청크를 갈라 두면 깨지지 않는다.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag, Sheet } from '@gook-lab/ui';
import { Wheel } from './components/games/Wheel';
import { Ladder } from './components/games/Ladder';
import { Slot } from './components/games/Slot';
import { Pinball } from './components/games/Pinball';
import {
  actionLabel,
  GAME_MODES,
  prefersReducedMotion,
  type GameMode,
} from './components/games/types';
import { PlaceList } from './components/PlaceList';
import { Roadmap } from './components/Roadmap';
import { useTodayKST } from './hooks/useTodayKST';
import { useLunchData } from './hooks/useLunchData';
import { selectCandidates, type Filters, type Place } from './lib/candidates';
import { categoryHue } from './lib/category';
import { withJosa } from './lib/josa';
import { emptyMessage, noticeMessage } from './lib/messages';
import { decideToday } from './services/lunch';
import './App.css';

// 지도와 추가는 결정 화면 첫 페인트에 섞이지 않는다 (D7).
const MapTab = lazy(() => import('./components/MapTab'));

type Tab = 'roadmap' | 'list' | 'map';

/** 연출 잠금 해제 상한. 가장 긴 연출(핀볼 최대 5.8초)의 두 배 남짓. */
const SPIN_TIMEOUT_MS = 12_000;

const TAB_TITLE: Record<Tab, string> = {
  roadmap: '오늘 점심',
  list: '가게 목록',
  map: '우리 도보권',
};

export default function App() {
  const today = useTodayKST();
  const { state, error, places, visits, today: decision, refreshing, reload } = useLunchData(today);

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
  // 판 번호. 돌릴 때마다 증가 + 난수. 게임이 새 판을 만드는 키이자 핀볼 시드 시작점.
  const [run, setRun] = useState(0);
  const [confirming, setConfirming] = useState<Place | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('roadmap');
  const boardRef = useRef<HTMLDivElement>(null);
  // 마지막에 고른 게임 방식은 이 브라우저에만 남는다. 공유 상태가 아니다.
  const [mode, setMode] = useState<GameMode>(() => {
    try {
      const saved = localStorage.getItem('lunch-app:mode');
      return GAME_MODES.some((m) => m.id === saved) ? (saved as GameMode) : 'wheel';
    } catch {
      return 'wheel';
    }
  });

  // 방식을 바꾸면 지난 판을 지운다. 돌림판 결과 카드를 띄운 채 사다리로
  // 넘어가면 사다리는 이미 당첨이 정해진 그림으로 나와 "안 돌렸는데 결과가
  // 있다" 로 읽힌다. 모드 칩은 연출 중에 잠겨 있으니 여기서 연출을 끊을
  // 일은 없다.
  const pickMode = useCallback((next: GameMode) => {
    setBoard(null);
    setWinner(null);
    setWinnerIndex(null);
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
    setRun((r) => r + 1 + Math.floor(Math.random() * 1_000_000));
    setSpinning(true);

    // 게임 영역은 실행 전까지 없다. 나타난 다음 프레임에 화면 안으로 끌어온다 —
    // 안 하면 눌렀는데 아무 일도 안 일어난 것처럼 보인다.
    requestAnimationFrame(() => {
      boardRef.current?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
    });
  }, [result.candidates, spinning]);

  const onSpinEnd = useCallback(() => {
    setSpinning(false);
    setWinner((prev) => (winnerIndex === null ? prev : (board?.[winnerIndex] ?? prev)));
  }, [winnerIndex, board]);

  // 탭을 옮기면 연출을 끊는다. 게임판은 로드맵 탭에만 렌더되므로
  // (tab === 'roadmap' && ...) 옮기는 순간 언마운트되고, effect cleanup 이
  // 타이머를 지워 onSpinEnd 가 영영 안 불린다. 돌아오면 "진행 중" 에
  // 갇혀 있다. 어차피 딴 탭에서는 연출이 안 보이니 끊는 게 맞다.
  // 탭 이동은 전부 이 함수를 거친다 — setTab 을 직접 부르면 이 방어가 빠진다.
  const goTab = useCallback((next: Tab) => {
    setSpinning(false);
    setTab(next);
  }, []);

  /**
   * 연출 잠금의 마지막 방어선.
   *
   * onSpinEnd 가 안 불리면 spinning 이 true 로 박혀 모드 칩과 실행 버튼이
   * 전부 잠긴다. 새로고침 말고는 복구가 없다. 실제로 두 경로에서 그랬다 —
   * 연출 중 필터 변경, 연출 중 탭 전환. 둘 다 막았지만 게임 컴포넌트가
   * 하나라도 onSpinEnd 를 놓치면 같은 일이 또 난다.
   *
   * 가장 긴 연출이 핀볼 최대 5.8초다. 그 두 배를 넘기면 뭔가 잘못된 것이니
   * 결과를 만들지 말고 잠금만 푼다 — 안 본 경기를 당첨으로 기록할 수는 없다.
   */
  useEffect(() => {
    if (!spinning) return;
    const t = window.setTimeout(() => setSpinning(false), SPIN_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [spinning]);

  // 조건을 바꾸면 얼려둔 판을 버리고 현재 후보로 돌아간다.
  // 안 그러면 칩을 눌러도 지난 결과가 그대로 떠 있어 화면이 거짓말을 한다.
  //
  // 연출 중이었으면 여기서 끊어야 한다. winnerIndex 를 null 로 만들면 게임
  // 컴포넌트의 effect 가 타이머를 정리하고 early-return 해서 onSpinEnd 를
  // 영영 안 부른다. spinning 이 true 로 박히고 모드 칩 4개와 실행 버튼이
  // 잠긴 채 새로고침 말고는 복구가 없다. 필터 칩은 연출 중에도 눌리므로
  // (모드 칩과 달리 disabled 가 없다) 실제로 도달한다.
  // 필터를 바꾸는 손잡이는 전부 이 함수를 같이 부른다(아래 updateFilters).
  const updateFilters = useCallback((patch: (f: Filters) => Filters) => {
    setBoard(null);
    setWinner(null);
    setWinnerIndex(null);
    setSpinning(false);
    setFilters(patch);
  }, []);

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
    updateFilters((f) => ({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    }));

  if (state === 'loading') {
    return <main className="app app--center"><p className="muted">불러오는 중이에요</p></main>;
  }

  if (state === 'error') {
    return (
      <main className="app app--center">
        <p>목록을 불러오지 못했어요.</p>
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
        <h1>{TAB_TITLE[tab]}</h1>
        <span className="muted small">
          {refreshing ? '새로고침 중' : `${places.filter((p) => p.active).length}곳 등록됨`}
        </span>
      </header>

      <nav className="tabs" role="tablist" aria-label="화면">
        <button role="tab" aria-selected={tab === 'roadmap'} className={tab === 'roadmap' ? 'on' : ''} onClick={() => goTab('roadmap')}>
          로드맵
        </button>
        <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'on' : ''} onClick={() => goTab('list')}>
          목록
        </button>
        <button role="tab" aria-selected={tab === 'map'} className={tab === 'map' ? 'on' : ''} onClick={() => goTab('map')}>
          지도
        </button>
      </nav>

      {tab === 'list' && (
        <>
          {/*
            * 추가 경로는 지도 하나뿐이다. 여기에도 폼을 두면 가격대·별점이
            * 한쪽에만 있는 채로 갈라진다. 버튼은 지도로 보내기만 한다.
            */}
          <div className="row row--end">
            <Button size="sm" onClick={() => goTab('map')}>
              지도에서 가게 추가
            </Button>
          </div>
          <PlaceList
            places={places}
            visits={visits}
            today={today}
            onChanged={reload}
            excludeRecent={filters.excludeRecent}
          />
        </>
      )}

      {tab === 'map' && (
        <Suspense fallback={<p className="muted small">지도를 준비하고 있어요</p>}>
          <MapTab places={places} onChanged={reload} />
        </Suspense>
      )}

      {tab === 'roadmap' && (
      <>

      {decidedPlace && !winner && (
        <section className="card card--decided">
          <p className="muted small">오늘은 이미 정했어요</p>
          <h2>{decidedPlace.name}</h2>
          <p className="muted small">
            {decidedPlace.category} · 도보 {decidedPlace.walkMin}분
          </p>
        </section>
      )}

      <Roadmap
        places={places}
        filters={filters}
        result={result}
        winnerId={winner?.id ?? null}
        onWalk={(walkMin) => updateFilters((f) => ({ ...f, maxWalkMin: walkMin }))}
        onCategory={toggleCategory}
        onExcludeRecent={() => updateFilters((f) => ({ ...f, excludeRecent: !f.excludeRecent }))}
      />

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
        <p className="muted small">방식은 보여주는 것만 달라요 · 확률은 같아요</p>

        {/*
          * 게임판은 쉴 때도 그린다.
          *
          * 한동안 실행 전에는 감춰 뒀다. 로드맵(356px)과 게임(300px)을 같이
          * 쌓으면 390x844 에서 실행 버튼이 1097px 로 밀려나기 때문이었다.
          * 그런데 그러면 모드 칩 5개가 죽은 것처럼 보인다 — 눌러도 화면이
          * 그대로라 "배선이 안 된 것 같다" 는 말을 들었다. 실제로 그렇게 읽힌다.
          *
          * 스크롤 한 번보다 그게 더 나쁘다. 칩을 누르면 판이 바로 바뀐다.
          */}
        <div ref={boardRef} className="stage__board">
          {(() => {
            const game = {
              candidates: board ?? result.candidates,
              winnerIndex,
              spinning,
              run,
              onSpinEnd,
            };
            // 사다리는 사용자가 판을 고친다. 후보 구성이 바뀌면 새 판이어야 하므로
            // 후보 id 를 key 로 준다. 돌린 순간 얼리는 board 는 같은 id 라 판이 유지된다.
            if (mode === 'ladder') {
              const key = game.candidates.map((p) => p.id).join(',');
              return <Ladder key={key} {...game} onRequestSpin={spin} />;
            }
            if (mode === 'slot') return <Slot {...game} />;
            if (mode === 'pinball') return <Pinball {...game} />;
            return <Wheel {...game} />;
          })()}
        </div>

        {/*
          * 결과 알림. 결과 카드는 연출이 끝난 뒤 새로 생기는 요소라 화면낭독기가
          * 알아채지 못한다. 늘 있는 빈 영역에 글을 채워야 읽힌다.
          */}
        <p className="sr-only" aria-live="polite">
          {winner && !spinning ? `${winner.name}, 도보 ${winner.walkMin}분이 뽑혔어요` : ''}
        </p>

        {winner ? (
          <div className="card card--result">
            <span
              className="card__cat"
              style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}
            >
              {winner.category}
            </span>
            <h2>{winner.name}</h2>
            <p className="muted small">도보 {winner.walkMin}분</p>
            {confirmed ? (
              <>
                <p className="confirmed">오늘 점심으로 정했어요</p>
                <Button block variant="secondary" onClick={spin} disabled={spinning}>
                  그래도 다시 하기
                </Button>
                <p className="muted small">다시 해서 다른 곳을 고르면 오늘 기록이 바뀌어요.</p>
              </>
            ) : (
              <>
                <div className="card__actions">
                  <Button block size="lg" onClick={() => onDecide(winner)} loading={saving}>
                    여기로 결정
                  </Button>
                  <Button block variant="secondary" onClick={spin} disabled={spinning}>
                    다시 하기
                  </Button>
                </div>
                <p className="muted small">
                  누르면 방문 기록이 남고, 2주 동안 후보에서 빠져요.
                </p>
              </>
            )}
          </div>
        ) : (
          <Button
            block
            size="lg"
            onClick={spin}
            disabled={result.candidates.length === 0 || spinning}
          >
            {spinning ? '진행 중' : `${actionLabel(mode)} (후보 ${result.candidates.length}곳)`}
          </Button>
        )}

        {empty && <p className="notice notice--empty">{empty}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      </>
      )}

      <footer className="muted small">로그인 없음 · 링크만 있으면 누구나</footer>

      <Sheet
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title="오늘은 이미 정했어요"
        description={
          decidedPlace && confirming
            ? `${decidedPlace.name}에서 ${withJosa(confirming.name, '으로/로')} 바꿀까요?`
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
