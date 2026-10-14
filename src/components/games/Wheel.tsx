/**
 * 돌림판.
 *
 * 읽기 문제를 두 가지로 나눠 푼다.
 *  - 칸 이름: 반지름 방향으로 눕히되 화면 아래쪽 절반은 180도 돌려 거꾸로
 *    읽히지 않게. 판정은 원판 회전까지 넣은 화면 각도로 한다.
 *    그래도 돌아가는 동안에는 읽기 어렵다.
 *  - 그래서 멈춘 뒤에는 **가운데 원에 당첨 이름을 크게** 띄운다. 결과를 읽는 건
 *    이쪽이고, 칸 라벨은 "어디에 걸렸는지" 를 보여주는 역할만 한다.
 *
 * 칸 경계는 conic-gradient 와 바큇살 선을 같이 쓴다. 인접한 두 톤이 비슷할 때
 * gradient 만으로는 경계가 안 보인다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { wheelAngle, wheelLabelFlipped } from '../../lib/spin';
import { shortName } from '../../lib/name';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { followTicks, readRotation } from '../../lib/sfx';

const TURNS = 4;

/** 이 수를 넘는 후보 수부터 라벨을 바퀴살 방향(세로)으로 쓴다. */
export const RADIAL_FROM = 8;

export function Wheel({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const [angle, setAngle] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const turns = useRef(0);
  const discRef = useRef<HTMLDivElement>(null);
  const count = candidates.length;
  const slice = count > 0 ? 360 / count : 360;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    setLanded(null);

    // 바늘은 12시 방향. 당첨 칸의 가운데가 거기 오도록 돌린다 (lib/spin.ts).
    const reduced = prefersReducedMotion();
    turns.current += reduced ? 0 : TURNS;
    setAngle(wheelAngle(winnerIndex, count, turns.current));

    // 칸 경계가 바늘을 지날 때마다 딸깍 — 원판의 실제 각도를 따라가므로 점점 느려진다.
    const stopTicks = reduced ? () => {} : followTicks(discRef.current, readRotation, slice, SPIN_MS.wheel);
    const timer = window.setTimeout(
      () => {
        setLanded(winnerIndex);
        onSpinEnd();
      },
      reduced ? 0 : SPIN_MS.wheel,
    );
    return () => {
      window.clearTimeout(timer);
      stopTicks();
    };
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

  // 칸이 많으면 테두리를 따라 눕힌 라벨이 서로 겹친다. 20칸이면 칸 하나의
  // 테두리 호가 43px 인데 라벨은 78px 까지 간다(실측). 그때는 글자를
  // 바퀴살 방향으로 세워 쓴다. 거꾸로 판정(wheelLabelFlipped)은 그대로
  // 쓴다 — 글자가 뒤집히는 조건은 눕히든 세우든 같은 반원이다.
  const radial = count > RADIAL_FROM;

  return (
    <div className={radial ? 'wheel wheel--radial' : 'wheel'}>
      {/* 멈추는 순간 바늘이 칸 끝에 걸렸다 풀리듯 흔들린다. key 로 판마다 다시 튼다. */}
      <div
        key={landed === null ? 'idle' : `landed-${angle}`}
        className={landed === null ? 'wheel__needle' : 'wheel__needle wheel__needle--landed'}
        aria-hidden="true"
      />

      <div
        ref={discRef}
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
          // 지금 원판이 돌아간 만큼까지 넣어서 판단한다 (lib/spin.ts).
          const upsideDown = wheelLabelFlipped(i, count, angle);
          return (
            <div key={place.id} className="wheel__slice" style={{ transform: `rotate(${mid}deg)` }} aria-hidden="true">
              <span className={`wheel__label${upsideDown ? ' wheel__label--flip' : ''}`} title={place.name}>
                {shortName(place.name, radial ? 6 : 12)}
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
