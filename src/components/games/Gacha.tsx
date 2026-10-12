/**
 * 뽑기 기계 — 캡슐이 흔들리다가 하나 떨어진다.
 *
 * 당첨은 winnerIndex 가 정한다. 돔 안 캡슐은 서로 구별되지 않으므로
 * 어느 것이 떨어지든 공정하다 — 당첨 가게의 캡슐이 떨어진다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryIcon, categoryHue } from '../../lib/category';
import { shortName } from '../../lib/name';
import { prefersReducedMotion, type GameProps } from './types';

const SHAKE_MS = 2200;
const SHAKE_INTERVAL = 180;
const RISE_MS = 300;
const OPEN_DELAY = 500; // 떨어진 후 열릴 때까지 대기
const MAX_CAPSULES = 20;

/**
 * 흔들림 오프셋. 180ms 간격으로 랜덤 거리 (1~6px).
 */
function shakeOffset(ms: number): number {
  const cycle = Math.floor(ms / SHAKE_INTERVAL);
  const hash = Math.sin(cycle * 12.9898 + 78.233) * 43758.5453;
  return (hash - Math.floor(hash)) * 5 + 1; // 1~6px
}

export function Gacha({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const displayCount = Math.min(count, MAX_CAPSULES);
  const overflowCount = Math.max(0, count - MAX_CAPSULES);

  const [phase, setPhase] = useState<'idle' | 'shaking' | 'rising' | 'opening' | 'done'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const rafRef = useRef<number>();

  // 애니메이션 루프.
  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    const reduced = prefersReducedMotion();
    const t0 = performance.now();
    let animEndTime = 0;

    const loop = (now: number) => {
      const elapsed = now - t0;

      if (phase === 'idle') {
        setPhase('shaking');
        return;
      }

      if (phase === 'shaking') {
        setElapsed(elapsed);
        if (elapsed >= SHAKE_MS) {
          setPhase('rising');
          animEndTime = now;
        } else {
          rafRef.current = requestAnimationFrame(loop);
        }
        return;
      }

      if (phase === 'rising') {
        const elapsed2 = now - animEndTime;
        setElapsed(elapsed2);
        if (elapsed2 >= RISE_MS) {
          setPhase('opening');
          if (reduced) {
            onSpinEnd();
            return;
          }
          window.setTimeout(() => {
            setPhase('done');
          }, OPEN_DELAY);
        } else {
          rafRef.current = requestAnimationFrame(loop);
        }
        return;
      }

      if (phase === 'opening') {
        setElapsed(now - animEndTime - RISE_MS);
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      if (phase === 'done') {
        onSpinEnd();
      }
    };

    if (reduced) {
      setPhase('done');
      onSpinEnd();
      return;
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, count, onSpinEnd, phase]);

  if (count === 0) return <div className="gacha gacha--empty" />;

  const capsuleSize = 48;
  const domeRadius = displayCount <= 6 ? 60 : displayCount <= 12 ? 80 : 100;

  // 캡슐 배치: 원형 배열.
  const capsules = useMemo(() => {
    const arr: { place: (typeof candidates)[0]; angle: number }[] = [];
    for (let i = 0; i < displayCount; i += 1) {
      const angle = (i / displayCount) * Math.PI * 2;
      arr.push({ place: candidates[i], angle });
    }
    return arr;
  }, [displayCount, candidates]);

  const winner = winnerIndex >= 0 && winnerIndex < count ? candidates[winnerIndex] : null;
  const shake = phase === 'shaking' ? shakeOffset(elapsed) : 0;
  const riseProgress = phase === 'rising' ? Math.min(1, elapsed / RISE_MS) : phase === 'opening' ? 1 : 0;

  return (
    <div className={expanded ? 'gacha gacha--big' : 'gacha'}>
      <div className="gacha__dome" style={{ transform: `rotate(${(elapsed / SHAKE_MS) * 360 * 2}deg)` }}>
        {capsules.map((item, i) => {
          const x = Math.cos(item.angle) * domeRadius;
          const y = Math.sin(item.angle) * domeRadius;
          const isWinner = winnerIndex === i;
          return (
            <div
              key={item.place.id}
              className={isWinner && phase !== 'idle' ? 'gacha__capsule gacha__capsule--falling' : 'gacha__capsule'}
              style={{
                left: `calc(50% + ${x}px)`,
                top: `calc(50% + ${y}px)`,
                transform: `translate(-50%, -50%) translateY(${isWinner && phase !== 'idle' ? riseProgress * 80 : shake}px)`,
              }}
            >
              <div className="gacha__capsule-half gacha__capsule-half--color" style={{ background: `oklch(0.7 0.15 ${categoryHue(item.place.category)})` }} />
              <div className="gacha__capsule-half gacha__capsule-half--white" />
            </div>
          );
        })}
      </div>

      {overflowCount > 0 && (
        <div className="gacha__overflow">
          …외 {overflowCount}개
        </div>
      )}

      {phase === 'opening' && winner && (
        <div className="gacha__result">
          <div className="gacha__chip">
            <span className="gacha__icon">{categoryIcon(winner.category)}</span>
            <strong>{shortName(winner.name, 10)}</strong>
            <span className="gacha__walk">도보 {winner.walkMin}분</span>
          </div>
        </div>
      )}
    </div>
  );
}
