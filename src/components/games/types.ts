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
  onSpinEnd: () => void;
}

export type GameMode = 'wheel' | 'ladder' | 'slot' | 'race' | 'pinball';

/** label 은 칩에, action 은 실행 버튼에 쓴다. "돌리기" 는 슬롯·핀볼에 안 맞는다. */
export const GAME_MODES: { id: GameMode; label: string; action: string }[] = [
  { id: 'wheel', label: '돌림판', action: '돌리기' },
  { id: 'ladder', label: '사다리', action: '사다리 타기' },
  { id: 'slot', label: '슬롯', action: '레버 당기기' },
  { id: 'race', label: '구슬', action: '구슬 굴리기' },
  { id: 'pinball', label: '핀볼', action: '공 떨어뜨리기' },
];

export function actionLabel(mode: GameMode): string {
  return GAME_MODES.find((m) => m.id === mode)?.action ?? '돌리기';
}

/**
 * 모드마다 연출 길이가 다르다. 결과는 같다.
 *
 * 핀볼은 여기 없다 — 구간마다 200ms 라 총 길이가 후보 수에 따라 달라진다.
 * 상수처럼 적어두면 누군가 총 길이로 읽고 타이밍을 틀린다.
 */
export const SPIN_MS: Record<Exclude<GameMode, 'pinball'>, number> = {
  wheel: 2600,
  ladder: 2200,
  slot: 1800,
  race: 3200,
};

/** 핀볼 한 구간(핀 하나 사이) 길이. */
export const PINBALL_SEG_MS = 200;

/** 모션을 줄이는 설정이면 연출을 건너뛴다. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
