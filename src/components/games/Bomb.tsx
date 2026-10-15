/**
 * 폭탄 돌리기 — 식탁에 둘러앉은 가게 이름표 사이로 심지에 불 붙은 폭탄이 뜨거운 감자처럼 돈다.
 * 심지가 다 타는 순간 폭탄을 든 곳이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 각본(어느 박자에 어느 자리로 넘어가고, 어떤 사건이 끼고,
 * 심지가 얼마나 남았나)은 lib/bomb.ts 가 판 번호 run 시드로 짠다. 마지막 박자는 언제나 당첨 자리에서 펑.
 *
 * 긴박감
 *  - 식탁 둘레 심지가 타 들어가고(불꽃이 따라 돈다) 째깍 소리가 점점 빨라진다.
 *  - 폭탄은 달아오를수록 부풀고 떨리고 붉게 빛난다. 위기·마지막엔 심장 소리와 붉은 테두리가 맥박 친다.
 *  - 패스마다 휙 꼬리, 가끔 "앗 뜨거!" 허둥지둥, 도로 넘기기.
 *  - 가짜 위기: 당첨 아닌 곳에서 멈추고 심지가 끝까지 타 들어가다 "휴… 불발!", 또는 "삐-익" 하고 얼어붙었다 풀린다.
 *  - 마지막: 3·2·1 큰 숫자와 슬로모션 패스(가끔 다음 자리에서 받아친다) → 번쩍 · 화면 흔들림 · 펑 · 꽃가루와 그을음.
 * 지난 판에 터진 자리에서 출발한다(startSeatRef).
 */
import { useEffect, useRef, useState } from 'react';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import { bombPlan, type Beat, type BombPlan } from '../../lib/bomb';
import { seededRandom } from '../../lib/random';
import { bombSfxLater, type BombSfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import './Bomb.css';

interface BombState {
  run: number;
  /** null 이면 각본 없이 끝 장면(움직임 줄이기·한 곳뿐). */
  plan: BombPlan | null;
  beat: number;
}

/** 판 좌표: 정사각형 360. 이름표 고리 · 폭탄 고리 · 심지(식탁 테두리). */
const BOARD = 360;
const C = BOARD / 2;
const SEAT_R = 132; // 이름표 폭(최대 88)의 반을 더해도 판(360) 안에 들어오게
const BOMB_R = SEAT_R - 50;
const FUSE_R = 106;
/**
 * 터질 때는 폭탄을 판 가운데 쪽으로 당긴다. 자리 앞에서 터지면 폭발이 당첨 이름표를 덮어
 * 어디가 걸렸는지 안 보였다(리뷰 재현).
 */
const BOOM_R = 30;
const CONFETTI = 18;
const SOOT = 7;

const CUE_SOUND: Partial<Record<Beat['cue'], BombSfxName>> = {
  light: 'fuse',
  pass: 'whoosh',
  back: 'whoosh',
  fumble: 'hot',
  hiss: 'hiss',
  dud: 'puff',
  relit: 'fuse',
  beep: 'beep',
  three: 'count',
  two: 'count',
  one: 'count',
  kick: 'kick',
  fizz: 'hiss',
  boom: 'boom',
};

/** 박자마다 자리 근처에 뜨는 만화 글씨. */
const CALLOUT: Partial<Record<Beat['cue'], [string, string]>> = {
  light: ['치익!', 'fire'],
  fumble: ['앗 뜨거!', 'hot'],
  back: ['도로 넘겨!', 'cool'],
  stop: ['어…?', 'cool'],
  hiss: ['치이이익…', 'fire'],
  dud: ['휴… 불발!', 'cool'],
  relit: ['다시 치익!', 'fire'],
  beep: ['삐-익!', 'hot'],
  phew: ['휴~ 살았다', 'cool'],
  kick: ['받아쳤다!', 'hot'],
  fizz: ['치지직…', 'fire'],
};

const pct = (n: number) => `${((n / BOARD) * 100).toFixed(2)}%`;

export function Bomb({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const startSeatRef = useRef(0);
  const [state, setState] = useState<BombState>({ run: -1, plan: null, beat: 0 });

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    // 지난 판 자리에서 출발한다. App 은 후보 구성이 바뀌면 key 로 새로 그리지만, 그 밖에서 자리 수가
    // 줄어도 없는 자리(10곳의 9번 → 4곳)에서 출발해 첫 자리 강조가 빠지지 않게 한 번 더 접는다.
    const startSeat = startSeatRef.current % count;
    const plan = prefersReducedMotion() ? null : bombPlan(count, startSeat, winnerIndex, seededRandom(run));

    if (!plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 바로 터진 모습.
      setState({ run, plan: null, beat: 0 });
      startSeatRef.current = winnerIndex;
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 폭탄이 움직이지 않는다.
    setState({ run, plan, beat: 0 });

    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    plan.beats.forEach((b, i) => {
      if (i > 0) later(b.atMs, () => setState((s) => (s.run === run ? { ...s, beat: i } : s)));
    });
    later(plan.boomMs, () => {
      startSeatRef.current = winnerIndex;
    });
    later(plan.endMs, onSpinEnd);

    const sounds: [number, BombSfxName][] = [];
    for (const b of plan.beats) {
      const name = CUE_SOUND[b.cue];
      if (name) sounds.push([b.atMs, name]);
      if (b.cue === 'boom') sounds.push([b.atMs + 40, 'thump']);
    }
    for (const t of plan.ticks) sounds.push([t, 'clock']);
    for (const t of plan.thumps) sounds.push([t, 'thump']);
    const stopSfx = bombSfxLater(sounds);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="bomb bomb--empty" />;

  const live = state.run === run;
  const plan = live ? state.plan : null;
  const beatIdx = live ? state.beat : 0;
  const beat: Beat | null = plan ? plan.beats[beatIdx] : null;
  const prev: Beat | null = plan && beatIdx > 0 ? plan.beats[beatIdx - 1] : null;
  // 각본 없이 끝난 판(움직임 줄이기)이나, 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 터진 모습.
  const finished = winnerIndex !== null && ((live && !plan) || (!live && !spinning));
  const done = finished || beat?.cue === 'boom';
  const seat = beat ? beat.seat : finished && winnerIndex !== null ? winnerIndex : 0;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const heat = done ? 1 : beat ? beat.heat : 0;
  const level = Math.min(3, Math.floor(heat * 4));
  const cue = beat?.cue ?? null;
  const counting = beat?.count ?? null;
  const name = (i: number) => shortName(candidates[i].name, 10);

  const at = (i: number, r: number) => {
    const a = (i / count) * 2 * Math.PI - Math.PI / 2; // 12시부터 시계 방향
    return { x: C + r * Math.cos(a), y: C + r * Math.sin(a) };
  };
  /*
   * 이름표 폭 = 자리 간격(2πr/n)과 판 가장자리 중 좁은 쪽. 예전엔 88 로 막아 후보 2곳에도
   * 여섯 글자에서 잘렸다. 2곳은 12시·6시라 옆으로 넓게 써도 판 안이다.
   * 크게 보기는 판이 커진 만큼 글자를 그림 단위로 줄여 더 많이 넣는다(화면에선 여전히 더 크다).
   */
  const edge = Math.min(
    ...candidates.map((_, i) => {
      const { x } = at(i, SEAT_R);
      return Math.min(x, BOARD - x) - 2;
    }),
  );
  const tagW = Math.max(40, Math.min(160, (2 * Math.PI * SEAT_R) / count - 6, edge * 2));
  const tagH = count > 10 ? 24 : 30;
  const fontPx = (count > 10 ? 10 : 12) * (expanded ? 0.84 : 1);
  // 이름표 폭에 들어가는 글자 수(한글 한 자 ≈ 1em). 14곳에서 셋으로 자르니 "골목…" 처럼 두 글자만 남았다.
  const nameMax = Math.max(3, Math.floor((tagW - 6) / fontPx));

  const bombAt = at(seat, done ? BOOM_R : BOMB_R);
  const popAt = { x: C - bombAt.x, y: C - bombAt.y };
  const popLen = Math.hypot(popAt.x, popAt.y) || 1;
  const pop = { x: (popAt.x / popLen) * 40, y: (popAt.y / popLen) * 40 };
  const moved = !!beat && !!prev && prev.seat !== beat.seat;
  const moveMs = done ? 180 : beat ? beat.moveMs : 0;
  const slow = cue === 'one';
  const from = prev ? at(prev.seat, BOMB_R) : null;

  // 심지(식탁 테두리) — 이 박자 동안 fuseFrom → fuseTo 로 일정하게 탄다. 박자마다 key 를 바꿔 처음부터.
  const fuseFrom = done ? 0 : beat ? beat.fuseFrom : 1;
  const fuseTo = done ? 0 : beat ? beat.fuseTo : 1;
  const span = beat ? beat.spanMs : 0;
  const fuseVars = {
    '--o0': `${((1 - fuseFrom) * 100).toFixed(2)}`,
    '--o1': `${((1 - fuseTo) * 100).toFixed(2)}`,
    '--a0': `${(fuseFrom * 360).toFixed(1)}deg`,
    '--a1': `${(fuseTo * 360).toFixed(1)}deg`,
    '--span': `${span}ms`,
  } as React.CSSProperties;
  const burning = !!beat && !done && fuseFrom > 0;

  const status = (() => {
    if (done && winner) return `펑! 오늘은 ${shortName(winner.name, 12)}!`;
    if (!beat) return '폭탄을 넘기다 심지가 다 타는 곳에서 터져요';
    switch (beat.cue) {
      case 'light':
        return '치익— 심지에 불이 붙었어요';
      case 'fumble':
        return `앗 뜨거! ${name(seat)} 손에서 폭탄이 튀었어요`;
      case 'back':
        return `${withJosa(name(prev?.seat ?? seat), '이/가')} 도로 넘겼어요!`;
      case 'stop':
        return `${name(seat)} 앞에서 멈췄어요…`;
      case 'hiss':
        return '치이이익… 심지가 끝까지 타 들어가요';
      case 'dud':
        return '휴… 불발이에요!';
      case 'relit':
        return '다시 불이 붙었어요! 빨리 넘겨요';
      case 'beep':
        return `삐-익! ${name(seat)}에서 터지나요?`;
      case 'phew':
        return '휴, 살았어요! 계속 넘겨요';
      case 'three':
      case 'two':
      case 'one':
        return '심지가 거의 다 탔어요… 누구일까요?';
      case 'kick':
        return `${withJosa(name(prev?.seat ?? seat), '이/가')} 받아쳤어요!`;
      case 'fizz':
        return '치지직… 터진다!';
      default:
        return heat >= 0.4 ? '심지가 얼마 안 남았어요! 빨리빨리!' : '뜨거워요! 얼른 넘겨요';
    }
  })();

  const callout = cue ? CALLOUT[cue] : undefined;
  const calloutAt = at(seat, 34);
  const winAt = winnerIndex === null ? null : at(winnerIndex, SEAT_R);

  return (
    <div className={expanded ? 'bomb bomb--big' : 'bomb'}>
      <div
        className={[
          'bomb__stage',
          `bomb__stage--h${level}`,
          done && live && plan ? 'bomb__stage--boom' : '',
          cue === 'beep' ? 'bomb__stage--freeze' : '',
          slow ? 'bomb__stage--slow' : '',
          cue === 'hiss' ? 'bomb__stage--hiss' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <svg
          className="bomb__board"
          viewBox={`0 0 ${BOARD} ${BOARD}`}
          role="img"
          aria-label={`폭탄 돌리기 판, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        >
          <defs>
            <radialGradient id="bomb-glow">
              <stop offset="0" stopColor="oklch(0.75 0.22 40)" stopOpacity="0.9" />
              <stop offset="1" stopColor="oklch(0.6 0.24 28)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={FUSE_R + 4} className="bomb__table" />
          {/* 심지 — 다 탄 자리는 재(점선), 남은 자리는 노끈. 불꽃이 끝을 따라 돈다. */}
          <circle cx={C} cy={C} r={FUSE_R} className="bomb__ash" />
          <circle
            key={`rope-${run}-${beatIdx}`}
            cx={C}
            cy={C}
            r={FUSE_R}
            pathLength={100}
            transform={`rotate(-90 ${C} ${C})`}
            className={burning ? 'bomb__rope bomb__rope--burn' : 'bomb__rope'}
            style={fuseVars}
          />
          {burning && (
            <g key={`spark-${run}-${beatIdx}`} className="bomb__spark-orbit" style={fuseVars} aria-hidden="true">
              <g transform={`translate(${C} ${C - FUSE_R})`} className={cue === 'hiss' || level >= 3 ? 'bomb__spark bomb__spark--wild' : 'bomb__spark'}>
                <circle r="9" className="bomb__spark-glow" />
                <path d="M0 -7 L1.8 -1.8 L7 0 L1.8 1.8 L0 7 L-1.8 1.8 L-7 0 L-1.8 -1.8 Z" className="bomb__spark-star" />
                <circle r="2.2" className="bomb__spark-core" />
              </g>
            </g>
          )}

          {candidates.map((p, index) => {
            const { x, y } = at(index, SEAT_R);
            const isCurrent = index === seat && !done;
            const isWinner = done && index === winnerIndex;
            return (
              <g key={p.id} transform={`translate(${x} ${y})`}>
                <g
                  className={[
                    'bomb__tag',
                    isCurrent && (cue === 'fumble' || level >= 2) ? 'bomb__tag--panic' : '',
                    isWinner && live && plan ? 'bomb__tag--hit' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
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
                  <text textAnchor="middle" dominantBaseline="central" className="bomb__name" style={{ fontSize: fontPx }}>
                    {shortName(p.name, nameMax)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 휙 — 패스 꼬리. 도로 넘길 땐 파란 꼬리. */}
          {moved && from && !done && (
            <line
              key={`trail-${run}-${beatIdx}`}
              x1={from.x}
              y1={from.y}
              x2={bombAt.x}
              y2={bombAt.y}
              pathLength={100}
              className={['bomb__trail', cue === 'back' || cue === 'kick' ? 'bomb__trail--back' : '', slow ? 'bomb__trail--slow' : '']
                .filter(Boolean)
                .join(' ')}
              style={{ '--move': `${Math.max(120, moveMs)}ms` } as React.CSSProperties}
            />
          )}

          {/* 폭탄. 자리를 옮길 땐 이 박자의 이동 시간만큼 미끄러지고, 안쪽 그룹이 포물선으로 튄다. */}
          <g
            className={done ? 'bomb__bomb bomb__bomb--exploding' : 'bomb__bomb'}
            style={{
              transform: `translate(${bombAt.x}px, ${bombAt.y}px)`,
              transition: `transform ${moveMs}ms ${slow ? 'cubic-bezier(0.25, 0.1, 0.2, 1)' : 'cubic-bezier(0.3, 0, 0.3, 1)'}`,
            }}
          >
            <g
              key={`toss-${run}-${beatIdx}`}
              className={moved && !done ? (cue === 'fumble' ? 'bomb__toss bomb__toss--fumble' : 'bomb__toss') : cue === 'fumble' ? 'bomb__toss--fumble' : ''}
              style={{ '--move': `${moveMs}ms` } as React.CSSProperties}
            >
              <g className={`bomb__body bomb__body--h${level}${cue === 'beep' || cue === 'fizz' ? ' bomb__body--flash' : ''}`} aria-hidden="true">
                <circle r="26" fill="url(#bomb-glow)" className="bomb__heat" />
                <circle r="13" className="bomb__ball" />
                <circle r="13" className="bomb__hot" />
                <ellipse cx="-4.5" cy="-5" rx="3.6" ry="2.4" className="bomb__shine" transform="rotate(-35 -4.5 -5)" />
                <rect x="-4" y="-17" width="8" height="5" rx="1.5" className="bomb__cap" />
                <path d="M0 -17 Q3 -24 9 -23" className="bomb__wick" />
                {!done && (
                  <g transform="translate(9 -23)" className="bomb__wick-spark">
                    <circle r="4" className="bomb__spark-glow" />
                    <circle r="1.6" className="bomb__spark-core" />
                  </g>
                )}
              </g>
            </g>
            {cue === 'dud' &&
              [-1, 0, 1, 2].map((k) => (
                <circle
                  key={`puff-${run}-${k}`}
                  cx={k * 7 - 3}
                  cy={-18 - (k % 2) * 6}
                  r={9 + (k % 2) * 3}
                  className="bomb__puff"
                  style={{ '--px': `${k * 6}px`, '--py': `${-16 - k * 3}px`, animationDelay: `${(k + 1) * 50}ms` } as React.CSSProperties}
                  aria-hidden="true"
                />
              ))}
            {done && (
              <>
                {live && plan && <circle r="10" className="bomb__wave" aria-hidden="true" />}
                <path
                  d={starPath(16, 48, 24)}
                  className={live && plan ? 'bomb__burst bomb__burst--live' : 'bomb__burst'}
                  aria-hidden="true"
                />
                <path d={starPath(12, 28, 15)} className={live && plan ? 'bomb__burst-in bomb__burst--live' : 'bomb__burst-in'} aria-hidden="true" />
                <text
                  x={pop.x}
                  y={pop.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="bomb__pop"
                  aria-hidden="true"
                >
                  펑!
                </text>
              </>
            )}
          </g>
        </svg>

        {/* 화면에 붙은 효과 — 붉은 테두리, 큰 숫자, 만화 글씨, 번쩍, 꽃가루·그을음. */}
        <div className="bomb__fx" aria-hidden="true">
          {!done && beat && heat >= 0.45 && <span className={`bomb__vignette bomb__vignette--h${level}`} />}
          {counting && !done && (
            <span key={`n-${run}-${counting}`} className={`bomb__count bomb__count--${counting}`}>
              {counting}
            </span>
          )}
          {callout && !done && (
            <span
              key={`c-${run}-${beatIdx}`}
              className={`bomb__callout bomb__callout--${callout[1]}`}
              style={{ left: `clamp(16%, ${pct(calloutAt.x)}, 84%)`, top: pct(calloutAt.y) }}
            >
              {callout[0]}
            </span>
          )}
          {done && live && plan && <span className="bomb__flash" />}
          {done && winAt && (
            <span className="bomb__blast" style={{ left: pct(winAt.x), top: pct(winAt.y) }}>
              {live &&
                plan &&
                Array.from({ length: CONFETTI }, (_, k) => (
                  <span
                    key={`f${k}`}
                    className="bomb__confetti"
                    style={
                      {
                        '--a': `${(k * 360) / CONFETTI + (k % 3) * 9}deg`,
                        '--h': (k * 53) % 360,
                        '--d': `${0.75 + (k % 4) * 0.2}`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              {Array.from({ length: SOOT }, (_, k) => (
                <span
                  key={`s${k}`}
                  className={live && plan ? 'bomb__soot bomb__soot--live' : 'bomb__soot'}
                  style={
                    {
                      '--sx': `${(k - (SOOT - 1) / 2) * 3}cqw`,
                      '--sy': `${-4 - (k % 3) * 2.5}cqw`,
                      '--ss': `${0.7 + (k % 3) * 0.25}`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          )}
        </div>
      </div>

      <p className="bomb__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 뾰족한 폭발 모양(별) — 끝 n 개, 바깥·안쪽 반지름. 끝마다 조금씩 길이를 흔든다. */
function starPath(n: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let k = 0; k < n * 2; k += 1) {
    const a = (k / (n * 2)) * 2 * Math.PI - Math.PI / 2;
    const r = k % 2 === 0 ? outer * (k % 4 === 0 ? 1 : 0.82) : inner;
    pts.push(`${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join(' L')} Z`;
}
