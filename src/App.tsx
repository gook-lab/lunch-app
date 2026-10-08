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
import { Button, Sheet } from '@gook-lab/ui';
import { Wheel } from './components/games/Wheel';
import { Ladder } from './components/games/Ladder';
import { Slot } from './components/games/Slot';
import { Pinball } from './components/games/Pinball';
import { Cards } from './components/games/Cards';
import {
  actionLabel,
  GAME_MODES,
  motionForced,
  prefersReducedMotion,
  setForceMotion,
  systemReducesMotion,
  type GameMode,
} from './components/games/types';
import { PlaceList } from './components/PlaceList';
import { Roadmap } from './components/Roadmap';
import { useTodayKST } from './hooks/useTodayKST';
import { useLunchData } from './hooks/useLunchData';
import { selectCandidates, type Filters, type Place } from './lib/candidates';
import { categoryHue } from './lib/category';
import { josa, withJosa } from './lib/josa';
import { officeSource } from './lib/walk';
import { emptyMessage, noticeMessage } from './lib/messages';
import { decideToday } from './services/lunch';
import './App.css';

// 지도와 추가는 결정 화면 첫 페인트에 섞이지 않는다 (D7).
const MapTab = lazy(() => import('./components/MapTab'));

type Tab = 'roadmap' | 'list' | 'map';
const TABS: Tab[] = ['roadmap', 'list', 'map'];
const TAB_LABEL: Record<Tab, string> = { roadmap: '오늘', list: '목록', map: '지도' };
const TAB_ICON: Record<Tab, string> = { roadmap: '🍱', list: '📋', map: '🗺️' };

/**
 * 연출 잠금 해제 상한. 판을 늘린 뒤 핀볼이 가장 길다 — 1등 도착 평균 8~10초,
 * 긴 경기 13초 남짓에 막판 슬로·꼬리·출발 게이트를 더해 17초 안팎. 넉넉히 30초.
 */
const SPIN_TIMEOUT_MS = 30_000;

const TAB_TITLE: Record<Tab, string> = {
  roadmap: '오늘 점심',
  list: '가게 목록',
  map: '우리 도보권',
};

/** 방식 단추 그림. 글자 이름은 그대로 두고 그림은 보조로만 쓴다. */
const MODE_ICON: Record<GameMode, string> = { wheel: '🎡', ladder: '🪜', slot: '🎰', pinball: '🎱', cards: '🃏' };

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];
/** "20261008" 을 "10월 8일 목요일" 로. */
function formatDay(day: string): string {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6, 8));
  if (!y || !m || !d) return '';
  const w = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 ${w}요일`;
}

export default function App() {
  const today = useTodayKST();
  const { state, error, places, visits, today: decision, refreshing, reload, officeKey } = useLunchData(today);

  const [filters, setFilters] = useState<Filters>({
    maxWalkMin: 10,
    categories: [],
    excludeRecent: true,
  });
  const [spinning, setSpinning] = useState(false);
  // 크게 보기. 게임 무대를 화면 전체로 펼친다. 연출·당첨에는 영향이 없다.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);
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
  const resultRef = useRef<HTMLHeadingElement>(null);
  // 키보드로 실행한 판이면 결과가 뜰 때 초점을 결과로 옮긴다. 실행 단추는
  // 누르는 순간 잠기고, 끝나면 결과 카드로 갈아 끼워져서 초점이 <body> 로
  // 떨어진다(10/8 실측). 다른 곳에 초점이 있었으면 건드리지 않는다.
  const focusResult = useRef(false);
  // 기기 설정은 앱이 바꿀 수 없으니 읽기만 한다. 앱 안 스위치는 games/types.ts 가 기억한다.
  const [reducedBySystem] = useState(systemReducesMotion);
  const [motionOn, setMotionOn] = useState(motionForced);
  const toggleMotion = useCallback(() => {
    const next = !motionOn;
    setForceMotion(next);
    setMotionOn(next);
  }, [motionOn]);
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
    // 연출 중에는 방식 단추가 잠기지만, "다시 하기" 와 같은 순간에 들어온 클릭은
    // 잠기기 전에 도착한다. 판만 비우고 진행 상태를 두면 새 게임판이
    // winnerIndex 없이 "진행 중" 에 갇혀 워치독(20초)까지 기다린다(10/8 실측).
    // 탭 이동(goTab)처럼 연출을 끊는다.
    setSpinning(false);
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
    const active = document.activeElement;
    focusResult.current = active === document.body || (active !== null && !!boardRef.current?.closest('.stage')?.contains(active));
    if (focusResult.current) boardRef.current?.focus({ preventScroll: true });
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

  useEffect(() => {
    if (!winner || !focusResult.current) return;
    focusResult.current = false;
    resultRef.current?.focus({ preventScroll: true });
  }, [winner]);

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

  // WAI-ARIA 탭 패턴: 탭 사이는 화살표·Home·End 로 옮기고, Tab 키는 탭 묶음을
  // 한 번에 지나간다(선택된 탭만 tabIndex 0). 옮기면 바로 그 탭을 연다.
  const onTabKey = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const i = TABS.indexOf(tab);
      const next =
        e.key === 'ArrowRight' ? TABS[(i + 1) % TABS.length]
        : e.key === 'ArrowLeft' ? TABS[(i - 1 + TABS.length) % TABS.length]
        : e.key === 'Home' ? TABS[0]
        : e.key === 'End' ? TABS[TABS.length - 1]
        : null;
      if (!next) return;
      e.preventDefault();
      goTab(next);
      document.getElementById(`tab-${next}`)?.focus();
    },
    [tab, goTab],
  );

  /**
   * 연출 잠금의 마지막 방어선.
   *
   * onSpinEnd 가 안 불리면 spinning 이 true 로 박혀 모드 칩과 실행 버튼이
   * 전부 잠긴다. 새로고침 말고는 복구가 없다. 실제로 두 경로에서 그랬다 —
   * 연출 중 필터 변경, 연출 중 탭 전환. 둘 다 막았지만 게임 컴포넌트가
   * 하나라도 onSpinEnd 를 놓치면 같은 일이 또 난다.
   *
   * 가장 긴 연출이 핀볼 최대 약 10.5초다(게이트 + 9초 + 정리). 그 두 배를 넘기면 뭔가 잘못된 것이니
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

  // 단추는 saving 으로 잠기지만, 잠기기 전에 같은 순간 들어온 두 번째 클릭은
  // 막지 못한다. 상태가 아니라 ref 로 즉시 막는다.
  const savingRef = useRef(false);
  const commit = useCallback(
    async (place: Place) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      try {
        await decideToday(today, place.id);
        setConfirming(null);
      } finally {
        savingRef.current = false;
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
      <div className="topbar">
      <header className="app__header">
        <p className="app__date">{formatDay(today)}</p>
        <div className="app__titleRow">
          <h1>{TAB_TITLE[tab]}</h1>
          <span className="app__count">
            {refreshing ? '새로고침 중' : `가게 ${places.filter((p) => p.active).length}곳`}
          </span>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="화면" onKeyDown={onTabKey}>
        {TABS.map((t) => (
          <button
            key={t}
            id={`tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            className={tab === t ? 'on' : ''}
            onClick={() => goTab(t)}
          >
            <span className="tabs__icon" aria-hidden="true">{TAB_ICON[t]}</span>
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>
      </div>

      {tab === 'list' && (
        <div role="tabpanel" id="panel-list" aria-labelledby="tab-list" className="panel">
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
        </div>
      )}

      {tab === 'map' && (
        <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" className="panel">
          <Suspense fallback={<p className="muted small">지도를 준비하고 있어요</p>}>
            <MapTab key={officeKey} places={places} onChanged={reload} onOfficeChanged={reload} />
          </Suspense>
        </div>
      )}

      {tab === 'roadmap' && (
      <div role="tabpanel" id="panel-roadmap" aria-labelledby="tab-roadmap" className="panel">

      {decidedPlace && !winner && (
        <section className="decided" aria-label="오늘 정한 곳">
          <span className="decided__check" aria-hidden="true">✓</span>
          <div className="decided__body">
            <p className="decided__title">
              오늘은 <strong>{decidedPlace.name}</strong>
              {josa(decidedPlace.name, '으로/로')} 정했어요
            </p>
            <p className="muted small">
              {decidedPlace.category} · 도보 {decidedPlace.walkMin}분 · 다시 돌려서 바꿀 수 있어요
            </p>
          </div>
        </section>
      )}

      <div className="today">
      <section
        className={['stage', spinning ? 'stage--busy' : '', expanded ? 'stage--full' : ''].filter(Boolean).join(' ')}
        aria-label="게임"
      >
        <div className="stage__top">
          <span className="stage__label">{expanded ? '크게 보는 중' : ''}</span>
          <button
            type="button"
            className="stage__expand"
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '✕ 작게 보기' : '⤢ 크게 보기'}
          </button>
        </div>
        <div className="modebar" role="group" aria-label="방식">
          {GAME_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={mode === m.id}
              className={mode === m.id ? 'modebar__item modebar__item--on' : 'modebar__item'}
              onClick={() => pickMode(m.id)}
              disabled={spinning}
            >
              <span className="modebar__icon" aria-hidden="true">{MODE_ICON[m.id]}</span>
              {m.label}
            </button>
          ))}
        </div>
        <p className="muted small stage__hint">방식은 보여주는 것만 달라요 · 확률은 같아요</p>

        {/*
          * 기기의 "동작 줄이기" 가 켜져 있으면 게임이 연출 없이 결과만 띄운다.
          * 말없이 그러면 "게임이 안 돌아간다" 로 읽힌다. 이유를 알리고, 이 앱에서만
          * 연출을 다시 켤 수 있게 한다.
          */}
        {reducedBySystem && (
          <div className="motion-note" role="note">
            <p>
              {motionOn
                ? '기기의 \u2018동작 줄이기\u2019가 켜져 있지만 이 앱에서는 연출을 보여 드려요.'
                : '기기의 \u2018동작 줄이기\u2019가 켜져 있어서 연출 없이 결과만 보여 드려요.'}
            </p>
            <button type="button" className="motion-note__toggle" onClick={toggleMotion} disabled={spinning}>
              {motionOn ? '연출 끄기' : '연출 켜기'}
            </button>
          </div>
        )}

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
        <div ref={boardRef} className="stage__board" tabIndex={-1}>
          {(() => {
            const game = {
              candidates: board ?? result.candidates,
              winnerIndex,
              spinning,
              run,
              onSpinEnd,
              expanded,
            };
            // 사다리는 사용자가 판을 고친다. 후보 구성이 바뀌면 새 판이어야 하므로
            // 후보 id 를 key 로 준다. 돌린 순간 얼리는 board 는 같은 id 라 판이 유지된다.
            if (mode === 'ladder') {
              const key = game.candidates.map((p) => p.id).join(',');
              return <Ladder key={key} {...game} onRequestSpin={spin} />;
            }
            if (mode === 'cards') {
              const key = game.candidates.map((p) => p.id).join(',');
              return <Cards key={key} {...game} onRequestSpin={spin} />;
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
          <div className="card card--result ticket">
            <p className="ticket__eyebrow">오늘의 점심</p>
            <h2 className="ticket__name" ref={resultRef} tabIndex={-1}>{winner.name}</h2>
            <div className="ticket__meta">
              <span
                className="card__cat"
                style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}
              >
                {winner.category}
              </span>
              <span>도보 {winner.walkMin}분</span>
            </div>
            <hr className="ticket__perf" aria-hidden="true" />
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

      {/* 조건은 게임 옆(데스크톱)·아래(휴대폰)에 둔다. 첫 화면은 게임이 차지한다. */}
      <aside className="today__filters" aria-labelledby="filters-title">
        <h2 id="filters-title" className="today__title">조건</h2>
        <Roadmap
          places={places}
          filters={filters}
          result={result}
          winnerId={winner?.id ?? null}
          onWalk={(walkMin) => updateFilters((f) => ({ ...f, maxWalkMin: walkMin }))}
          onCategory={toggleCategory}
          onExcludeRecent={() => updateFilters((f) => ({ ...f, excludeRecent: !f.excludeRecent }))}
        />
        {/* officeKey 가 바뀌면 다시 그려진다(회사 위치 저장 → 다시 읽기). */}
        <div className={officeSource() === 'saved' ? 'today__office' : 'today__office today__office--temp'} data-office={officeKey}>
          <span>
            🏢 {officeSource() === 'saved' ? '정해 둔 회사 위치에서 잰 도보 시간이에요' : '회사 위치가 아직 임시값이에요'}
          </span>
          <button type="button" className="linkish" onClick={() => goTab('map')}>
            {officeSource() === 'saved' ? '바꾸기' : '정하기'}
          </button>
        </div>
      </aside>
      </div>

      </div>
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
