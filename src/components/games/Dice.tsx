/**
 * 주사위 — 보드 둘레에 말을 이동시킨다.
 *
 * 말은 지난 판의 자리에서 출발하고, 1~6 눈으로 winnerIndex까지 도착한다.
 * 굴림마다 주사위가 회전하고 말이 한 칸씩 이동한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { boardSize, diceRolls, positions } from '../../lib/dice';
import { categoryHue, categoryIcon } from '../../lib/category';
import { shortName } from '../../lib/name';
import { prefersReducedMotion, type GameProps } from './types';

const ROLL_MS = 500; // 주사위 회전
const MOVE_DELAY = 550; // 회전 후 말 이동 시작
const MOVE_INTERVAL = 180; // 한 칸 이동
const ROLL_INTERVAL = 450; // 굴림 사이 대기

export function Dice({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const boardS = boardSize(count);
  const totalPlaces = boardS * 4; // 한 변 boardS, 4변 = 총 boardS*4칸

  // 지난 판의 자리 (같은 run 안에서만 유지).
  const [lastPos, setLastPos] = useState<number>(0);
  const prevRunRef = useRef<number>(-1);

  // 새 판: run이 바뀌면 지난 자리를 기억.
  useEffect(() => {
    if (run !== prevRunRef.current) {
      // 새 판이므로 지난 자리 갱신.
      prevRunRef.current = run;
    }
  }, [run]);

  const [phase, setPhase] = useState<'idle' | 'rolling' | 'moving' | 'done'>('idle');
  const [rollIndex, setRollIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [currentPos, setCurrentPos] = useState(lastPos);

  const rolls = useMemo(() => {
    if (winnerIndex === null || count === 0) return [];
    // 목표까지의 거리 (시계 방향).
    const distance = (winnerIndex - lastPos + totalPlaces) % totalPlaces;
    return diceRolls(distance === 0 ? totalPlaces : distance, totalPlaces);
  }, [winnerIndex, count, lastPos, totalPlaces]);

  const rollPositions = useMemo(() => {
    if (rolls.length === 0) return [];
    return positions(rolls, lastPos, totalPlaces);
  }, [rolls, lastPos, totalPlaces]);

  // 애니메이션 루프.
  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0 || rolls.length === 0) return;

    const reduced = prefersReducedMotion();
    if (reduced) {
      setCurrentPos(rollPositions[rollPositions.length - 1] ?? lastPos);
      onSpinEnd();
      return;
    }

    let rollTimer = 0;
    let moveTimer = 0;
    let rollLoopTimer = 0;

    const doRoll = (idx: number) => {
      if (idx >= rolls.length) {
        setPhase('done');
        setLastPos(rollPositions[rollPositions.length - 1] ?? lastPos);
        onSpinEnd();
        return;
      }

      setPhase('rolling');
      setRollIndex(idx);
      setElapsed(0);

      // 주사위 회전 애니메이션 (500ms).
      moveTimer = window.setTimeout(() => {
        setPhase('moving');
        // 말 이동 (180ms × 눈 개수).
        const eyes = rolls[idx];
        const moveCount = eyes;
        let moveStep = 0;

        const doMove = () => {
          moveStep += 1;
          setCurrentPos((p) => (p + 1) % totalPlaces);
          if (moveStep < moveCount) {
            moveTimer = window.setTimeout(doMove, MOVE_INTERVAL);
          } else {
            // 다음 굴림으로.
            rollLoopTimer = window.setTimeout(() => doRoll(idx + 1), ROLL_INTERVAL);
          }
        };

        doMove();
      }, ROLL_MS);
    };

    doRoll(0);

    return () => {
      window.clearTimeout(rollTimer);
      window.clearTimeout(moveTimer);
      window.clearTimeout(rollLoopTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, count, rolls, rollPositions, onSpinEnd]);

  if (count === 0) return <div className="dice dice--empty" />;

  // 보드 그리기: 시계 방향 (1~totalPlaces).
  const slots: { place: (typeof candidates)[0]; num: number; x: number; y: number }[] = [];
  let slotNum = 1;

  // 위쪽 (왼쪽 → 오른쪽).
  for (let i = 0; i < boardS; i += 1) {
    slots.push({
      place: candidates[slotNum - 1] ?? { id: '', name: '', category: 'korean', walkMin: 0 },
      num: slotNum,
      x: (i / boardS) * 100,
      y: 0,
    });
    slotNum += 1;
  }

  // 오른쪽 (위 → 아래).
  for (let i = 1; i < boardS; i += 1) {
    slots.push({
      place: candidates[slotNum - 1] ?? { id: '', name: '', category: 'korean', walkMin: 0 },
      num: slotNum,
      x: 100,
      y: (i / boardS) * 100,
    });
    slotNum += 1;
  }

  // 아래쪽 (오른쪽 → 왼쪽).
  for (let i = boardS - 2; i >= 0; i -= 1) {
    slots.push({
      place: candidates[slotNum - 1] ?? { id: '', name: '', category: 'korean', walkMin: 0 },
      num: slotNum,
      x: (i / boardS) * 100,
      y: 100,
    });
    slotNum += 1;
  }

  // 왼쪽 (아래 → 위).
  for (let i = boardS - 2; i > 0; i -= 1) {
    slots.push({
      place: candidates[slotNum - 1] ?? { id: '', name: '', category: 'korean', walkMin: 0 },
      num: slotNum,
      x: 0,
      y: (i / boardS) * 100,
    });
    slotNum += 1;
  }

  const diceRotation = phase === 'rolling' ? (elapsed / ROLL_MS) * 720 : 0;
  const diceEye = rollIndex < rolls.length ? rolls[rollIndex] : 0;

  return (
    <div className={expanded ? 'dice dice--big' : 'dice'}>
      <div className="dice__board">
        <svg width="100%" viewBox="0 0 320 320" className="dice__slots" preserveAspectRatio="xMidYMid slice">
          {slots.map((slot, i) => {
            const nextSlot = slots[(i + 1) % slots.length];
            const isWin = currentPos === i && phase === 'done';
            return (
              <g key={i}>
                <rect
                  x={`${slot.x}%`}
                  y={`${slot.y}%`}
                  width={`${100 / boardS}%`}
                  height={`${100 / boardS}%`}
                  fill={isWin ? 'var(--color-accent-100)' : 'var(--color-neutral-50)'}
                  stroke={isWin ? 'var(--color-accent-600)' : 'var(--color-neutral-300)'}
                  strokeWidth={isWin ? '2' : '1'}
                  className={isWin ? 'dice__slot dice__slot--win' : 'dice__slot'}
                />
                {slot.num <= count && (
                  <g>
                    <rect
                      x={`${slot.x}%`}
                      y={`${slot.y}%`}
                      width={`${100 / boardS}%`}
                      height="8%"
                      fill={`oklch(0.6 0.15 ${categoryHue(slot.place.category)})`}
                    />
                    <text
                      x={`${slot.x + 50 / boardS}%`}
                      y={`${slot.y + 16}%`}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="600"
                      fill="var(--color-neutral-900)"
                    >
                      {categoryIcon(slot.place.category)}
                    </text>
                    {boardS > 4 ? (
                      <text
                        x={`${slot.x + 50 / boardS}%`}
                        y={`${slot.y + 80 / boardS - 8}%`}
                        textAnchor="middle"
                        fontSize="8"
                        fontWeight="600"
                        fill="var(--color-neutral-700)"
                      >
                        {slot.num}
                      </text>
                    ) : (
                      <>
                        <text
                          x={`${slot.x + 50 / boardS}%`}
                          y={`${slot.y + 50 / boardS - 12}%`}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="600"
                          fill="var(--color-neutral-900)"
                        >
                          {shortName(slot.place.name, 4)}
                        </text>
                        <text
                          x={`${slot.x + 50 / boardS}%`}
                          y={`${slot.y + 80 / boardS - 8}%`}
                          textAnchor="middle"
                          fontSize="8"
                          fill="var(--color-neutral-700)"
                        >
                          {slot.num}
                        </text>
                      </>
                    )}
                  </g>
                )}
              </g>
            );
          })}

          {/* 말 */}
          {spinning && (
            <circle
              cx="50%"
              cy="50%"
              r="8"
              fill="var(--color-primary-600)"
              className="dice__pawn"
              style={{ transform: `translate(calc(${slots[currentPos]?.x ?? 0}% + ${100 / boardS / 2}%), calc(${slots[currentPos]?.y ?? 0}% + ${100 / boardS / 2}%))` }}
            />
          )}
        </svg>
      </div>

      {/* 주사위 + 상태 글 */}
      <div className="dice__center">
        <div className="dice__dice" style={{ transform: `rotateX(${diceRotation * 0.5}deg) rotateY(${diceRotation}deg)` }}>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i + 1} className={`dice__face dice__face--${i + 1}`}>
              {i + 1}
            </div>
          ))}
        </div>
        {phase !== 'idle' && (
          <div className="dice__status">
            {rollIndex + 1}번째 굴림 · {diceEye}
          </div>
        )}
      </div>
    </div>
  );
}
