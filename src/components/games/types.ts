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

export type GameMode = 'wheel' | 'ladder' | 'slot';

export const GAME_MODES: { id: GameMode; label: string }[] = [
  { id: 'wheel', label: '돌림판' },
  { id: 'ladder', label: '사다리' },
  { id: 'slot', label: '슬롯' },
];

/** 모드마다 연출 길이가 다르다. 결과는 같다. */
export const SPIN_MS: Record<GameMode, number> = {
  wheel: 2600,
  ladder: 2200,
  slot: 1800,
};

/** 모션을 줄이는 설정이면 연출을 건너뛴다. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}
