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
import { Button, Modal, Sheet } from '@gook-lab/ui';
import { Spinner } from '@gook-lab/motion';
import { Wheel } from './components/games/Wheel';
import { Ladder } from './components/games/Ladder';
import { Slot } from './components/games/Slot';
import { Pinball } from './components/games/Pinball';
import { Cards } from './components/games/Cards';
import { Memory } from './components/games/Memory';
import { Gacha } from './components/games/Gacha';
import { Plinko } from './components/games/Plinko';
import { Dice } from './components/games/Dice';
import { ballCountsFor, pickWeighted } from './lib/weights';
import { CandidateChips } from './components/CandidateChips';
import { useMedia } from './hooks/useMedia';
import { StatusScreen } from './components/StatusScreen';
import { Tournament } from './components/games/Tournament';
import { ShareButton } from './components/ShareButton';
import {
  actionLabel,
  RESULT_DELAY_MS,
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
// 종이 식권 테마는 App.css 뒤에 — 같은 명시도로 덮는다.
import './theme.css';

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
const MODE_ICON: Record<GameMode, string> = { wheel: '🎡', ladder: '🪜', slot: '🎰', pinball: '🎱', cards: '🃏', memory: '🧩', tournament: '🏆', gacha: '🎁', plinko: '🔻', dice: '🎲' };

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

/** "20261013" 이 그해 몇 번째 날인가(1월 1일 = 1). 식권 번호로 쓴다. */
function dayOfYear(day: string): number {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(4, 6));
  const d = Number(day.slice(6, 8));
  if (!y || !m || !d) return 0;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
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
  // 데스크톱(960px~)은 오른쪽 칸에 후보·조건을 펼쳐 두고, 휴대폰은 요약 한 줄 → 시트로 연다.
  const wide = useMedia('(min-width: 960px)');
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 핀볼 공 개수(가게 id → 개수). 이번 방문 동안만 쓴다. 핀볼일 때만 확률이 된다(lib/weights.ts).
  const [ballCounts, setBallCounts] = useState<Record<string, number>>({});
  // 돌린 순간의 공 개수. board 처럼 얼려 둬야 연출 중에 바꿔도 경기가 안 바뀐다.
  const [boardBalls, setBoardBalls] = useState<number[] | null>(null);
  // 판 번호. 돌릴 때마다 증가 + 난수. 게임이 새 판을 만드는 키이자 핀볼 시드 시작점.
  const [run, setRun] = useState(0);
  // 짝 맞추기처럼 사람이 직접 두는 판의 활동 신호. 연출 잠금 상한을 다시 잰다.
  const [alive, setAlive] = useState(0);
  const onActivity = useCallback(() => setAlive((n) => n + 1), []);
  const [confirming, setConfirming] = useState<Place | null>(null);
  // 게임이 끝나면 결과를 모달로 띄운다. 닫으면 같은 결과 카드가 게임 아래에 남는다.
  const [resultOpen, setResultOpen] = useState(false);
  // "여기로 결정" 저장 실패. 다시 돌리면 지운다.
  const [saveProblem, setSaveProblem] = useState(false);
  const resultTimer = useRef(0);
  const closeResult = useCallback(() => {
    window.clearTimeout(resultTimer.current);
    setResultOpen(false);
  }, []);
  useEffect(() => () => window.clearTimeout(resultTimer.current), []);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('roadmap');
  const boardRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const resultBarRef = useRef<HTMLButtonElement>(null);
  // 키보드로 실행한 판이면 결과가 뜰 때 초점을 결과로 옮긴다. 실행 단추는
  // 누르는 순간 잠기고, 끝나면 결과 카드로 갈아 끼워져서 초점이 <body> 로
  // 떨어진다(10/8 실측). 다른 곳에 초점이 있었으면 건드리지 않는다.
  const focusResult = useRef(false);
  // 기기 설정은 앱이 바꿀 수 없으니 읽기만 한다. 앱 안 스위치는 games/types.ts 가 기억한다.
  const [reducedBySystem] = useState(systemReducesMotion);
  const [motionOn, setMotionOn] = useState(motionForced);
  // CSS 연출도 이 값을 따른다. @media (prefers-reduced-motion) 로 끄면 "연출 켜기" 를 눌러도
  // 바늘 착지·카드 들썩임·토너먼트 튀어나옴 같은 CSS 애니메이션은 꺼진 채였다(10/9 접근성 리뷰).
  useEffect(() => {
    document.documentElement.dataset.motion = reducedBySystem && !motionOn ? 'reduced' : 'full';
  }, [reducedBySystem, motionOn]);

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
    closeResult();
    setBoard(null);
    setWinner(null);
    setWinnerIndex(null);
    setMode(next);
    try {
      localStorage.setItem('lunch-app:mode', next);
    } catch {
      // 시크릿 창에서는 저장이 막힌다. 동작에는 영향 없다.
    }
  }, [closeResult]);

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
    // 핀볼은 공 개수에 비례해 뽑는다. 전부 1개면 아래 균등 추첨과 똑같다.
    const balls = mode === 'pinball' ? ballCountsFor(frozen.map((p) => p.id), ballCounts) : null;
    const index = balls ? pickWeighted(balls, Math.random) : Math.floor(Math.random() * frozen.length);
    setBoardBalls(balls);
    closeResult();
    setSaveProblem(false);
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
  }, [result.candidates, spinning, closeResult, mode, ballCounts]);

  useEffect(() => {
    if (!winner || !focusResult.current) return;
    focusResult.current = false;
    resultRef.current?.focus({ preventScroll: true });
  }, [winner]);

  // 모달이 열리면 초점을 모달 안 당첨 이름에 둔다(dialog 기본은 첫 단추 "여기로 결정" 이다).
  // 닫으면 게임 아래 한 줄 결과의 "결과 보기" 로 — dialog 기본 복귀처는 모달이 열리기 전
  // 초점(대개 body)이라 키보드 사용자가 길을 잃었다(16회차).
  const wasResultOpen = useRef(false);
  useEffect(() => {
    if (resultOpen) resultRef.current?.focus({ preventScroll: true });
    else if (wasResultOpen.current) resultBarRef.current?.focus({ preventScroll: true });
    wasResultOpen.current = resultOpen;
  }, [resultOpen]);

  const onSpinEnd = useCallback(() => {
    setSpinning(false);
    setWinner((prev) => (winnerIndex === null ? prev : (board?.[winnerIndex] ?? prev)));
    // 결과는 모달로. 게임 아래 카드는 스크롤해야 보였고, 끝난 순간이 밋밋했다(10/9 사용자).
    // 바로 띄우면 게임의 마지막 장면(바늘이 걸리는 순간, 응원한 공의 등수)을 모달이
    // 덮는다. 잠깐 보여 주고 연다.
    if (winnerIndex !== null) {
      window.clearTimeout(resultTimer.current);
      resultTimer.current = window.setTimeout(
        () => setResultOpen(true),
        prefersReducedMotion() ? 0 : RESULT_DELAY_MS,
      );
    }
  }, [winnerIndex, board]);

  // 탭을 옮겨도 게임은 계속된다. 오늘 탭 패널은 숨기기만 하고 내리지 않는다
  // (hidden). 게임 도중 목록·지도를 보고 오고 싶다는 요청이 있었다(10/12).
  // 예전엔 패널을 내려서 게임 타이머가 지워졌고, 그래서 탭을 옮기면 판을 끊었다.
  // 딴 탭에서 끝나면 결과 모달은 보던 화면을 덮지 않게 오늘 탭에서만 열린다
  // (Modal open 조건). 그동안 탭 바에 "결과" 를 단다.
  // 탭 이동은 전부 이 함수를 거친다.
  // 목록의 "지도에서 보기" 로 지도를 열면 그 가게 핀을 고른 채로 연다.
  const [mapFocus, setMapFocus] = useState<string | null>(null);
  const goTab = useCallback((next: Tab) => {
    setFiltersOpen(false);
    setMapFocus(null);
    setTab(next);
  }, []);
  const showOnMap = useCallback((placeId: string) => {
    setMapFocus(placeId);
    setTab('map');
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
  // 딴 탭에 있는 동안은 재지 않는다 — 직접 두던 짝 맞추기가 자리 비운 사이 풀리면 안 된다.
  // 돌아오면 처음부터 다시 잰다.
  useEffect(() => {
    if (!spinning || tab !== 'roadmap') return;
    const t = window.setTimeout(() => setSpinning(false), SPIN_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, [spinning, alive, tab]);

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

  // 공 개수를 바꾸면 지난 판을 내려놓는다(조건 바꾸기와 같다). 얼려 둔 판이 남아 있으면
  // 바꾼 개수가 화면에 안 보이고, 지난 경기와 구슬 수도 안 맞는다.
  const changeBalls = useCallback((update: (prev: Record<string, number>) => Record<string, number>) => {
    setBoard(null);
    setBoardBalls(null);
    setWinner(null);
    setWinnerIndex(null);
    setBallCounts(update);
  }, []);

  // 단추는 saving 으로 잠기지만, 잠기기 전에 같은 순간 들어온 두 번째 클릭은
  // 막지 못한다. 상태가 아니라 ref 로 즉시 막는다.
  const savingRef = useRef(false);
  const commit = useCallback(
    async (place: Place) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setSaveProblem(false);
      try {
        await decideToday(today, place.id);
        setConfirming(null);
      } catch {
        // 실패하면 스피너만 멈추고 아무 말이 없었다. 결정된 줄 알고 밥 먹으러 간다.
        setSaveProblem(true);
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    },
    [today],
  );

  const onDecide = useCallback(
    (place: Place) => {
      // 모달이 뜨기 전 0.7초 사이에 게임 아래 카드로 결정했으면 모달은 띄우지 않는다.
      // 띄우면 확인 시트 위에 결과 모달이 덮인다.
      window.clearTimeout(resultTimer.current);
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
    return (
      <main className="app app--center">
        <StatusScreen
          role="status"
          art={<span className="status__ring">🍱</span>}
          title="불러오는 중이에요"
          lines={['가게 목록과 방문 기록을 읽고 있어요']}
        />
      </main>
    );
  }

  if (state === 'error') {
    return (
      <main className="app app--center">
        <StatusScreen
          role="alert"
          art={<span className="status__bang">!</span>}
          title="목록을 불러오지 못했어요"
          code={String((error as Error)?.message ?? error)}
          lines={['네트워크를 확인하고 다시 시도해 주세요.', '계속 안 되면 링크를 새로 받아 열어 주세요.']}
          action={<Button onClick={reload}>다시 시도</Button>}
        />
      </main>
    );
  }

  const empty = emptyMessage(result);
  const notice = noticeMessage(result);

  // 결과 카드. 끝난 순간엔 모달 안에, 닫으면 게임 아래에 같은 카드가 놓인다.
  // 후보와 조건. 데스크톱은 오른쪽 칸, 휴대폰은 시트 안에 같은 것을 그린다(한 번에 한 곳만).
  const filtersPanel = (
    <>
      <CandidateChips result={result} winnerId={winner?.id ?? null} />
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
    </>
  );

  // 핀볼에서 가게마다 공 개수가 다른가. 그러면 "확률은 같아요" 가 거짓이 된다.
  const liveBalls = ballCountsFor(result.candidates.map((p) => p.id), ballCounts);
  const weighted = mode === 'pinball' && liveBalls.some((n) => n !== liveBalls[0]);
  // 핀볼에서 공 개수를 다르게 줬으면 결과에 그 확률을 남긴다. 다 같으면 안 쓴다.
  const odds =
    mode === 'pinball' && boardBalls && winnerIndex !== null && boardBalls.some((n) => n !== boardBalls[0])
      ? { mine: boardBalls[winnerIndex] ?? 1, total: boardBalls.reduce((a, n) => a + n, 0) }
      : null;
  const ticket = winner ? (
    <div className="card card--result ticket">
      {/* 어떤 게임으로 뽑았는지 남긴다. 결과 모달이 게임판을 가리므로 여기서 이어 준다. */}
      <p className="ticket__eyebrow">
        <span aria-hidden="true">{MODE_ICON[mode]} </span>
        {withJosa(GAME_MODES.find((m) => m.id === mode)?.label ?? '게임', '으로/로')} 뽑은 오늘의 점심
      </p>
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
      {odds && (
        <p className="muted small ticket__odds">
          공 {odds.total}개 중 {odds.mine}개였어요 · 확률 {Math.round((odds.mine / odds.total) * 100)}%
        </p>
      )}
      <hr className="ticket__perf" aria-hidden="true" />
      {confirmed ? (
        <>
          <p className="confirmed">오늘 점심으로 정했어요</p>
          <ShareButton place={winner} />
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
            누르면 방문 기록이 남고, 1주 동안 후보에서 빠져요.
          </p>
          {/* 확인 시트가 떠 있으면 시트 쪽에만 띄운다. 두 곳에서 읽히면 두 번 들린다. */}
          {saveProblem && !confirming && (
            <p className="notice notice--empty" role="alert">
              저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.
            </p>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <main className="app">
      <div className="topbar">
      <header className="app__header">
        {/* 종이 식권 테마 — 날마다 번호가 붙는 식권처럼. 번호는 그해 몇 번째 날이다. */}
        <p className="app__date">
          <span className="app__ticketNo">NO. {String(dayOfYear(today)).padStart(4, '0')}</span> · {formatDay(today)} · 사내 점심 식권
        </p>
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
            {t === 'roadmap' && tab !== 'roadmap' && (spinning || resultOpen) && (
              <span className={resultOpen ? 'tabs__badge tabs__badge--done' : 'tabs__badge'}>
                <span className="sr-only">, </span>
                {resultOpen ? '결과' : '게임 중'}
              </span>
            )}
          </button>
        ))}
      </nav>
      </div>

      {tab === 'list' && (
        <div role="tabpanel" id="panel-list" aria-labelledby="tab-list" className="panel">
          <PlaceList
            places={places}
            visits={visits}
            today={today}
            onChanged={reload}
            excludeRecent={filters.excludeRecent}
            onShowOnMap={showOnMap}
            onAdd={() => goTab('map')}
          />
        </div>
      )}

      {tab === 'map' && (
        <div role="tabpanel" id="panel-map" aria-labelledby="tab-map" className="panel">
          <Suspense
            fallback={
              <div className="panel-loading">
                <Spinner size={28} style={{ borderRadius: "50%" }} aria-label="지도를 준비하고 있어요" />
                <p className="muted small">지도를 준비하고 있어요</p>
              </div>
            }
          >
            <MapTab
              key={officeKey}
              places={places}
              onChanged={reload}
              onOfficeChanged={reload}
              todayId={decidedPlace?.id ?? null}
              focusId={mapFocus}
            />
          </Suspense>
        </div>
      )}

      <div role="tabpanel" id="panel-roadmap" aria-labelledby="tab-roadmap" className="panel" hidden={tab !== 'roadmap'}>

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
            <ShareButton place={decidedPlace} />
          </div>
        </section>
      )}

      {places.length === 0 ? (
        <StatusScreen
          inline
          art={
            <span className="status__office">
              <span className="status__dot" />
              <span className="status__officeLabel">사무실</span>
            </span>
          }
          title="아직 등록된 가게가 없어요"
          lines={['지도 탭에서 회사 위치를 정하고', '첫 가게를 넣어 주세요. 5곳부터 게임이 돼요.']}
          action={
            <Button onClick={() => goTab('map')}>
              <span aria-hidden="true">🗺️ </span>지도에서 가게 추가
            </Button>
          }
        />
      ) : (
      <div className="today">
      <section
        className={['stage', spinning ? 'stage--busy' : '', expanded ? 'stage--full' : ''].filter(Boolean).join(' ')}
        aria-label="게임"
      >
        {/*
          * 휴대폰: 조건은 요약 한 줄로 줄이고 누르면 시트로 연다. 로드맵(356px)을 게임 아래에
          * 쌓으면 조건이 탭 바 밑으로 한참 내려가 안 보였다(10/12 와이어프레임 개선).
          */}
        {!wide && !expanded && (
          <button type="button" className="today__summary" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
            <span className="today__summaryMain">후보 {result.candidates.length}곳</span>
            <span className="today__summaryRest">
              도보 {filters.maxWalkMin}분 · {filters.categories.length > 0 ? filters.categories.join('·') : '카테고리 전체'}
              {filters.excludeRecent ? ' · 최근 1주 제외' : ''}
            </span>
            <span className="today__summaryGo">
              바꾸기<span aria-hidden="true"> ▾</span>
            </span>
          </button>
        )}
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
        <div className="stage__top">
          {/* 안내 한 줄과 크게 보기를 한 줄에 둔다. 크게 보기 혼자 한 줄을 먹어 게임판이 밀렸다(10/9 UI 점검). */}
          {expanded ? (
            <span className="stage__label">크게 보는 중</span>
          ) : (
            <p className="muted small stage__hint">
              {weighted ? '핀볼은 공이 많은 가게일수록 잘 걸려요' : '방식은 보여주는 것만 달라요 · 확률은 같아요'}
            </p>
          )}
          <button
            type="button"
            className="stage__expand"
            aria-pressed={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <span aria-hidden="true">{expanded ? '✕ ' : '⤢ '}</span>
            {expanded ? '작게 보기' : '크게 보기'}
          </button>
        </div>

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
            if (mode === 'memory') {
              const key = game.candidates.map((p) => p.id).join(',');
              return <Memory key={key} {...game} onRequestSpin={spin} onActivity={onActivity} />;
            }
            if (mode === 'tournament') {
              // 응원 고른 것은 같은 후보 구성 안에서만 유지한다.
              const key = game.candidates.map((p) => p.id).join(',');
              return <Tournament key={key} {...game} />;
            }
            if (mode === 'slot') return <Slot {...game} />;
            if (mode === 'pinball') {
              const balls = board && boardBalls ? boardBalls : ballCountsFor(game.candidates.map((p) => p.id), ballCounts);
              return <Pinball {...game} balls={balls} onBallCounts={changeBalls} />;
            }
            if (mode === 'gacha') return <Gacha {...game} />;
            if (mode === 'plinko') return <Plinko {...game} />;
            if (mode === 'dice') {
              const key = game.candidates.map((p) => p.id).join(',');
              return <Dice key={key} {...game} />;
            }
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

        {/* 모달을 닫으면 게임 아래엔 한 줄만 남긴다. 티켓 전체가 남으면 모달과 같은 카드가
            화면 아래를 계속 차지했다(10/13 사용자). 결정·공유는 "결과 보기" 로 다시 연다. */}
        {winner && !resultOpen ? (
          <div className="result-bar">
            <p className="result-bar__text">
              <span aria-hidden="true">{MODE_ICON[mode]} </span>
              <strong>{winner.name}</strong>
              <span className="result-bar__meta">
                도보 {winner.walkMin}분{confirmed ? ' · 오늘 점심으로 정했어요' : ''}
              </span>
            </p>
            <div className="result-bar__actions">
              <Button ref={resultBarRef} onClick={() => setResultOpen(true)}>
                결과 보기
              </Button>
              <Button variant="secondary" onClick={spin} disabled={spinning}>
                다시 하기
              </Button>
            </div>
          </div>
        ) : (
          // 오늘 이미 정했으면 다시 하기는 보조 동작이다. 위 배너가 "정했어요" 라고 하는데
          // 가장 큰 빨간 버튼이 또 돌리라고 하면 화면이 두 말을 한다(10/9 UI 점검).
          <Button
            block
            className="stage__run"
            size={decidedPlace ? 'md' : 'lg'}
            variant={decidedPlace ? 'secondary' : 'primary'}
            onClick={spin}
            disabled={result.candidates.length === 0 || spinning}
          >
            {spinning
              ? '진행 중'
              : `${decidedPlace ? '다시 ' : ''}${actionLabel(mode)} (후보 ${result.candidates.length}곳)`}
          </Button>
        )}

        {empty && <p className="notice notice--empty">{empty}</p>}
        {notice && <p className="notice">{notice}</p>}
      </section>

      {/* 조건은 게임 옆(데스크톱)·아래(휴대폰)에 둔다. 첫 화면은 게임이 차지한다. */}
      {wide && (
      <aside className="today__filters" aria-labelledby="filters-title">
        <h2 id="filters-title" className="today__title">
          후보 <span className="today__count">{result.candidates.length}곳</span>
        </h2>
        {filtersPanel}
      </aside>
      )}
      </div>
      )}

      </div>

      <footer className="muted small">로그인 없음 · 링크만 있으면 누구나</footer>

      <Sheet
        open={filtersOpen && !wide && tab === 'roadmap'}
        onClose={() => setFiltersOpen(false)}
        title={`후보 ${result.candidates.length}곳`}
        className="filters-sheet"
      >
        {filtersPanel}
        <Button block variant="secondary" onClick={() => setFiltersOpen(false)}>
          이대로 할게요
        </Button>
      </Sheet>

      <Modal
        open={resultOpen && winner !== null && tab === 'roadmap'}
        onClose={closeResult}
        className="result-modal"
        aria-label="오늘의 점심 결과"
      >
        {/* 닫힌 dialog 도 자식을 그린다. 그러면 카드가 두 벌이 되어 초점·ref 가 닫힌 쪽으로 간다. */}
        {resultOpen && ticket}
        <button type="button" className="linkish result-modal__close" onClick={closeResult}>
          닫고 게임 보기
        </button>
      </Modal>

      <Sheet
        open={confirming !== null}
        onClose={() => {
          setConfirming(null);
          setSaveProblem(false);
        }}
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
          <Button
            block
            variant="ghost"
            onClick={() => {
              setConfirming(null);
              setSaveProblem(false);
            }}
          >
            그대로 두기
          </Button>
        </div>
        {saveProblem && (
          <p className="notice notice--empty" role="alert">
            바꾸지 못했어요. 잠시 뒤 다시 눌러 주세요.
          </p>
        )}
      </Sheet>
    </main>
  );
}
