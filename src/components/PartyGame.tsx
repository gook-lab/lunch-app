/**
 * 팟 게임 다시 보기 — 방장이 저장한 {mode, run, 후보, winnerIndex} 로 같은 연출을 이 기기에서 그린다.
 *
 * 당첨은 여기서 정하지 않는다(games/types.ts 의 계약). 게임은 후보·winnerIndex·run 이 같으면
 * 같은 장면을 그리므로, 모인 사람마다 따로 돌려도 다 같은 결과·같은 연출을 본다.
 * 앱의 게임 무대와 똑같이 "쉬는 판 → 다음 프레임에 시작" 순서로 띄운다.
 */
import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { Button } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import type { PartyGame as SavedGame } from '../services/types';
import {
  Archery,
  Balloon,
  Bomb,
  Bowling,
  CarRace,
  Claw,
  Curling,
  Dice,
  Fishing,
  Gacha,
  HorseRace,
  PaperPlane,
  Penalty,
  Plinko,
  Slot,
  Tournament,
  Treasure,
  Wheel,
} from './games';
import { GameBoundary } from './games/GameBoundary';
import { MODE_ICON, type GameMode, type GameProps } from './games/types';
import { modeLabel } from '../lib/party';
import { josa, withJosa } from '../lib/josa';

const GAMES: Partial<Record<GameMode, ComponentType<GameProps>>> = {
  archery: Archery,
  penalty: Penalty,
  bowling: Bowling,
  claw: Claw,
  treasure: Treasure,
  fishing: Fishing,
  curling: Curling,
  plane: PaperPlane,
  horse: HorseRace,
  racing: CarRace,
  bomb: Bomb,
  balloon: Balloon,
  plinko: Plinko,
  wheel: Wheel,
  slot: Slot,
  dice: Dice,
  gacha: Gacha,
  tournament: Tournament,
};

interface Props {
  game: SavedGame;
  board: Place[];
  /** 끝나면(또는 건너뛰면) 부른다 — 방장 화면은 이때 결과 문구를 띄운다. */
  onClose: () => void;
}

export function PartyGamePlayer({ game, board, onClose }: Props) {
  // 몇 번째 재생인가. 바뀌면 게임을 새로 세워 처음부터 같은 장면을 그린다.
  const [take, setTake] = useState(0);
  const [stage, setStage] = useState<'idle' | 'playing' | 'done'>('idle');
  useEffect(() => {
    if (stage !== 'idle') return;
    const t = window.setTimeout(() => setStage('playing'), 0);
    return () => window.clearTimeout(t);
  }, [stage, take]);
  const onSpinEnd = useCallback(() => setStage('done'), []);
  const Game = GAMES[game.mode as GameMode] ?? Wheel;
  const winner = game.names[game.winnerIndex];

  return (
    <div className="party-game">
      <p className="party-game__eyebrow">
        <span aria-hidden="true">{MODE_ICON[game.mode as GameMode] ?? '🎲'} </span>
        {withJosa(modeLabel(game.mode), '으로/로')} 뽑은 팟 점심
      </p>
      <div className="party-game__board">
        <GameBoundary resetKey={`${game.mode}|${game.run}|${take}`}>
          <Game
            key={take}
            candidates={board}
            winnerIndex={stage === 'idle' ? null : game.winnerIndex}
            spinning={stage === 'playing'}
            run={game.run}
            onSpinEnd={onSpinEnd}
          />
        </GameBoundary>
      </div>
      <p className="party-game__result" aria-live="polite">
        {stage === 'done' ? (
          <>
            <span aria-hidden="true">🎉 </span>
            <strong>{winner}</strong>
            {josa(winner, '으로/로')} 가요!
          </>
        ) : (
          ''
        )}
      </p>
      <div className="party-game__actions">
        {stage === 'done' ? (
          <Button
            variant="secondary"
            onClick={() => {
              setTake((n) => n + 1);
              setStage('idle');
            }}
          >
            다시 보기
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setStage('done')}>
            결과만 볼래요
          </Button>
        )}
        <Button onClick={onClose}>닫기</Button>
      </div>
    </div>
  );
}
