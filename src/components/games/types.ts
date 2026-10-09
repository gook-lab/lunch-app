import type { Place } from '../../lib/candidates';

/**
 * 게임 모드는 연출만 바꾼다.
 *
 * 당첨은 호출하는 쪽이 이미 정해서 winnerIndex 로 넘긴다. 어떤 모드도
 * 결과를 계산하지 않는다 — 그러면 "최근 2주 제외" 의 공정성 근거가 무너지고
 * selectCandidates 의 테스트가 의미를 잃는다.
 */
export interface GameProps {
  candidates: Place[];
  /** null 이면 아직 안 돌린 상태. */
  winnerIndex: number | null;
  spinning: boolean;
  /**
   * 판 번호. 돌릴 때마다 바뀐다(증가 + 난수).
   *
   * winnerIndex 만으로는 부족하다 — 같은 곳이 연달아 당첨되면 값이 안
   * 바뀌어 사다리·핀볼 경기가 그대로 남고 방금 본 연출이 똑같이 한 번 더
   * 재생된다. 게임은 이 값이 바뀌면 새 판을 만든다. 핀볼은 시드 탐색의
   * 시작점으로도 쓴다.
   */
  run: number;
  onSpinEnd: () => void;
  /** 크게 보기 중인지. 핀볼은 이때 코스를 더 길게 보여 준다. */
  expanded?: boolean;
  /**
   * 게임 안에서 판을 시작하고 싶을 때(사다리의 출발 번호). App 의 실행
   * 버튼과 같은 spin 이다 — 당첨은 여전히 App 이 균등 난수로 정한다.
   */
  onRequestSpin?: () => void;
}

export type GameMode = 'wheel' | 'ladder' | 'slot' | 'pinball' | 'cards' | 'tournament';

/** label 은 칩에, action 은 실행 버튼에 쓴다. "돌리기" 는 슬롯·핀볼에 안 맞는다. */
export const GAME_MODES: { id: GameMode; label: string; action: string }[] = [
  { id: 'wheel', label: '돌림판', action: '돌리기' },
  { id: 'ladder', label: '사다리', action: '사다리 타기' },
  { id: 'slot', label: '슬롯', action: '레버 당기기' },
  { id: 'pinball', label: '핀볼', action: '구슬 굴리기' },
  { id: 'cards', label: '카드', action: '카드 뒤집기' },
  { id: 'tournament', label: '토너먼트', action: '대진 시작' },
];

export function actionLabel(mode: GameMode): string {
  return GAME_MODES.find((m) => m.id === mode)?.action ?? '돌리기';
}

/**
 * 모드마다 연출 길이가 다르다. 결과는 같다.
 *
 * 핀볼은 여기 없다 — 재생 길이가 경기마다 달라 컴포넌트가 정한다(timingFor).
 * 여기 적어두면 두 곳이 어긋날 수 있다.
 */
export const SPIN_MS: Record<Exclude<GameMode, 'pinball'>, number> = {
  wheel: 2600,
  // 사다리·슬롯은 핀볼에 비해 너무 빨리 끝나 긴장이 쌓일 틈이 없었다(10/9 손맛 리뷰 5·4점).
  ladder: 2800,
  slot: 2800,
  cards: 2400,
  // 판 수와 상관없이 이 시간 안에 끝난다. 20곳이면 5판이라 판마다 약 0.8초.
  tournament: 4200,
};

/** 게임이 끝나고 결과 모달을 열기까지. 마지막 장면(바늘이 걸리는 순간, 응원한 공 등수)을 볼 틈. */
export const RESULT_DELAY_MS = 700;

/** 기기(OS) 설정이 "동작 줄이기" 인가. 안내 문구를 띄울지 정하는 데 쓴다. */
export function systemReducesMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/*
 * 사용자가 앱에서 "연출 켜기" 를 눌렀는가. 기기 설정은 그대로 두고 이 앱의
 * 게임 연출만 다시 켠다. 동료 Mac 에 "동작 줄이기" 가 켜져 있어 게임이 결과만
 * 띄우는 걸 "배선이 안 됐다" 로 읽은 일이 있었다(2026-10-08).
 */
const FORCE_MOTION_KEY = 'lunch-app:force-motion';
let forceMotion = readForceMotion();

function readForceMotion(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(FORCE_MOTION_KEY) === '1';
  } catch {
    return false;
  }
}

export function motionForced(): boolean {
  return forceMotion;
}

export function setForceMotion(on: boolean): void {
  forceMotion = on;
  try {
    if (on) localStorage.setItem(FORCE_MOTION_KEY, '1');
    else localStorage.removeItem(FORCE_MOTION_KEY);
  } catch {
    // 시크릿 창에서는 저장이 막힌다. 이번 방문 동안만 켜진다.
  }
}

/** 연출을 건너뛸까. 기기가 동작을 줄이라 했고, 사용자가 앱에서 다시 켜지 않았으면. */
export function prefersReducedMotion(): boolean {
  return systemReducesMotion() && !forceMotion;
}
