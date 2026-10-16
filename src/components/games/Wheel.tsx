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
 *
 * 한 판(lib/wheel.ts 가 판 번호 run 시드로 정한다): 진행자가 원판을 끼릭끼릭 뒤로 감았다가 휘리릭 놓고,
 * 칸 경계의 못이 바늘을 튕길 때마다 딸깍 — 점점 느려진다. 결말은 그대로 멈춤·한 칸 더…?·툭 밀림·역회전.
 * 멈추면 당첨 칸에 금빛 조명과 꽃가루. 당첨은 App 이 정했고(winnerIndex) 결말은 연출일 뿐이다.
 *
 * 원판 각도는 rAF 가 DOM 에 직접 쓴다(초당 60번 React 를 다시 그리지 않는다). React 의 transform 값은
 * 판 동안 시작 각도로 그대로 두고, 멈추는 순간 마지막 각도로 바꾼다 — 값이 안 바뀌면 React 는 DOM 을 건드리지 않는다.
 * 첫 화면 게임이라 처음부터 내려받는다. 그래서 그림은 CSS·작은 SVG 만 쓴다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { wheelLabelFlipped } from '../../lib/spin';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { CLICK_MS, sliceAt, sliceFrac, wheelAngleAt, wheelPlan, type WheelBeat, type WheelPlan } from '../../lib/wheel';
import { sfx, wheelSlotSfxLater, type SfxName, type WheelSlotSfx } from '../../lib/sfx';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import './Wheel.css';

/** 이 수를 넘는 후보 수부터 라벨을 바퀴살 방향(세로)으로 쓴다. */
export const RADIAL_FROM = 8;

/** 꽃가루 조각 수. */
const CONFETTI = 18;
/** 바늘이 못에 걸려 휘는 최대 각도 · 못에 닿기 시작하는 거리(칸 폭 비율). */
const BEND_DEG = 24;
const BEND_REACH = 0.22;
/** 이보다 빠르면(도/초) 원판이 흐려 보인다. */
const BLUR_SPEED = 700;

interface WheelState {
  run: number;
  beat: WheelBeat | null;
  /** React 가 transform 에 쓰는 각도. 판 동안은 시작 각도, 멈추면 마지막 각도. */
  angle: number;
  plan: WheelPlan | null;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function Wheel({ candidates, winnerIndex, spinning, run, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const slice = count > 0 ? 360 / count : 360;
  const [state, setState] = useState<WheelState>({ run: -1, beat: null, angle: 0, plan: null });
  /** 지금 화면의 원판 각도. 다음 판은 여기서 이어 돈다. */
  const angleRef = useRef(0);
  const discRef = useRef<HTMLDivElement>(null);
  const needleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const start = angleRef.current;

    if (prefersReducedMotion() || count < 2) {
      // 움직임 줄이기(또는 한 곳뿐)면 돌지 않고 당첨 칸이 바늘 밑에 선 모습만.
      const s = 360 / count;
      const center = mod(360 - (winnerIndex * s + s / 2), 360);
      const final = start + mod(center - start, 360);
      angleRef.current = final;
      setState({ run, beat: 'landed', angle: final, plan: null });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    const plan = wheelPlan(count, winnerIndex, start, SPIN_MS.wheel, seededRandom(run))!;
    setState({ run, beat: 'windup', angle: start, plan });

    const timers: number[] = [];
    for (const { at, beat } of plan.beats) {
      if (at === 0) continue;
      timers.push(
        window.setTimeout(
          () => setState((s) => (s.run === run ? { ...s, beat, angle: beat === 'landed' ? plan.final : s.angle } : s)),
          at,
        ),
      );
    }
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, WheelSlotSfx | SfxName][] = [];
    for (let k = 0; k < plan.clicks; k += 1) sounds.push([k * CLICK_MS, 'ratchet']);
    const at = (b: WheelBeat) => plan.beats.find((x) => x.beat === b)?.at;
    sounds.push([at('launch')!, 'whirl']);
    const move = at('move');
    if (move !== undefined) sounds.push([move, plan.ending === 'reverse' ? 'boing' : 'clack']);
    sounds.push([plan.landMs, 'tada']);
    const stopSfx = wheelSlotSfxLater(sounds);

    // 원판·바늘을 매 프레임 그린다. 못(칸 경계)을 지날 때마다 딸깍.
    const disc = discRef.current;
    const needle = needleRef.current;
    let raf = 0;
    let t0 = -1;
    let prev = start;
    let prevT = 0;
    let dir = 1;
    const frame = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = now - t0;
      const a = wheelAngleAt(plan, t);
      angleRef.current = a;
      if (disc) {
        disc.style.transform = `rotate(${a}deg)`;
        const speed = t > prevT ? (Math.abs(a - prev) * 1000) / (t - prevT) : 0;
        disc.classList.toggle('wheel__disc--blur', speed > BLUR_SPEED);
      }
      if (Math.abs(a - prev) > 0.05) dir = a > prev ? 1 : -1;
      if (Math.floor(-a / slice) !== Math.floor(-prev / slice)) sfx('tick');
      if (needle) {
        // 앞으로 돌면 못이 다가오는 쪽(칸 끝 0)에서, 거꾸로 돌면 반대쪽(1)에서 바늘 끝을 민다.
        const f = sliceFrac(a, count);
        const near = dir > 0 ? f : 1 - f;
        const bend = Math.max(0, 1 - near / BEND_REACH) * BEND_DEG * (dir > 0 ? -1 : 1);
        needle.style.rotate = `${bend.toFixed(1)}deg`;
      }
      prev = a;
      prevT = t;
      if (t < plan.landMs) raf = requestAnimationFrame(frame);
      else {
        disc?.classList.remove('wheel__disc--blur');
        if (needle) needle.style.rotate = '';
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      stopSfx();
      disc?.classList.remove('wheel__disc--blur');
      if (needle) needle.style.rotate = '';
    };
  }, [spinning, winnerIndex, count, slice, run, onSpinEnd]);

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

  const live = state.run === run && spinning;
  // 판이 끝난 뒤(결과를 닫고 다시 그려질 때도) 당첨 칸이 바늘 밑에 서 있으면 당첨 장면을 보인다.
  const landedIdx =
    winnerIndex !== null && state.run === run && state.beat === 'landed' && sliceAt(state.angle, count) === winnerIndex
      ? winnerIndex
      : null;
  const winner = landedIdx !== null ? (candidates[landedIdx] ?? null) : null;
  const beat = live ? state.beat : null;
  const plan = live ? state.plan : null;
  /** 라벨 뒤집기는 멈출 각도로 판단한다 — 멈춘 뒤 당첨 라벨이 거꾸로 서지 않게. */
  const restAngle = plan ? plan.final : state.angle;

  // 칸이 많으면 테두리를 따라 눕힌 라벨이 서로 겹친다. 20칸이면 칸 하나의
  // 테두리 호가 43px 인데 라벨은 78px 까지 간다(실측). 그때는 글자를
  // 바퀴살 방향으로 세워 쓴다. 거꾸로 판정(wheelLabelFlipped)은 그대로
  // 쓴다 — 글자가 뒤집히는 조건은 눕히든 세우든 같은 반원이다.
  const radial = count > RADIAL_FROM;
  const tease = plan?.tease != null ? shortName(candidates[plan.tease]?.name ?? '', 10) : '';

  const status = (() => {
    if (winner) return `${shortName(winner.name, 14)} 당첨이에요!`;
    switch (beat) {
      case 'windup':
        return '끼릭끼릭… 힘껏 감고 있어요';
      case 'launch':
        return '휘리릭! 돌아가요';
      case 'slow':
        return '점점 느려져요… 어디서 멈출까요?';
      case 'hold':
        if (plan?.ending === 'creep') return `${tease} 끝에서 멈추나…? 한 칸 더…?`;
        if (plan?.ending === 'nudge') return `${tease}에 멈췄… 나요?`;
        return `어어, ${tease}까지 지나쳤어요…?`;
      case 'move':
        if (plan?.ending === 'creep') return '넘어간다… 넘어갔어요!';
        if (plan?.ending === 'nudge') return '툭! 바늘이 한 칸 더 밀었어요';
        return '역회전! 거꾸로 돌아와요';
      default:
        return count > 0 ? `${count}곳이 돌림판에 올라갔어요` : '';
    }
  })();

  const callout = (() => {
    switch (beat) {
      case 'windup':
        return { text: '끼릭끼릭', tone: 'wind' };
      case 'launch':
        return { text: '휘리릭!', tone: 'go' };
      case 'hold':
        return {
          text: plan?.ending === 'creep' ? '한 칸 더…?' : plan?.ending === 'nudge' ? '멈췄…다?' : '지나쳤다!?',
          tone: 'tense',
        };
      case 'move':
        return {
          text: plan?.ending === 'creep' ? '넘어갔다!' : plan?.ending === 'nudge' ? '툭!' : '역회전!',
          tone: plan?.ending === 'reverse' ? 'reverse' : 'go',
        };
      default:
        return null;
    }
  })();

  const mood = winner
    ? 'cheer'
    : beat === 'windup'
      ? 'strain'
      : beat === 'hold'
        ? 'tense'
        : beat === 'move'
          ? 'shock'
          : beat
            ? 'wow'
            : 'idle';

  return (
    <div className="wheelgame">
      <div
        className={[
          'wheel',
          radial ? 'wheel--radial' : '',
          beat === 'windup' ? 'wheel--windup' : '',
          beat === 'hold' ? 'wheel--hold' : '',
          winner ? 'wheel--landed' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ '--spot': `${Math.min(slice, 60)}deg` } as React.CSSProperties}
      >
        {/* 멈추는 순간 바늘이 칸 끝에 걸렸다 풀리듯 흔들린다. key 로 판마다 다시 튼다. */}
        <div
          ref={needleRef}
          key={winner ? `landed-${state.run}` : 'idle'}
          className={winner ? 'wheel__needle wheel__needle--landed' : 'wheel__needle'}
          aria-hidden="true"
        />

        <div
          ref={discRef}
          className="wheel__disc"
          style={{ background, transform: `rotate(${state.angle}deg)`, transitionDuration: '0ms' }}
          role="img"
          aria-label={`고를 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
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
            // 원판이 멈출 각도까지 넣어서 판단한다 (lib/spin.ts).
            const upsideDown = wheelLabelFlipped(i, count, restAngle);
            return (
              <div
                key={place.id}
                className="wheel__slice"
                style={{ transform: `rotate(${mid}deg)` }}
                aria-hidden="true"
              >
                <span
                  className={[
                    'wheel__label',
                    upsideDown ? 'wheel__label--flip' : '',
                    i === landedIdx ? 'wheel__label--win' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={place.name}
                >
                  {shortName(place.name, radial ? 6 : 12)}
                </span>
              </div>
            );
          })}
        </div>

        {/* 당첨 칸(12시)에 금빛 조명. 나머지는 살짝 어둡게. */}
        {winner && <span className="wheel__spot" aria-hidden="true" />}
        {winner && (
          <span className="wheel__confetti" aria-hidden="true">
            {Array.from({ length: CONFETTI }, (_, k) => (
              <span
                key={k}
                style={
                  {
                    '--a': `${(k * 360) / CONFETTI + (k % 3) * 9}deg`,
                    '--far': 95 + (k % 4) * 22,
                    '--h': (k * 53) % 360,
                    '--d': `${0.9 + (k % 5) * 0.16}`,
                    '--r': `${(k * 71) % 360}deg`,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        )}

        {!winner && count > 0 && <span className="wheel__hub" aria-hidden="true" />}
        {callout && (
          <span
            key={`${state.run}-${beat}`}
            className={`wheel__callout wheel__callout--${callout.tone}`}
            aria-hidden="true"
          >
            {callout.text}
          </span>
        )}

        {winner && (
          <div className="wheel__center">
            <strong>{winner.name}</strong>
            <span>도보 {winner.walkMin}분</span>
          </div>
        )}
      </div>

      {count > 0 && (
        <div className="wheelgame__host">
          <Host mood={mood} />
          {/* role="status" 는 polite 알림이다. aria-live 속성 대신 쓴다 — 첫 화면의 aria-live 자리는 App 의 결과 알림 몫이다(App.test). */}
          <p className="wheelgame__status" role="status">
            {status}
          </p>
        </div>
      )}
    </div>
  );
}

/** 진행자 — 나비넥타이를 맨 동그란 얼굴. 표정만 장면마다 바뀐다. */
function Host({ mood }: { mood: string }) {
  return (
    <svg className={`wheelgame__mc wheelgame__mc--${mood}`} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="22" r="17" className="wheelgame__mc-face" />
      <path d="M9 17 Q24 -2 39 17 Q24 10 9 17 Z" className="wheelgame__mc-hair" />
      <g className="wheelgame__mc-eyes">
        <ellipse cx="18" cy="21" rx="2.2" ry="2.8" />
        <ellipse cx="30" cy="21" rx="2.2" ry="2.8" />
      </g>
      <path d="M15 21 L20 20 M28 20 L33 21" className="wheelgame__mc-squint" />
      <circle cx="13.5" cy="27" r="2.6" className="wheelgame__mc-blush" />
      <circle cx="34.5" cy="27" r="2.6" className="wheelgame__mc-blush" />
      <path d="M19 29 Q24 34 29 29" className="wheelgame__mc-smile" />
      <ellipse cx="24" cy="30.5" rx="3" ry="3.6" className="wheelgame__mc-o" />
      <path d="M19 30 L29 30" className="wheelgame__mc-grit" />
      <path d="M17 42 L24 39 L31 42 L31 46 L24 43 L17 46 Z" className="wheelgame__mc-bow" />
    </svg>
  );
}
