import type { Place } from '../../lib/candidates';

/**
 * 게임 모드는 연출만 바꾼다.
 *
 * 당첨은 호출하는 쪽이 이미 정해서 winnerIndex 로 넘긴다. 어떤 모드도
 * 결과를 계산하지 않는다 — 그러면 "최근 1주 제외" 의 공정성 근거가 무너지고
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
  /**
   * 사용자가 판을 직접 두고 있다는 신호(짝 맞추기). App 의 연출 잠금 상한은
   * 이 신호가 올 때마다 처음부터 다시 잰다 — 직접 두는 판은 30초를 넘길 수 있다.
   */
  onActivity?: () => void;
}

export type GameMode = 'wheel' | 'ladder' | 'slot' | 'pinball' | 'cards' | 'memory' | 'tournament' | 'gacha' | 'plinko' | 'dice' | 'horse' | 'racing' | 'bomb' | 'balloon' | 'fishing' | 'archery' | 'curling' | 'plane' | 'treasure' | 'claw' | 'penalty' | 'bowling';

/** label 은 칩에, action 은 실행 버튼에 쓴다. "돌리기" 는 슬롯·핀볼에 안 맞는다. */
export const GAME_MODES: { id: GameMode; label: string; action: string }[] = [
  // 이벤트·컷신이 있는 게임을 앞에 둔다(10/15 사용자). 그다음 움직임이 큰 경주·물리, 마지막이 단순한 판.
  { id: 'archery', label: '활쏘기', action: '활 쏘기' },
  { id: 'penalty', label: '승부차기', action: '슛 쏘기' },
  { id: 'bowling', label: '볼링', action: '볼링공 던지기' },
  { id: 'claw', label: '인형뽑기', action: '집게 내리기' },
  { id: 'treasure', label: '보물찾기', action: '보물 파기' },
  { id: 'fishing', label: '낚시', action: '낚싯줄 던지기' },
  { id: 'curling', label: '컬링', action: '스톤 밀기' },
  { id: 'plane', label: '종이비행기', action: '비행기 날리기' },
  { id: 'horse', label: '경마', action: '경주 시작' },
  { id: 'racing', label: '레이싱', action: '출발하기' },
  { id: 'pinball', label: '핀볼', action: '공 굴리기' },
  { id: 'bomb', label: '폭탄', action: '폭탄 넘기기' },
  { id: 'balloon', label: '풍선', action: '풍선 터뜨리기' },
  { id: 'plinko', label: '플링코', action: '공 떨어뜨리기' },
  { id: 'wheel', label: '돌림판', action: '돌리기' },
  { id: 'ladder', label: '사다리', action: '사다리 타기' },
  { id: 'slot', label: '슬롯', action: '레버 당기기' },
  { id: 'dice', label: '주사위', action: '주사위 굴리기' },
  { id: 'gacha', label: '뽑기 기계', action: '손잡이 돌리기' },
  { id: 'cards', label: '카드', action: '카드 뒤집기' },
  { id: 'tournament', label: '토너먼트', action: '대진 시작' },
  { id: 'memory', label: '짝 맞추기', action: '짝 맞추기' },
];

/** 방식 단추 그림. 글자 이름은 그대로 두고 그림은 보조로만 쓴다. */
export const MODE_ICON: Record<GameMode, string> = {
  wheel: '🎡',
  ladder: '🪜',
  slot: '🎰',
  pinball: '🎱',
  cards: '🃏',
  memory: '🧩',
  tournament: '🏆',
  gacha: '🎁',
  plinko: '🔻',
  dice: '🎲',
  horse: '🏇',
  racing: '🏎️',
  bomb: '💣',
  balloon: '🎈',
  fishing: '🎣',
  archery: '🏹',
  curling: '🥌',
  plane: '✈️',
  treasure: '🗺️',
  claw: '🧸',
  penalty: '⚽',
  bowling: '🎳',
};

export function actionLabel(mode: GameMode): string {
  return GAME_MODES.find((m) => m.id === mode)?.action ?? '돌리기';
}

/**
 * 모드마다 연출 길이가 다르다. 결과는 같다.
 *
 * 핀볼·플링코·주사위·경마·레이싱·폭탄·풍선·낚시·활쏘기·컬링·종이비행기·보물찾기·인형뽑기·승부차기·볼링·뽑기 기계·카드는 여기 없다 — 재생 길이가 경기마다 달라 컴포넌트가 정한다.
 * 여기 적어두면 두 곳이 어긋날 수 있다. 짝 맞추기도 없다 — 사람이 두는 만큼 걸린다.
 */
export const SPIN_MS: Record<Exclude<GameMode, 'pinball' | 'memory' | 'plinko' | 'dice' | 'horse' | 'racing' | 'bomb' | 'balloon' | 'fishing' | 'archery' | 'curling' | 'plane' | 'treasure' | 'claw' | 'penalty' | 'bowling' | 'gacha' | 'cards'>, number> = {
  // 돌림판: 끼릭끼릭 감기 0.5~0.9초 + 휘리릭 + 결말(멈칫·한 칸 더·역회전) → 5.22초에 멈추고 0.38초 조명. 결말은 lib/wheel.ts.
  wheel: 5600,
  // 사다리·슬롯은 핀볼에 비해 너무 빨리 끝나 긴장이 쌓일 틈이 없었다(10/9 손맛 리뷰 5·4점).
  // 사다리: 준비 0.45초 + 주자들 달리기(두리번·가짜 길 포함) 4.25초 + 커튼 0.9초 + 두구두구 뒤 열림 0.8초(10/15).
  ladder: 6400,
  // 슬롯: 레버 0.65초 → 릴이 하나씩 선다(리치·멈칫·한 칸 지나침·다시 돌기) → 5.6초에 세 줄, 0.6초 잭팟. 장면은 lib/slot.ts.
  slot: 6200,
  // 토너먼트는 상한이다 — 실제 길이는 lib/tournament.ts 의 tournamentPlan 이 판 수로 정한다(2곳 약 4.6초 · 20곳 약 7초).
  // 4.2초 고정일 때 VS 컷신·눈싸움·역전을 넣을 틈이 없었다(10/15 게임 업그레이드).
  tournament: 7200,
};

/** 게임이 끝나고 결과 모달을 열기까지. 마지막 장면을 볼 틈만 — 700ms 는 늦게 뜬다고 했다(10/13 사용자). */
export const RESULT_DELAY_MS = 250;

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

/*
 * "결과 바로 보기". 게임이 길어져(대부분 5~7초) 바쁠 땐 결과만 보고 싶다는 데 대비한 스위치.
 * 동작 줄이기와 같은 길(마지막 장면만 그리기)을 탄다 — 게임마다 따로 짧은 판을 만들지 않는다.
 * 당첨은 spin() 이 먼저 정하니 확률은 그대로다.
 */
const QUICK_KEY = 'lunch-app:quick';
let quick = readQuick();

function readQuick(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(QUICK_KEY) === '1';
  } catch {
    return false;
  }
}

export function quickResult(): boolean {
  return quick;
}

export function setQuickResult(on: boolean): void {
  quick = on;
  try {
    if (on) localStorage.setItem(QUICK_KEY, '1');
    else localStorage.removeItem(QUICK_KEY);
  } catch {
    // 시크릿 창에서는 저장이 막힌다. 이번 방문 동안만 켜진다.
  }
}

/** 연출을 건너뛸까. 결과 바로 보기를 켰거나, 기기가 동작을 줄이라 했고 앱에서 다시 켜지 않았으면. */
export function prefersReducedMotion(): boolean {
  return quick || (systemReducesMotion() && !forceMotion);
}
