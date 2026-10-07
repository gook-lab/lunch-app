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
}

export type GameMode = 'wheel' | 'ladder' | 'slot' | 'pinball';

/** label 은 칩에, action 은 실행 버튼에 쓴다. "돌리기" 는 슬롯·핀볼에 안 맞는다. */
export const GAME_MODES: { id: GameMode; label: string; action: string }[] = [
  { id: 'wheel', label: '돌림판', action: '돌리기' },
  { id: 'ladder', label: '사다리', action: '사다리 타기' },
  { id: 'slot', label: '슬롯', action: '레버 당기기' },
  { id: 'pinball', label: '핀볼', action: '구슬 굴리기' },
];

export function actionLabel(mode: GameMode): string {
  return GAME_MODES.find((m) => m.id === mode)?.action ?? '돌리기';
}

/**
 * 모드마다 연출 길이가 다르다. 결과는 같다.
 *
 * 핀볼은 여기 없다 — 재생 길이를 컴포넌트가 직접 들고 있다(PLAY_MS).
 * 여기 적어두면 두 곳이 어긋날 수 있다.
 */
export const SPIN_MS: Record<Exclude<GameMode, 'pinball'>, number> = {
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
