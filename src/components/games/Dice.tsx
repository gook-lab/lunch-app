/**
 * 주사위 말판 — 가게가 판 둘레 칸이 되고, 주사위를 굴려 말이 시계 방향으로 간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 말이 있는 칸에서 당첨 칸까지 거리를 1~6 눈으로
 * 나눠 마지막 눈에 정확히 도착하게 한다(lib/dice.ts). 말은 지난 판 자리에서 출발한다.
 * 가게는 둘레에 고르게 흩어 두고, 사이 빈 칸도 말이 한 칸씩 밟고 지나간다.
 *
 * 굴림마다: 주사위가 0.5초 구르고 → 0.55초에 눈이 서고 → 말이 한 칸에 180ms 씩 →
 * 다음 굴림까지 0.45초. 굴림은 많아야 6번이라 30초 상한 안에 끝난다.
 */
import { useEffect, useRef, useState } from 'react';
import { categoryHue, categoryIcon } from '../../lib/category';
import { MAX_ROLLS, boardSide, diceRolls, distanceTo, perimeterCell, placeCell, trackLength } from '../../lib/dice';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfx } from '../../lib/sfx';

const ROLL_MS = 550;
const STEP_MS = 180;
const GAP_MS = 450;

/** 굴림 목록의 연출 길이. */
export function diceDuration(rolls: number[]): number {
  return rolls.reduce((a, e) => a + ROLL_MS + e * STEP_MS + GAP_MS, 0);
}

interface View {
  run: number;
  pos: number;
  face: number;
  roll: number;
  rolling: boolean;
  done: boolean;
}

/** 주사위 눈 점 자리(3×3 격자 번호). */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function Dice({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const side = boardSide(count);
  const track = trackLength(count);
  // 말은 지난 판 자리에서 출발한다. 판(후보 구성)이 바뀌면 App 이 key 로 새로 만든다.
  const home = useRef(0);
  const [view, setView] = useState<View>({ run: -1, pos: 0, face: 1, roll: 0, rolling: false, done: false });

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const target = placeCell(winnerIndex, count);
    // 후보가 34곳 넘게 많아 둘레가 36칸을 넘으면 6번 굴림으로 못 닿을 수 있다 — 그땐 닿는 자리에서 출발한다.
    const reach = MAX_ROLLS * 6;
    let from = home.current % track;
    if (distanceTo(from, target, track) > reach) from = (((target - reach) % track) + track) % track;
    const rolls = diceRolls(distanceTo(from, target, track), seededRandom(run));
    const finish = () => {
      home.current = target;
      onSpinEnd();
    };
    if (prefersReducedMotion()) {
      setView({ run, pos: target, face: rolls[rolls.length - 1], roll: rolls.length, rolling: false, done: true });
      const t = window.setTimeout(finish, 0);
      return () => window.clearTimeout(t);
    }
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    let t = 0;
    let pos = from;
    setView({ run, pos, face: 1, roll: 0, rolling: false, done: false });
    rolls.forEach((eyes, i) => {
      const startPos = pos;
      at(t, () => {
        sfx('rattle');
        setView((v) => ({ ...v, roll: i + 1, rolling: true }));
      });
      at(t + ROLL_MS, () => {
        sfx('tap');
        setView((v) => ({ ...v, face: eyes, rolling: false }));
      });
      for (let s = 1; s <= eyes; s += 1) {
        at(t + ROLL_MS + s * STEP_MS, () => {
          sfx('step');
          setView((v) => ({ ...v, pos: (startPos + s) % track }));
        });
      }
      pos = (pos + eyes) % track;
      t += ROLL_MS + eyes * STEP_MS + GAP_MS;
    });
    at(t - GAP_MS + STEP_MS, () => setView((v) => ({ ...v, done: true })));
    at(t, finish);
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [spinning, winnerIndex, count, track, run, onSpinEnd]);

  if (count === 0) return <div className="dice dice--empty" />;

  const live = view.run === run;
  const pos = live ? view.pos : winnerIndex !== null && !spinning ? placeCell(winnerIndex, count) : 0;
  const done = live ? view.done : winnerIndex !== null && !spinning;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  /*
   * 칸에 들어가는 글자 수. 예전엔 5자로 고정이라 후보 2곳(2×2판) 크게 보기에서 칸이 250px
   * 넘게 남는데도 이름이 잘렸다(리뷰 재현). 판 폭(.dice 360 · .dice--big 520)을 칸 수로
   * 나눠 한글 한 자 약 13px 로 센다. 화면이 더 좁으면 CSS 말줄임이 마저 자른다.
   */
  const cellPx = (expanded ? 520 : 360) / side;
  const nameMax = Math.max(3, Math.min(12, Math.floor((cellPx - 10) / 13)));
  // 둘레 칸 → 그 칸의 가게 번호.
  const places = new Map(candidates.map((_, k) => [placeCell(k, count), k]));
  const status =
    !live && !done
      ? '주사위를 굴리면 말이 칸을 따라가요'
      : done && winner
        ? `${shortName(winner.name, 10)} 칸에 도착했어요`
        : view.rolling
          ? `${view.roll}번째 주사위를 굴리고 있어요…`
          : `${view.roll}번째 굴림 · ${view.face}칸 가요`;

  return (
    <div className={expanded ? 'dice dice--big' : 'dice'}>
      <div
        className="dice__board"
        style={{
          gridTemplateColumns: `repeat(${side}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${side}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: track }, (_, t) => {
          const cell = perimeterCell(t, side);
          const here = t === pos;
          const k = places.get(t);
          const p = k === undefined ? null : candidates[k];
          const style = { gridRow: cell.row, gridColumn: cell.col } as React.CSSProperties;
          if (!p) {
            return (
              <div
                key={`blank-${t}`}
                className={here ? 'dice__cell dice__cell--blank dice__cell--here' : 'dice__cell dice__cell--blank'}
                style={style}
              >
                {here && <span className="dice__pawn" aria-hidden="true" />}
              </div>
            );
          }
          const win = done && k === winnerIndex;
          return (
            <div
              key={p.id}
              className={['dice__cell', here ? 'dice__cell--here' : '', win ? 'dice__cell--win' : '']
                .filter(Boolean)
                .join(' ')}
              style={{ ...style, '--cat-hue': categoryHue(p.category) } as React.CSSProperties}
              title={p.name}
            >
              <span className="dice__num">{k! + 1}</span>
              <span className="dice__icon" aria-hidden="true">
                {categoryIcon(p.sub ?? p.category)}
              </span>
              <span className="dice__name">{shortName(p.name, nameMax)}</span>
              {here && <span className="dice__pawn" aria-hidden="true" />}
            </div>
          );
        })}
        <div className="dice__center" style={{ gridRow: `2 / ${side}`, gridColumn: `2 / ${side}` }}>
          <span className={live && view.rolling ? 'dice__die dice__die--rolling' : 'dice__die'} aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className={PIPS[live ? view.face : 1].includes(i) ? 'dice__pip dice__pip--on' : 'dice__pip'}
              />
            ))}
          </span>
          <p className="dice__status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
    </div>
  );
}
