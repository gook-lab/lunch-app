/**
 * 돌림판.
 *
 * 읽기 문제를 두 가지로 나눠 푼다.
 *  - 칸 이름: 반지름 방향으로 눕히되 아래쪽 절반은 180도 돌려 거꾸로 읽히지 않게.
 *    그래도 돌아가는 동안에는 읽기 어렵다.
 *  - 그래서 멈춘 뒤에는 **가운데 원에 당첨 이름을 크게** 띄운다. 결과를 읽는 건
 *    이쪽이고, 칸 라벨은 "어디에 걸렸는지" 를 보여주는 역할만 한다.
 *
 * 칸 경계는 conic-gradient 와 바큇살 선을 같이 쓴다. 인접한 두 톤이 비슷할 때
 * gradient 만으로는 경계가 안 보인다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { wheelAngle } from '../../lib/spin';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const TURNS = 4;

export function Wheel({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const [angle, setAngle] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const turns = useRef(0);
  const count = candidates.length;
  const slice = count > 0 ? 360 / count : 360;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    setLanded(null);

    // 바늘은 12시 방향. 당첨 칸의 가운데가 거기 오도록 돌린다 (lib/spin.ts).
    const reduced = prefersReducedMotion();
    turns.current += reduced ? 0 : TURNS;
    setAngle(wheelAngle(winnerIndex, count, turns.current));

    const timer = window.setTimeout(() => {
      setLanded(winnerIndex);
      onSpinEnd();
    }, reduced ? 0 : SPIN_MS.wheel);
    return () => window.clearTimeout(timer);
  }, [spinning, winnerIndex, count, slice, onSpinEnd]);

  const background = useMemo(() => {
    if (count === 0) return 'transparent';
    const stops = candidates.map((_, i) => {
      const from = i * slice;
      const to = (i + 1) * slice;
      const tone = i % 2 === 0 ? 'var(--wheel-a)' : 'var(--wheel-b)';
      return `${tone} ${from}deg ${to}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [candidates, count, slice]);

  const winner = landed !== null ? (candidates[landed] ?? null) : null;

  return (
    <div className="wheel">
      <div className="wheel__needle" aria-hidden="true" />

      <div
        className="wheel__disc"
        style={{
          background,
          transform: `rotate(${angle}deg)`,
          transitionDuration: spinning && !prefersReducedMotion() ? `${SPIN_MS.wheel}ms` : '0ms',
        }}
        role="img"
        aria-label={`후보 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
      >
        {candidates.map((place, i) => (
          <span
            key={`spoke-${place.id}`}
            className="wheel__spoke"
            style={{ transform: `rotate(${i * slice}deg)` }}
            aria-hidden="true"
          />
        ))}

        {candidates.map((place, i) => {
          const mid = i * slice + slice / 2;
          const upsideDown = mid > 90 && mid < 270;
          return (
            <div key={place.id} className="wheel__slice" style={{ transform: `rotate(${mid}deg)` }}>
              <span className={`wheel__label${upsideDown ? ' wheel__label--flip' : ''}`}>
                {place.name}
              </span>
            </div>
          );
        })}
      </div>

      {winner && (
        <div className="wheel__center">
          <strong>{winner.name}</strong>
          <span>도보 {winner.walkMin}분</span>
        </div>
      )}
    </div>
  );
}
