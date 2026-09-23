/**
 * 돌림판.
 *
 * 결과를 정하는 것은 이 컴포넌트가 아니다 — 호출하는 쪽이 당첨 index 를 넘기고,
 * 여기서는 그 칸이 바늘에 오도록 회전만 한다. 애니메이션이 결과를 정하면
 * 나중에 "왜 어제 간 데가 또 나왔지" 를 추적할 수 없다.
 */
import { useEffect, useRef, useState } from 'react';
import type { Place } from '../lib/candidates';

const TURNS = 4;
const SPIN_MS = 2600;

interface Props {
  candidates: Place[];
  /** null 이면 아직 안 돌린 상태. */
  winnerIndex: number | null;
  spinning: boolean;
  onSpinEnd: () => void;
}

export function Wheel({ candidates, winnerIndex, spinning, onSpinEnd }: Props) {
  const [angle, setAngle] = useState(0);
  const turns = useRef(0);

  useEffect(() => {
    if (!spinning || winnerIndex === null || candidates.length === 0) return;

    const slice = 360 / candidates.length;
    // 바늘은 12시 방향. 당첨 칸의 가운데가 거기 오게 돌린다.
    const target = 360 - (winnerIndex * slice + slice / 2);
    turns.current += TURNS;
    setAngle(turns.current * 360 + target);

    const timer = window.setTimeout(onSpinEnd, SPIN_MS);
    return () => window.clearTimeout(timer);
  }, [spinning, winnerIndex, candidates.length, onSpinEnd]);

  const slice = candidates.length > 0 ? 360 / candidates.length : 360;

  return (
    <div className="wheel">
      <div className="wheel__needle" aria-hidden="true" />
      <div
        className="wheel__disc"
        style={{
          transform: `rotate(${angle}deg)`,
          transitionDuration: spinning ? `${SPIN_MS}ms` : '0ms',
        }}
        role="img"
        aria-label={`후보 ${candidates.length}곳`}
      >
        {candidates.map((place, i) => (
          <div
            key={place.id}
            className="wheel__slice"
            style={{
              transform: `rotate(${i * slice + slice / 2}deg)`,
              opacity: i % 2 === 0 ? 1 : 0.78,
            }}
          >
            <span className="wheel__label">{place.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
