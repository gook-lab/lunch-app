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
import { sfxLater, type SfxName } from '../../lib/sfx';

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

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 폭탄이 움직이지 않는다.
    setState({ run, seatIndex: startSeatRef.current, done: false });

    // 폭탄의 경로를 정한다.
    const hops = bombHops(count, startSeatRef.current, winnerIndex, seededRandom(run));
    if (hops.length === 0) {
      onSpinEnd();
      return;
    }

    // 각 홉마다 음성 효과를 정한다(틱 사운드).
    const sfxPlan: [number, SfxName, number | undefined][] = hops.slice(0, -1).map(({ delayMs }) => [
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
    hops.forEach(({ seat, delayMs }) => {
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

  // 좌표: 정사각형 판(360 고정, 화면 크기는 CSS). 가게 이름표가 식탁을 둘러앉고, 폭탄은 식탁 안쪽
  // 고리를 따라 그 사람 앞으로 옮겨 간다 — 이름 위에 얹으면 이름이 가려졌다.
  const boardSize = 360;
  const center = boardSize / 2;
  const seatR = 132; // 이름표 폭(최대 88)의 반을 더해도 판(360) 안에 들어오게
  const bombR = seatR - 44;
  const tagW = Math.max(40, Math.min(88, (2 * Math.PI * seatR) / count - 6));
  const tagH = count > 10 ? 24 : 30;
  // 자리 간격(2πr/n)에 들어가는 글자 수. 14곳에서 셋으로 자르니 "골목…" 처럼 두 글자만 남았다.
  const nameMax = count <= 8 ? 6 : count <= 12 ? 5 : count <= 16 ? 4 : 3;
  const at = (i: number, r: number) => {
    const a = (i / count) * 2 * Math.PI - Math.PI / 2; // 12시부터 시계 방향
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
  };
  const bombAt = at(currentSeat, bombR);

  const status =
    !live && !done
      ? '폭탄을 넘기면 한 바퀴씩 돌다가 한 곳에서 터져요'
      : done && winner
        ? `펑! ${shortName(winner.name, 10)}에서 터졌어요`
        : '폭탄이 돌고 있어요…';

  return (
    <div className={expanded ? 'bomb bomb--big' : 'bomb'}>
      <svg
        className="bomb__board"
        viewBox={`0 0 ${boardSize} ${boardSize}`}
        role="img"
        aria-label={`폭탄 돌리기 판, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
      >
        <circle cx={center} cy={center} r={bombR + 20} className="bomb__table" />
        {candidates.map((p, index) => {
          const { x, y } = at(index, seatR);
          const isCurrent = index === currentSeat && !done;
          const isWinner = done && index === winnerIndex;
          return (
            <g key={p.id} transform={`translate(${x} ${y})`}>
              <rect
                x={-tagW / 2}
                y={-tagH / 2}
                width={tagW}
                height={tagH}
                rx={tagH / 2}
                className={['bomb__seat', isCurrent ? 'bomb__seat--hot' : '', isWinner ? 'bomb__seat--win' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <title>{p.name}</title>
              </rect>
              <text textAnchor="middle" dominantBaseline="central" className={count > 10 ? 'bomb__name bomb__name--small' : 'bomb__name'}>
                {shortName(p.name, nameMax)}
              </text>
            </g>
          );
        })}

        {/* 폭탄. 자리를 옮길 때 짧게 미끄러지듯 넘어간다(CSS transition). */}
        <g className={done ? 'bomb__bomb bomb__bomb--exploding' : 'bomb__bomb'} style={{ transform: `translate(${bombAt.x}px, ${bombAt.y}px)` }}>
          <text textAnchor="middle" dominantBaseline="central" className="bomb__icon" aria-hidden="true">
            💣
          </text>
          {done && (
            <>
              <text textAnchor="middle" dominantBaseline="central" className="bomb__burst" aria-hidden="true">
                💥
              </text>
              <text y={-34} textAnchor="middle" className="bomb__pop" aria-hidden="true">
                펑!
              </text>
            </>
          )}
        </g>
      </svg>

      {/* 상태 텍스트. */}
      <p className="bomb__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
