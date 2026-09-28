/**
 * 돌림판.
 *
 * 칸 경계는 conic-gradient 로 그린다 — 경계가 안 보이면 몇 칸인지 알 수 없어
 * "공정하게 돌았다" 는 느낌 자체가 안 난다.
 *
 * 라벨은 반지름 방향으로 눕히되, 아래쪽 절반(90~270도)은 180도 더 돌려서
 * 거꾸로 읽히지 않게 한다. 이걸 안 하면 아래 칸 이름이 뒤집혀 못 읽는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const TURNS = 4;

export function Wheel({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const [angle, setAngle] = useState(0);
  const turns = useRef(0);
  const count = candidates.length;
  const slice = count > 0 ? 360 / count : 360;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    // 바늘은 12시 방향. 당첨 칸의 가운데가 거기 오도록 돌린다.
    const target = 360 - (winnerIndex * slice + slice / 2);
    const reduced = prefersReducedMotion();
    turns.current += reduced ? 0 : TURNS;
    setAngle(turns.current * 360 + target);

    const timer = window.setTimeout(onSpinEnd, reduced ? 0 : SPIN_MS.wheel);
    return () => window.clearTimeout(timer);
  }, [spinning, winnerIndex, count, slice, onSpinEnd]);

  const background = useMemo(() => {
    if (count === 0) return 'transparent';
    const stops = candidates.map((_, i) => {
      const from = i * slice;
      const to = (i + 1) * slice;
      // 두 톤을 번갈아 — 칸 수가 홀수여도 이웃끼리는 거의 항상 다르다.
      const tone = i % 2 === 0 ? 'var(--wheel-a)' : 'var(--wheel-b)';
      return `${tone} ${from}deg ${to}deg`;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [candidates, count, slice]);

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
        {candidates.map((place, i) => {
          const mid = i * slice + slice / 2;
          // 아래쪽 절반은 글자를 뒤집어야 읽힌다.
          const upsideDown = mid > 90 && mid < 270;
          return (
            <div
              key={place.id}
              className="wheel__slice"
              style={{ transform: `rotate(${mid}deg)` }}
            >
              <span
                className={`wheel__label${upsideDown ? ' wheel__label--flip' : ''}`}
                style={{ maxWidth: count > 6 ? '5.5em' : '7em' }}
              >
                {place.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
