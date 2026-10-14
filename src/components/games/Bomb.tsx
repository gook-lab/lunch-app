/**
 * 폭탄 돌리기 — 폭탄이 자리를 따라 시계 방향으로 돈다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 폭탄이 자리마다 머물면서 다음 자리로
 * 넘어가고, 당첨 자리에서 터진다(💥 + "펑!" 텍스트). lib/bomb.ts 가 각
 * 자리의 머무름 시간을 정해 총 연출 길이를 조절한다.
 */
import { useEffect, useRef, useState } from 'react';
import { shortName } from '../../lib/name';
import { bombHops } from '../../lib/bomb';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfx, sfxLater, type SfxName } from '../../lib/sfx';

interface BombState {
  run: number;
  seatIndex: number;
  done: boolean;
}

export function Bomb({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const startSeatRef = useRef(0);
  const [state, setState] = useState<BombState>({ run: -1, seatIndex: 0, done: false });

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion()) {
      setState({ run, seatIndex: winnerIndex, done: true });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 폭탄의 경로를 정한다.
    const hops = bombHops(count, startSeatRef.current, winnerIndex, seededRandom(run));
    if (hops.length === 0) {
      onSpinEnd();
      return;
    }

    // 각 홉마다 음성 효과를 정한다(틱 사운드).
    const sfxPlan: [number, SfxName, number | undefined][] = hops.slice(0, -1).map(({ delayMs }, i) => [
      delayMs,
      'tick',
      undefined,
    ]);
    // 마지막 홉 직전에 "크래시" 음성(터진다).
    const lastHop = hops[hops.length - 1];
    sfxPlan.push([lastHop.delayMs - 100, 'crash', undefined]);

    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    // 각 홉에서 폭탄 위치를 업데이트한다.
    hops.forEach(({ seat, delayMs }, i) => {
      at(delayMs, () => {
        setState((s) => (s.run === run ? { ...s, seatIndex: seat } : s));
      });
    });

    // 마지막 홉: 폭탄이 터진다.
    const finish = () => {
      setState((s) => (s.run === run ? { ...s, done: true } : s));
      startSeatRef.current = winnerIndex;
      const t = window.setTimeout(onSpinEnd, 500); // 폭탄 폭발 애니메이션 후.
      timers.push(t);
    };
    at(lastHop.delayMs + 100, finish);

    // 음성 효과를 계획한다.
    const stopSfx = sfxLater(sfxPlan);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="bomb bomb--empty" />;

  const live = state.run === run;
  const currentSeat = live ? state.seatIndex : winnerIndex !== null && !spinning ? winnerIndex : 0;
  const done = live ? state.done : winnerIndex !== null && !spinning;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];

  // 좌표 계산: 정사각형 보드, 자리를 원형으로 배치.
  const boardSize = Math.min(360, Math.max(1, count) * 30);
  const seats: Array<{ index: number; x: number; y: number; angle: number }> = [];
  const center = boardSize / 2;
  const radius = boardSize / 2 - 40; // 여유.

  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2; // 12시부터 시작.
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    seats.push({ index: i, x, y, angle });
  }

  const isSmall = count > 10;
  const status =
    !live && !done
      ? '폭탄을 넘기면서 게임이 시작돼요'
      : done && winner
        ? `펑! ${shortName(winner.name, 10)}에서 터졌어요`
        : '폭탄이 돌고 있어요…';

  return (
    <div className={expanded ? 'bomb bomb--big' : 'bomb'}>
      <svg
        className="bomb__board"
        viewBox={`0 0 ${boardSize} ${boardSize}`}
        width={boardSize}
        height={boardSize}
        role="img"
        aria-label={`${count}개 자리가 원형으로 앉아 있어요. ${Array.from({ length: Math.min(5, count) })
          .map((_, i) => candidates[i]?.name ?? '')
          .join(', ')}${count > 5 ? ` 등 ${count}곳` : ''}`}
      >
        {/* 자리들. */}
        {seats.map(({ index, x, y }) => {
          const p = candidates[index];
          const isCurrent = index === currentSeat;
          const isWinner = done && index === winnerIndex;
          return (
            <g key={p.id}>
              {/* 자리 배경. */}
              <circle
                cx={x}
                cy={y}
                r={20}
                className={['bomb__seat', isCurrent ? 'bomb__seat--hot' : '', isWinner ? 'bomb__seat--win' : '']
                  .filter(Boolean)
                  .join(' ')}
                title={p.name}
              />
              {/* 이름. */}
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="middle"
                className={isSmall ? 'bomb__name bomb__name--small' : 'bomb__name'}
              >
                {shortName(p.name, isSmall ? 3 : 6)}
              </text>
            </g>
          );
        })}

        {/* 폭탄. */}
        {seats.length > 0 && seats[currentSeat] && (
          <g className={done ? 'bomb__bomb bomb__bomb--exploding' : 'bomb__bomb'}>
            <text
              x={seats[currentSeat].x}
              y={seats[currentSeat].y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="bomb__icon"
              aria-hidden="true"
            >
              💣
            </text>
            {done && (
              <text
                x={seats[currentSeat].x}
                y={seats[currentSeat].y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="bomb__burst"
                aria-hidden="true"
              >
                💥
              </text>
            )}
          </g>
        )}
      </svg>

      {/* 상태 텍스트. */}
      <p className="bomb__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
