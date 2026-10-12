/**
 * 플링코 — 공 하나가 핀을 맞히며 내려와 칸에 도착한다.
 *
 * 경로는 lib/plinko.ts 가 정한다. 핀마다 공이 작게 튀며 내려가고,
 * 부딪힌 핀은 강조색으로 커진다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPath, tracePath, pinsForRow } from '../../lib/plinko';
import { categoryHue, categoryIcon } from '../../lib/category';
import { shortName } from '../../lib/name';
import { prefersReducedMotion, type GameProps } from './types';

const FALL_MS = 170; // 한 칸당 약 170ms
const BOUNCE_HEIGHT = 6; // px

export function Plinko({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [elapsed, setElapsed] = useState(0);
  const [hitPins, setHitPins] = useState<Set<string>>(new Set());
  const rafRef = useRef<number>();

  const path = useMemo(
    () => (winnerIndex !== null && count > 0 ? createPath(winnerIndex, count - 1) : []),
    [winnerIndex, count],
  );

  // 여기선 run이 아니라 winnerIndex로 경로를 생성한다. run은 필요 없음.
  const trace = useMemo(() => {
    const w = 280; // 판 폭
    const ps = 40; // 핀 간격
    return tracePath(path, w, ps);
  }, [path]);

  // 애니메이션 타이밍
  const totalMs = (count - 1) * FALL_MS;

  // 부딪힌 핀 계산.
  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion()) {
      setElapsed(totalMs);
      setHitPins(new Set()); // 모션 없으면 핀 강조 제거
      onSpinEnd();
      return;
    }

    const t0 = performance.now();
    const loop = (now: number) => {
      const e = now - t0;
      setElapsed(Math.min(e, totalMs));

      // 지금까지 지난 행(핀)을 계산 — 부딪친 핀 표시.
      const row = Math.floor(e / FALL_MS);
      if (row < count - 1) {
        const pins = new Set<string>();
        for (let r = 0; r <= row; r += 1) {
          // 행 r의 핀 중 공이 맞힌 핀. trace[r+1].x로부터 가장 가까운 핀.
          const closestPin = pinsForRow(r, 280, 40).reduce((best, pin, idx) => {
            const dx = Math.abs(pin.x - trace[r + 1].x);
            if (best === null || dx < Math.abs(best.pin.x - trace[r + 1].x)) {
              return { idx, pin };
            }
            return best;
          }, null as { idx: number; pin: { x: number; y: number; r: number } } | null);

          if (closestPin) pins.add(`${r}-${closestPin.idx}`);
        }
        setHitPins(pins);
      }

      if (e < totalMs) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        onSpinEnd();
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, count, onSpinEnd, path, trace]);

  if (count === 0) return <div className="plinko plinko--empty" />;

  const boardW = 280;
  const pinSpacing = 40;
  const ballProgress = Math.min(1, elapsed / totalMs);
  const ballFrame = Math.floor(ballProgress * (count - 1));
  const ballIntraFrame = (ballProgress * (count - 1)) - ballFrame;

  // 공의 위치 (보간).
  const ballPos = trace[Math.min(ballFrame, trace.length - 1)];
  const nextBallPos = trace[Math.min(ballFrame + 1, trace.length - 1)];
  const ballX = ballPos.x + (nextBallPos.x - ballPos.x) * ballIntraFrame;
  const ballY = ballPos.y + (nextBallPos.y - ballPos.y) * ballIntraFrame;

  // 공이 아직 떨어지는 중이면 튕기는 효과.
  const bouncePhase = (ballProgress * (count - 1) * 2) % 1;
  const bounceY = Math.abs(Math.sin(bouncePhase * Math.PI)) * BOUNCE_HEIGHT;

  return (
    <div className={expanded ? 'plinko plinko--big' : 'plinko'}>
      <svg width={boardW} height={boardW} viewBox={`0 0 ${boardW} ${boardW * 1.2}`} className="plinko__board">
        {/* 핀 그리기 */}
        {Array.from({ length: count - 1 }, (_, r) => {
          const pins = pinsForRow(r, boardW, pinSpacing);
          return pins.map((pin, idx) => {
            const isHit = hitPins.has(`${r}-${idx}`);
            const scale = isHit ? 1.4 : 1;
            return (
              <circle
                key={`${r}-${idx}`}
                cx={pin.x}
                cy={pin.y}
                r={pin.r * scale}
                fill="var(--color-neutral-900)"
                opacity={isHit ? 0.8 : 0.3}
                className={isHit ? 'plinko__pin plinko__pin--hit' : 'plinko__pin'}
              />
            );
          });
        })}

        {/* 공 */}
        {spinning && (
          <circle
            cx={ballX}
            cy={ballY + bounceY}
            r={5}
            fill="var(--color-accent-600)"
            className="plinko__ball"
          />
        )}

        {/* 도착 칸 */}
        {winnerIndex !== null && (
          <>
            {Array.from({ length: count }, (_, i) => {
              const x = (boardW / count) * (i + 0.5);
              const y = (count - 1) * pinSpacing + pinSpacing;
              const isWin = i === winnerIndex;
              return (
                <g key={`slot-${i}`} className={isWin ? 'plinko__slot plinko__slot--win' : 'plinko__slot'}>
                  <rect
                    x={x - boardW / count / 2 + 2}
                    y={y}
                    width={boardW / count - 4}
                    height={30}
                    fill={isWin ? 'var(--color-accent-100)' : 'var(--color-neutral-50)'}
                    stroke={isWin ? 'var(--color-accent-600)' : 'var(--color-neutral-200)'}
                    strokeWidth={isWin ? 2 : 1}
                  />
                  <rect
                    x={x - boardW / count / 2 + 2}
                    y={y - 4}
                    width={boardW / count - 4}
                    height={4}
                    fill={`oklch(0.6 0.15 ${categoryHue(candidates[i]?.category ?? 'korean')})`}
                  />
                  {isWin && candidates[i] && (
                    <text
                      x={x}
                      y={y + 15}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="var(--color-accent-700)"
                    >
                      {shortName(candidates[i].name, 6)}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        )}
      </svg>

      {spinning === false && winnerIndex !== null && candidates[winnerIndex] && (
        <div className="plinko__result">
          <div className="plinko__chip">
            <span className="plinko__icon">{categoryIcon(candidates[winnerIndex].category)}</span>
            <strong>{shortName(candidates[winnerIndex].name, 10)}</strong>
            <span className="plinko__walk">도보 {candidates[winnerIndex].walkMin}분</span>
          </div>
        </div>
      )}
    </div>
  );
}
