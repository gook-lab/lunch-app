import { ballCountsFor } from '../lib/weights';
import {
  Archery,
  Balloon,
  Bomb,
  Bowling,
  Cards,
  CarRace,
  Claw,
  Curling,
  Dice,
  Fishing,
  Gacha,
  HorseRace,
  Ladder,
  Memory,
  Penalty,
  PaperPlane,
  Pinball,
  Plinko,
  Slot,
  Tournament,
  Treasure,
  Wheel,
} from './games';
import type { GameMode, GameProps } from './games/types';

interface GameStageProps {
  mode: GameMode;
  game: Omit<GameProps, 'onRequestSpin' | 'onActivity'>;
  /** 돌린 순간 얼린 핀볼 공 개수. 판이 없으면 null 이고 지금 설정으로 그린다. */
  frozenBalls: number[] | null;
  ballCounts: Record<string, number>;
  onRequestSpin: () => void;
  onActivity: () => void;
  onBallCounts: (update: (prev: Record<string, number>) => Record<string, number>) => void;
}

export function GameStage({
  mode,
  game,
  frozenBalls,
  ballCounts,
  onRequestSpin,
  onActivity,
  onBallCounts,
}: GameStageProps) {
  const candidateKey = game.candidates.map((p) => p.id).join(',');
  // 사다리는 사용자가 판을 고친다. 후보 구성이 바뀌면 새 판이어야 하므로
  // 후보 id 를 key 로 준다. 돌린 순간 얼리는 board 는 같은 id 라 판이 유지된다.
  if (mode === 'ladder') return <Ladder key={candidateKey} {...game} onRequestSpin={onRequestSpin} />;
  if (mode === 'cards') return <Cards key={candidateKey} {...game} onRequestSpin={onRequestSpin} />;
  if (mode === 'memory') return <Memory key={candidateKey} {...game} onRequestSpin={onRequestSpin} onActivity={onActivity} />;
  // 응원 고른 것은 같은 후보 구성 안에서만 유지한다.
  if (mode === 'tournament') return <Tournament key={candidateKey} {...game} />;
  if (mode === 'slot') return <Slot {...game} />;
  if (mode === 'pinball') {
    const balls = frozenBalls ?? ballCountsFor(game.candidates.map((p) => p.id), ballCounts);
    return <Pinball {...game} balls={balls} onBallCounts={onBallCounts} />;
  }
  if (mode === 'gacha') return <Gacha {...game} />;
  if (mode === 'plinko') return <Plinko {...game} />;
  if (mode === 'horse') return <HorseRace {...game} />;
  if (mode === 'racing') return <CarRace {...game} />;
  // 주사위도 폭탄도 "지난 판 자리" 에서 출발한다. 후보 구성이 바뀌면 그 자리는
  // 다른 가게(또는 없는 자리)라 새로 시작한다.
  if (mode === 'dice') return <Dice key={candidateKey} {...game} />;
  if (mode === 'bomb') return <Bomb key={candidateKey} {...game} />;
  if (mode === 'balloon') return <Balloon {...game} />;
  if (mode === 'fishing') return <Fishing {...game} />;
  if (mode === 'archery') return <Archery {...game} />;
  if (mode === 'curling') return <Curling {...game} />;
  if (mode === 'plane') return <PaperPlane {...game} />;
  if (mode === 'treasure') return <Treasure {...game} />;
  if (mode === 'claw') return <Claw {...game} />;
  if (mode === 'penalty') return <Penalty {...game} />;
  if (mode === 'bowling') return <Bowling {...game} />;
  return <Wheel {...game} />;
}
