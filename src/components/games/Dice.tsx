/**
 * 주사위 말판 — 가게가 판 둘레 칸이 되고, 주사위를 굴려 말이 시계 방향으로 간다.
 *
 * 한 판: 판 위에 펠트 상자가 깔리고 컵이 달그락달그락 흔들리다 쾅 엎어진다 → 주사위 여러 개가 벽에
 * 튕기며 데구르르 → (사건) 하나가 모서리로 서서 "설까 말까…" · 먼저 멈춘 주사위를 뒤에 온 주사위가
 * 툭 쳐서 뒤집음 → 마지막 주사위는 슬로모션으로 멈춘다 → 눈의 합 → 펠트가 걷히고 말이 한 칸씩 간다
 * → 당첨 칸에 스포트라이트. 일정·사건은 판 번호 시드로 lib/dice.ts 가 정한다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 말이 있는 칸에서 당첨 칸까지 거리를 주사위 눈으로 나눠
 * 합이 정확히 그 거리가 되게 한다(lib/dice.ts dicePlan). 모서리·부딪힘에서 잠깐 보이는 가짜 눈은
 * 합에 들어가지 않는다 — 사건은 당첨을 바꾸지 않는다. 말은 지난 판 자리에서 출발한다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryHue, categoryIcon } from '../../lib/category';
import {
  boardSide,
  dieAt,
  dicePhase,
  dicePlan,
  pawnAt,
  perimeterCell,
  placeCell,
  throwFrom,
  trackLength,
  type DicePlan,
} from '../../lib/dice';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { ladderDiceSfxLater, type LadderDiceSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SEASON_NAME } from '../../lib/ambience';
import { Horizon } from './scene/Horizon';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import './Dice.css';
import './Dice.ambience.css';

const SEASON_MARK = { spring: '🌸', summer: '🏖️', autumn: '🍁', winter: '⛄' } as const;

/** 끝난 판을 그릴 때 쓰는 시각 — 일정의 어떤 시각보다 뒤. */
const DONE_MS = Number.MAX_SAFE_INTEGER;

interface View {
  run: number;
  plan: DicePlan | null;
  ms: number;
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
/** 정육면체 면 배치(lib/dice.ts 와 같다): 1 앞 · 6 뒤 · 3 오른쪽 · 4 왼쪽 · 2 위 · 5 아래. */
const FACES = [1, 6, 3, 4, 2, 5];

function Pips({ n, cls }: { n: number; cls: string }) {
  return (
    <span className={cls}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n].includes(i) ? 'dice__pip dice__pip--on' : 'dice__pip'} />
      ))}
    </span>
  );
}

export function Dice({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const side = boardSide(count);
  const track = trackLength(count);
  // 말은 지난 판 자리에서 출발한다. 판(후보 구성)이 바뀌면 App 이 key 로 새로 만든다.
  const home = useRef(0);
  const [view, setView] = useState<View>({ run: -1, plan: null, ms: 0 });
  // 둘레 칸 → 그 칸의 가게 번호.
  const places = useMemo(() => new Map(candidates.map((_, k) => [placeCell(k, count), k])), [candidates, count]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const target = placeCell(winnerIndex, count);
    const from = throwFrom(home.current, target, track);
    const plan = dicePlan(from, target, track, seededRandom(run), (c) => places.has(c));
    const finish = () => {
      home.current = target;
      onSpinEnd();
    };
    // 움직임 줄이기 · 한 곳뿐이면 굴리는 장면 없이 도착한 모습만.
    if (prefersReducedMotion() || count === 1) {
      setView({ run, plan, ms: DONE_MS });
      const t = window.setTimeout(finish, 0);
      return () => window.clearTimeout(t);
    }

    setView({ run, plan, ms: 0 });
    const timers: number[] = [];
    timers.push(
      window.setTimeout(() => {
        setView({ run, plan, ms: DONE_MS });
        finish();
      }, plan.endMs),
    );

    const sounds: [number, LadderDiceSfxName | SfxName][] = [];
    for (let t = 0; t < plan.shakeMs - 200; t += 460) sounds.push([t, 'clatter']);
    sounds.push([plan.slamMs, 'slam']);
    for (const h of plan.hits) sounds.push([h, 'clack']);
    plan.dice.forEach((d) => sounds.push([d.settleMs, 'tap']));
    if (plan.knock) sounds.push([plan.knock.atMs, 'knock']);
    if (plan.edge) {
      const settle = plan.dice[plan.edge.die].settleMs;
      for (let t = settle + 80; t < plan.edge.tipMs - 100; t += 420) sounds.push([t, 'teeter']);
      sounds.push([plan.edge.endMs, 'thunk']);
    }
    sounds.push([plan.sumMs, 'pop']);
    plan.steps.forEach((s) => sounds.push([s, 'step']));
    sounds.push([plan.arriveMs + 60, 'chime']);
    const stopSfx = ladderDiceSfxLater(sounds);

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다.
      const t = Math.max(0, now - started);
      if (t >= plan.endMs) return;
      setView((v) => (v.run === run && v.ms !== DONE_MS ? { ...v, ms: t } : v));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      timers.forEach((x) => window.clearTimeout(x));
      cancelAnimationFrame(frame);
      stopSfx();
    };
  }, [spinning, winnerIndex, count, track, run, onSpinEnd, places]);

  if (count === 0) return <div className="dice dice--empty" />;

  const live = view.run === run && view.plan !== null;
  const plan = live ? view.plan : null;
  const ms = live ? view.ms : 0;
  const settled = winnerIndex !== null && !spinning;
  const pos = plan ? pawnAt(plan, ms) : settled ? placeCell(winnerIndex, count) : 0;
  const phase = plan ? dicePhase(plan, ms) : null;
  const done = plan ? phase === 'spot' : settled;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  /*
   * 칸에 들어가는 글자 수. 예전엔 5자로 고정이라 후보 2곳(2×2판) 크게 보기에서 칸이 250px
   * 넘게 남는데도 이름이 잘렸다(리뷰 재현). 판 폭(.dice 360 · .dice--big 520)을 칸 수로
   * 나눠 한글 한 자 약 13px 로 센다. 화면이 더 좁으면 CSS 말줄임이 마저 자른다.
   */
  const cellPx = (expanded ? 520 : 360) / side;
  const nameMax = Math.max(3, Math.min(12, Math.floor((cellPx - 10) / 13)));
  /** 가짜 눈이 닿을 칸의 가게 이름. 당첨 칸이거나 빈 칸이면 null — "아깝다" 가 아니다. */
  const cellName = (cell: number) => {
    const k = places.get(cell);
    if (k === winnerIndex) return null;
    return k === undefined ? null : shortName(candidates[k].name, 10);
  };

  // 펠트(주사위 상자)는 말이 출발할 때 걷힌다.
  const feltOn = plan !== null && ms < plan.walkMs + 350;
  const feltOut = plan !== null && ms >= plan.walkMs;
  const slowmo = plan !== null && ms >= plan.slowFromMs && ms < plan.slowToMs;
  const frames = plan && feltOn ? plan.dice.map((_, i) => dieAt(plan, i, ms)) : [];
  const teeter = frames.findIndex((f) => f.teeter);
  const knock = plan?.knock ?? null;
  const knocked = knock !== null && ms >= knock.atMs && ms < knock.atMs + 650;
  const tipped = plan?.edge && ms >= plan.edge.endMs && ms < plan.sumMs;
  // 슬로모션 동안 카메라가 마지막 주사위로 다가간다.
  const focus = slowmo && plan ? (frames[plan.slowDie] ?? null) : null;

  const status = (() => {
    if (!plan) return done && winner ? `${shortName(winner.name, 10)} 칸에 도착했어요` : '주사위를 굴리면 말이 칸을 따라가요';
    if (phase === 'spot') return winner ? `${shortName(winner.name, 10)} 칸에 도착했어요` : '';
    if (phase === 'shake') return '달그락달그락…';
    if (phase === 'slam') return '쾅!';
    if (phase === 'sum') return `${plan.faces.join(' + ')} = ${plan.distance}칸 가요!`;
    if (phase === 'walk') {
      const left = plan.steps.filter((s) => s > ms).length;
      return left <= 1 ? '한 칸 더…' : `${left}칸 남았어요`;
    }
    // roll
    if (teeter >= 0 && plan.edge) {
      const name = cellName(plan.edge.fakeCell);
      return name ? `설까 말까… ${plan.edge.fake}면 ${name}` : '설까 말까…';
    }
    if (tipped && plan.edge) return `넘어갔어요! ${plan.faces[plan.edge.die]}!`;
    if (knocked && knock) return `툭! 부딪혀서 ${knock.fake} → ${plan.faces[knock.target]}`;
    if (knock && ms >= plan.dice[knock.target].settleMs && ms < knock.atMs) {
      const name = cellName(knock.fakeCell);
      return name ? `${knock.fake}면 ${name}…?` : `${knock.fake}… 이대로 멈출까?`;
    }
    if (slowmo) return '천천히… 멈춘다…';
    return '데구르르…';
  })();

  // 화면 가운데 큰 글씨(만화 효과음).
  const callout = (() => {
    if (!plan || !feltOn) return null;
    if (phase === 'shake') return { key: 'shake', text: '달그락달그락', tone: 'shake' };
    if (phase === 'slam') return { key: 'slam', text: '쾅!', tone: 'slam' };
    if (phase === 'sum' || (feltOut && ms < plan.walkMs + 350)) return { key: 'sum', text: `${plan.distance}칸!`, tone: 'sum' };
    if (knocked) return { key: 'knock', text: '툭!', tone: 'knock' };
    if (tipped) return { key: 'tip', text: '넘어갔다!', tone: 'tip' };
    return null;
  })();

  // 스포트라이트 — 당첨 칸 가운데.
  const winCell = winnerIndex === null ? null : perimeterCell(placeCell(winnerIndex, count), side);
  const spotStyle =
    winCell && done && plan
      ? ({ '--sx': `${((winCell.col - 0.5) / side) * 100}%`, '--sy': `${((winCell.row - 0.5) / side) * 100}%`, '--sr': `${((100 / side) * 0.75).toFixed(2)}cqw` } as React.CSSProperties)
      : null;

  return (
    <div className={['dice', ambienceClasses(ambience), expanded ? 'dice--big' : ''].filter(Boolean).join(' ')}>
      <div className={['dice__table', phase === 'slam' ? 'dice__table--slam' : ''].filter(Boolean).join(' ')}>
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
            const pawn = here && <span key={`pawn-${pos}`} className="dice__pawn" aria-hidden="true" />;
            if (!p) {
              return (
                <div
                  key={`blank-${t}`}
                  className={here ? 'dice__cell dice__cell--blank dice__cell--here' : 'dice__cell dice__cell--blank'}
                  style={style}
                >
                  {pawn}
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
                {pawn}
              </div>
            );
          })}
          {side > 2 && (
            <div className="dice__center" style={{ gridRow: `2 / ${side}`, gridColumn: `2 / ${side}` }} aria-hidden="true">
              <Horizon season={ambience.season} className="dice__hz" />
              <SceneWeather weather={ambience.weather} />
              <span className="dice__title">
                <span className="dice__title-mark">{SEASON_MARK[ambience.season]}</span>
                {ambience.weekday === 5 ? '불금 주사위' : `${SEASON_NAME[ambience.season]} 주사위 여행`}
              </span>
            </div>
          )}
        </div>

        {spotStyle && <span className="dice__spot" style={spotStyle} aria-hidden="true" />}

        {/* 펠트 상자 — 컵 · 구르는 주사위 · 효과 글씨 */}
        {feltOn && plan && (
          <div
            className={['dice__felt', feltOut ? 'dice__felt--out' : '', slowmo ? 'dice__felt--slow' : ''].filter(Boolean).join(' ')}
            style={{ '--die': `${(plan.size * 100).toFixed(2)}cqw` } as React.CSSProperties}
            aria-hidden="true"
          >
            <div
              className="dice__world"
              style={
                focus
                  ? {
                      // 주사위 쪽으로 다가가되, 축을 주사위보다 바깥에 둬서 벽 가까운 주사위도 가운데로 끌려온다.
                      transform: 'scale(1.18)',
                      transformOrigin: `${(50 + (focus.x - 0.5) * 250).toFixed(1)}% ${(50 + (focus.y - 0.5) * 250).toFixed(1)}%`,
                    }
                  : undefined
              }
            >
              {frames.map((f, i) =>
                f.out ? (
                  <span
                    key={i}
                    className={['dice__die', f.teeter ? 'dice__die--teeter' : '', knocked && knock?.target === i ? 'dice__die--knocked' : '']
                      .filter(Boolean)
                      .join(' ')}
                    style={{ left: `${(f.x * 100).toFixed(2)}%`, top: `${(f.y * 100).toFixed(2)}%`, '--lift': f.lift.toFixed(3) } as React.CSSProperties}
                  >
                    <span className="dice__shadow" />
                    <span
                      className="dice__cube"
                      style={{ transform: `scale(${(1 + f.lift * 0.4).toFixed(3)}) rotateZ(${f.rz.toFixed(1)}deg) rotateX(${f.pose.rx.toFixed(1)}deg) rotateY(${f.pose.ry.toFixed(1)}deg)` }}
                    >
                      {FACES.map((n) => (
                        <Pips key={n} n={n} cls={`dice__face dice__face--${n}`} />
                      ))}
                    </span>
                  </span>
                ) : null,
              )}
              {teeter >= 0 && frames[teeter] && (
                <span className="dice__tag" style={{ left: `${(frames[teeter].x * 100).toFixed(2)}%`, top: `${(frames[teeter].y * 100).toFixed(2)}%` }}>
                  설까 말까…
                </span>
              )}
            </div>
            {(phase === 'shake' || phase === 'slam' || (phase === 'roll' && ms < plan.openMs + 300)) && (
              <span
                className={['dice__cup', phase === 'slam' ? 'dice__cup--slam' : '', phase === 'roll' ? 'dice__cup--lift' : ''].filter(Boolean).join(' ')}
              >
                <svg viewBox="0 0 60 64">
                  <path d="M10 6 H50 L44 58 Q30 63 16 58 Z" className="dice__cup-body" />
                  <ellipse cx="30" cy="6" rx="20" ry="4.5" className="dice__cup-rim" />
                  <path d="M14 20 H46 M15 44 H45" className="dice__cup-band" />
                </svg>
              </span>
            )}
            {slowmo && (
              <>
                <span className="dice__bar dice__bar--top" />
                <span className="dice__bar dice__bar--bottom" />
              </>
            )}
            {callout && (
              <span key={callout.key} className={`dice__callout dice__callout--${callout.tone}`}>
                {callout.text}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="dice__foot">
        {plan && ms >= plan.sumMs && (
          <span className="dice__tray" aria-hidden="true">
            {plan.faces.map((f, i) => (
              <Pips key={i} n={f} cls={`dice__mini dice__mini--${f}`} />
            ))}
          </span>
        )}
        <p className="dice__status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
