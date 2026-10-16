/**
 * 볼링 — 레인 끝에 가게 이름표를 단 핀들이 삼각형으로 서 있고, 공을 2~3번 굴린다.
 * 끝까지 서 있는 핀 하나가 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 어느 핀이 언제 어떻게 쓰러질지는 lib/bowling.ts 가 판 번호(run)
 * 시드로 짠 각본이다 — 어떤 사건도 당첨 핀을 쓰러뜨리지 않는다. 화면은 각본에서 t(ms) 장면을 그대로
 * 계산해(frameAt) 그린다. 카메라는 핀 → 볼러로 내려갔다가 공을 따라 레인을 올라간다.
 *
 * 사건(판마다 rng): 거터 · 스플릿 · 와르르(당첨과 하나만 남음) · 휘청이다 쓰러지는 핀(버틸까?) ·
 * 옆벽 맞고 돌아온 핀(킥백) · 당첨 쪽을 노리다 휘어 나가는 공 · 핀 정리 바. 마지막 공은 볼러 백스윙
 * 컷신(휙~)과 슬로모션, 끝나면 남은 핀이 빛나며 "끝까지 버텼어요!" 와 함께 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import {
  BALL_R,
  PIN_H,
  bowlingNameMax,
  bowlingPlan,
  deckLayout,
  eventAt,
  frameAt,
  type BowlEvent,
  type BowlingPlan,
  type Frame,
} from '../../lib/bowling';
import { seededRandom } from '../../lib/random';
import { bowlSfxLater, type BowlSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SEASON_NAME, type Ambience } from '../../lib/ambience';
import { Horizon } from './scene/Horizon';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import './Bowling.css';
import './Bowling.ambience.css';

const SEASON_MARK = { spring: '🌸', summer: '🍉', autumn: '🎃', winter: '🎄' } as const;
const WEATHER_MARK = { clear: '', cloudy: '☁️', rain: '☔', snow: '⛄', fog: '🌫️' } as const;

interface BowlingState {
  run: number;
  /** 이번 판 시작부터 흐른 시간(ms). */
  t: number;
}

/** 큰 글씨(만화 효과음)가 떠 있는 시간. */
const CALLOUT_MS = 650;
/** 휘청이 끝난 뒤 "꽈당!/버텼다!" 말풍선이 남는 시간. */
const AFTER_MS = 450;
/** 꽃가루 조각 수. */
const CONFETTI = 16;

const cqw = (n: number) => `${n.toFixed(2)}cqw`;

/** 이름표 글자 — 잘린 자리에 공백이 남으면("만두 …") 붙인다. */
const tagName = (name: string, max: number) => shortName(name, max).replace(/\s+…$/, '…');

function statusText(plan: BowlingPlan, ev: BowlEvent | null, t: number, name: (i: number) => string): string {
  if (!ev) return `핀 ${plan.count}개 — 끝까지 서 있으면 당첨!`;
  const roll = plan.rolls[ev.roll];
  switch (ev.kind) {
    case 'pan':
      return `${ev.roll + 1}번째 공을 준비해요`;
    case 'windup':
      return '하나, 둘…';
    case 'cut':
      return '마지막 공…!';
    case 'roll':
      return roll.final ? '마지막 공이 굴러가요…' : '데굴데굴…';
    case 'hook':
      return '휘어 들어가요!';
    case 'swerve':
      return '어어, 저쪽으로 가요…?';
    case 'slow':
      return '과연…?';
    case 'gutter':
      return '어어… 거터…';
    case 'gutterEnd':
      return '거터… 하나도 못 쓰러뜨렸어요';
    case 'brush':
      return `스쳤어요! ${name(ev.pin ?? 0)} 휘청…`;
    case 'hit':
      return (ev.count ?? 0) === 0
        ? '툭! 맞긴 맞았는데…'
        : (ev.count ?? 0) === 1
          ? '톡, 하나 쓰러졌어요'
          : `와르르! ${ev.count}개 쓰러졌어요`;
    case 'strike':
      return roll.final ? '쾅! 와르르 다 쓰러져요' : '쾅! 딱 두 개 남았어요';
    case 'split':
      return '스플릿! 양 끝만 남았어요';
    case 'kick':
      return '팅! 튕겨 나온 핀이 하나 더!';
    case 'teeter': {
      const n = name(ev.pin ?? 0);
      if (t < (ev.until ?? ev.t)) return `${n} 버틸까…?`;
      if (ev.falls) return `아깝다! ${n} 쓰러졌어요`;
      return ev.pin === plan.winner ? `${n} 버텼어요!` : `${n} 버텼어요… 아직은!`;
    }
    case 'duel':
      return t < (ev.until ?? ev.t) ? '둘 중 누가 버틸까…?' : `아깝다! ${name(ev.pin ?? 0)} 쓰러졌어요`;
    case 'sweep':
      return `핀 정리 중… 남은 핀 ${ev.count}개`;
    case 'final':
      return `${name(plan.winner)} 핀이 끝까지 버텼어요!`;
  }
}

/** 화면 가운데 큰 글씨. 사건 직후 CALLOUT_MS 동안. */
function calloutOf(plan: BowlingPlan, t: number): { key: string; text: string; tone: string } | null {
  let best: { key: string; text: string; tone: string } | null = null;
  for (const e of plan.events) {
    if (e.t > t) break;
    const fresh = t < e.t + CALLOUT_MS;
    let c: [string, string] | null = null;
    if (e.kind === 'strike') c = ['쾅!', 'big'];
    else if (e.kind === 'split') c = ['스플릿!', 'split'];
    else if (e.kind === 'hit') c = (e.count ?? 0) >= 3 ? ['와르르!', 'big'] : ['탁!', 'plain'];
    else if (e.kind === 'gutter') c = ['거터…', 'sad'];
    else if (e.kind === 'brush') c = ['휴~', 'plain'];
    else if (e.kind === 'final') c = ['끝까지 버텼어요!', 'win'];
    if (!c) continue;
    if (e.kind === 'final' || (e.kind === 'gutter' && t < e.t + 900) || fresh)
      best = { key: `${e.kind}-${e.t}`, text: c[0], tone: c[1] };
  }
  return best;
}

export function Bowling({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [state, setState] = useState<BowlingState>({ run: -1, t: 0 });
  const layout = useMemo(() => deckLayout(count), [count]);
  const plan = useMemo(
    () => (winnerIndex === null ? null : bowlingPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 굴리는 장면 없이 끝 장면만 보인다.
      setState({ run, t: plan ? plan.endMs : 0 });
      const tm = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(tm);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 갱신이 s.run === run 에 막혀 공이 안 굴러간다.
    setState({ run, t: 0 });
    const advance = (t: number) =>
      setState((s) => (s.run === run && t > s.t ? { run, t: Math.min(t, plan.endMs) } : s));

    // 그리기는 rAF 로 매끄럽게, 사건 시각엔 타이머로도 한 번씩 맞춘다(탭이 숨어 rAF 가 멈춰도 끝 장면은 맞다).
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = now - t0;
      advance(t);
      if (t < plan.endMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const timers: number[] = [];
    const marks = new Set<number>(plan.events.map((e) => e.t));
    for (let t = 250; t < plan.endMs; t += 250) marks.add(t);
    for (const t of marks) timers.push(window.setTimeout(() => advance(t), t));
    timers.push(
      window.setTimeout(() => {
        setState({ run, t: plan.endMs });
        onSpinEnd();
      }, plan.endMs),
    );

    const sounds: [number, BowlSfxName | SfxName][] = [];
    for (const r of plan.rolls) {
      if (r.final) sounds.push([r.t0 + Math.round((r.release - r.t0) * 0.45), 'whoosh']);
      sounds.push([r.release, 'roll']);
      if (r.knocked.length >= 3) sounds.push([r.impact, 'crash']);
      else if (r.knocked.length) sounds.push([r.impact, 'tok']);
      if (r.sweep) sounds.push([r.sweep.t0, 'rake']);
    }
    for (const e of plan.events) {
      if (e.kind === 'gutter') sounds.push([e.t, 'gutter']);
      if (e.kind === 'teeter' || e.kind === 'duel') {
        sounds.push([e.t, 'wobble']);
        if (e.falls && e.until) sounds.push([e.until, 'tok']);
      }
      if (e.kind === 'kick') sounds.push([e.t, 'bump'], [e.t + 190, 'tok']);
      if (e.kind === 'final') sounds.push([e.t, 'fanfare']);
    }
    const stopSfx = bowlSfxLater(sounds);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((tm) => window.clearTimeout(tm));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="bowling bowling--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 끝 장면을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const t = live ? state.t : settled && plan ? plan.endMs : null;
  const frame: Frame | null = plan && t !== null ? frameAt(plan, t) : null;
  const ev = plan && t !== null ? eventAt(plan, t) : null;
  const done = winnerIndex !== null && (live || settled) && (!plan || (t !== null && t >= plan.finalMs));
  const nameMax = bowlingNameMax(layout, expanded);
  const fullName = (i: number) => shortName(candidates[i].name, 12);
  const status =
    done && winnerIndex !== null
      ? `${fullName(winnerIndex)} 핀이 끝까지 버텼어요!`
      : plan && t !== null
        ? statusText(plan, ev, t, (i) => tagName(candidates[i].name, 8))
        : `핀 ${count}개 — 끝까지 서 있으면 당첨!`;

  const roll = plan && frame && frame.roll >= 0 ? plan.rolls[frame.roll] : null;
  const stage = frame?.stage ?? 'idle';
  const cam = frame?.cam ?? { x: 50, y: layout.view / 2, z: 1 };
  const worldStyle = {
    height: cqw(layout.length),
    transform: `translate(${cqw(50 - cam.z * cam.x)}, ${cqw(layout.view / 2 - cam.z * cam.y)}) scale(${cam.z.toFixed(4)})`,
  } as React.CSSProperties;

  // 볼러: 지금 공(아직 없으면 첫 공) 놓는 자리 뒤에 선다.
  const nextRoll = roll ?? plan?.rolls[0] ?? null;
  const bowlerX = nextRoll ? nextRoll.start.x : 56;
  const holding = !frame?.ball && (stage === 'idle' || stage === 'pan' || stage === 'windup' || stage === 'cut');
  const bowlerPose =
    stage === 'windup'
      ? 'swing'
      : stage === 'travel' && roll && t !== null && t < roll.release + 420
        ? 'follow'
        : 'ready';

  // 휘청 말풍선: 휘청이는 동안 "버틸까?", 끝난 뒤 잠깐 "꽈당!/버텼다!".
  const bubbles: { key: string; pin: number; text: string; tone: string }[] = [];
  if (plan && t !== null) {
    for (const e of plan.events) {
      if ((e.kind !== 'teeter' && e.kind !== 'duel') || e.pin === undefined || e.until === undefined) continue;
      if (t >= e.t && t < e.until) {
        bubbles.push({
          key: `${e.t}-${e.pin}`,
          pin: e.pin,
          text: e.kind === 'duel' ? '버틸까?' : '버틸까?',
          tone: 'ask',
        });
        if (e.kind === 'duel') bubbles.push({ key: `${e.t}-w`, pin: plan.winner, text: '나도?', tone: 'ask' });
      } else if (t >= e.until && t < e.until + AFTER_MS)
        bubbles.push({
          key: `${e.t}-${e.pin}-after`,
          pin: e.pin,
          text: e.falls ? '꽈당!' : '버텼다!',
          tone: e.falls ? 'fall' : 'stay',
        });
    }
  }
  const kicks =
    plan && t !== null ? plan.events.filter((e) => e.kind === 'kick' && e.at && t >= e.t && t < e.t + 420) : [];
  const callout = plan && t !== null ? calloutOf(plan, t) : null;
  const showCut = roll?.final && t !== null && (stage === 'cut' || (stage === 'travel' && t < roll.release + 200));
  const slowMo = roll?.final && stage === 'travel' && ev?.kind === 'slow';

  return (
    <div
      className={['bowling', 'scene-outfit', ambienceClasses(ambience), expanded ? 'bowling--big' : '', settled ? 'bowling--settled' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--fit': (100 / layout.view).toFixed(4) } as React.CSSProperties}
    >
      <div
        className={['bowling__box', done ? 'bowling__box--done' : ''].filter(Boolean).join(' ')}
        role="img"
        aria-label={`볼링 레인, 핀 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
        style={{ '--tag-w': cqw(layout.spacing * 0.94), '--pin-h': cqw(PIN_H) } as React.CSSProperties}
      >
        <div className="bowling__world" style={worldStyle}>
          <span className="bowling__wall bowling__wall--l" aria-hidden="true" />
          <span className="bowling__wall bowling__wall--r" aria-hidden="true" />
          <span className="bowling__gutter bowling__gutter--l" aria-hidden="true" />
          <span className="bowling__gutter bowling__gutter--r" aria-hidden="true" />
          <span className="bowling__lane" aria-hidden="true" />
          <span
            className="bowling__deck"
            style={{ top: cqw(layout.pitY), height: cqw(layout.headY + 8 - layout.pitY) }}
            aria-hidden="true"
          />
          <span className="bowling__approach" style={{ top: cqw(layout.foulY) }} aria-hidden="true" />
          <span className="bowling__foul" style={{ top: cqw(layout.foulY) }} aria-hidden="true" />
          <span className="bowling__arrows" style={{ top: cqw(layout.arrowsY) }} aria-hidden="true">
            {Array.from({ length: 7 }, (_, k) => (
              <span key={k} style={{ left: cqw(LANE_ARROW_X(k)) }} />
            ))}
          </span>
          <span className="bowling__dots" style={{ top: cqw(layout.foulY - 12) }} aria-hidden="true" />
          <span className="bowling__pit" style={{ height: cqw(layout.pitY) }} aria-hidden="true" />
          {/* 레인 끝 벽 — 계절 가랜드와 네온 간판(금요일엔 불금 볼링). 핀 위로는 내려오지 않는다. */}
          <span className="bowling__decor" style={{ height: cqw(layout.pitY) }} aria-hidden="true">
            <span className="bowling__neon">
              {SEASON_MARK[ambience.season]} {ambience.weekday === 5 ? '불금 볼링' : `${SEASON_NAME[ambience.season]} 레인`} {WEATHER_MARK[ambience.weather]}
            </span>
          </span>
          {layout.pins.map((p, i) => (
            <span
              key={`spot-${i}`}
              className="bowling__spot"
              style={{ left: cqw(p.x), top: cqw(p.y) }}
              aria-hidden="true"
            />
          ))}

          {/* 볼러(뒷모습) — 파울 라인 뒤 */}
          <span
            className={`bowling__bowler bowling__bowler--${bowlerPose}`}
            style={
              {
                left: cqw(bowlerX),
                top: cqw(layout.bowlerY),
                '--wind': `${roll && roll.release > roll.panEnd ? roll.release - roll.panEnd : 280}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          >
            <MiniBowler holding={holding} />
          </span>

          {candidates.map((p, i) => {
            const base = layout.pins[i];
            const pf = frame?.pins[i];
            if (pf?.gone) return null;
            const x = pf?.x ?? base.x;
            const y = pf?.y ?? base.y;
            const isWin = done && i === winnerIndex;
            return (
              <div
                key={p.id}
                title={p.name}
                className={[
                  'bowling__pin',
                  pf?.down ? 'bowling__pin--down' : '',
                  pf?.wobbling ? 'bowling__pin--wobble' : '',
                  pf && pf.lift > 0 ? 'bowling__pin--lift' : '',
                  isWin ? 'bowling__pin--win' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: cqw(x),
                    top: cqw(y),
                    zIndex: isWin ? 400 : Math.round(y) + 10,
                    opacity: pf ? pf.fade : 1,
                    '--rot': `${(pf?.rot ?? 0).toFixed(1)}deg`,
                    '--lay': (pf?.lay ?? 0).toFixed(3),
                    '--lift': (pf?.lift ?? 0).toFixed(3),
                  } as React.CSSProperties
                }
              >
                {isWin && <span className="bowling__halo" aria-hidden="true" />}
                {isWin && (
                  <span className="bowling__confetti" aria-hidden="true">
                    {Array.from({ length: CONFETTI }, (_, k) => (
                      <span
                        key={k}
                        style={
                          {
                            '--a': `${(k * 360) / CONFETTI + (k % 3) * 7}deg`,
                            '--h': (k * 47) % 360,
                            '--d': `${0.8 + (k % 4) * 0.22}`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </span>
                )}
                <svg className="bowling__body" viewBox="0 0 20 50" aria-hidden="true">
                  <path
                    className="bowling__pin-shape"
                    d="M10 0.8 C13.4 0.8 14.2 4.4 13.7 8.2 C13.2 11.8 11.7 13.6 11.9 16.6 C12.1 20.6 18.4 25.6 18.4 34.6 C18.4 42.4 16 47.2 14.4 49.2 L5.6 49.2 C4 47.2 1.6 42.4 1.6 34.6 C1.6 25.6 7.9 20.6 8.1 16.6 C8.3 13.6 6.8 11.8 6.3 8.2 C5.8 4.4 6.6 0.8 10 0.8 Z"
                  />
                  <path
                    className="bowling__pin-stripe"
                    d="M6.9 11.2 L13.1 11.2 L12.6 12.9 L7.4 12.9 Z M7.6 14.3 L12.4 14.3 L12.1 15.8 L7.9 15.8 Z"
                  />
                  <ellipse className="bowling__pin-gloss" cx="7.4" cy="31" rx="1.6" ry="6.5" />
                </svg>
                <span className="bowling__tag" aria-hidden="true">
                  {tagName(p.name, isWin ? 12 : nameMax)}
                </span>
              </div>
            );
          })}

          {frame?.ball && (
            <span
              className={['bowling__ball', frame.ball.gutter ? 'bowling__ball--gutter' : ''].filter(Boolean).join(' ')}
              style={
                {
                  left: cqw(frame.ball.x),
                  top: cqw(frame.ball.y),
                  width: cqw(BALL_R * 2),
                  opacity: frame.ball.fade,
                  '--spin': `${frame.ball.spin.toFixed(0)}deg`,
                } as React.CSSProperties
              }
              aria-hidden="true"
            >
              <span className="bowling__holes" />
            </span>
          )}

          {frame?.barY !== null && frame?.barY !== undefined && (
            <span className="bowling__bar" style={{ top: cqw(frame.barY) }} aria-hidden="true" />
          )}

          {frame &&
            bubbles.map((b) => (
              <span
                key={b.key}
                className={`bowling__bubble bowling__bubble--${b.tone}`}
                style={{
                  left: cqw(Math.min(88, Math.max(12, frame.pins[b.pin].x))),
                  top: cqw(frame.pins[b.pin].y - PIN_H - 5.5),
                }}
                aria-hidden="true"
              >
                {b.text}
              </span>
            ))}
          {kicks.map((e) => (
            <span
              key={`kick-${e.t}`}
              className="bowling__ting"
              style={{ left: cqw(Math.min(90, Math.max(10, e.at!.x))), top: cqw(e.at!.y) }}
              aria-hidden="true"
            >
              팅!
            </span>
          ))}
        </div>

        {/* 화면에 붙은 효과(카메라와 상관없음). */}
        <div className="bowling__fx" aria-hidden="true">
          {plan && frame && frame.roll >= 0 && !done && (
            <span className="bowling__frames">
              {plan.rolls.map((r, k) => (
                <span
                  key={k}
                  className={[
                    'bowling__f',
                    k < frame.roll || (k === frame.roll && t !== null && t >= r.release) ? 'bowling__f--used' : '',
                    r.final ? 'bowling__f--final' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              ))}
            </span>
          )}
          {slowMo && (
            <>
              <span className="bowling__letter bowling__letter--top" />
              <span className="bowling__letter bowling__letter--bottom" />
            </>
          )}
          {callout && (
            <span key={callout.key} className={`bowling__callout bowling__callout--${callout.tone}`}>
              {callout.text}
            </span>
          )}
        </div>

        {showCut && roll && t !== null && (
          <Cutscene key={`cut-${run}`} out={stage === 'travel'} cutMs={roll.release - roll.t0} ambience={ambience} />
        )}
      </div>
      <p className="bowling__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 레인 화살표 일곱 개 — 나무판 다섯 장마다(레인 가운데 기준). */
const LANE_ARROW_X = (k: number) => 50 + (k - 3) * 10.5;

/** 파울 라인 뒤 볼러(뒷모습). 오른손에 공. */
function MiniBowler({ holding }: { holding: boolean }) {
  return (
    <svg viewBox="0 0 40 52" className="bowling__mini">
      <ellipse cx="20" cy="49" rx="12" ry="2.6" className="bowling__mini-shadow" />
      <rect x="13" y="34" width="6" height="14" rx="3" className="bowling__mini-leg" />
      <rect x="21" y="34" width="6" height="14" rx="3" className="bowling__mini-leg" />
      <rect x="11" y="17" width="18" height="20" rx="7" className="bowling__mini-shirt acc-coat" />
      <rect x="11" y="27" width="18" height="3" className="bowling__mini-stripe" />
      <g className="bowling__mini-arm">
        <rect x="27" y="19" width="5" height="15" rx="2.5" className="bowling__mini-shirt" />
        {holding && <circle cx="30" cy="36" r="5" className="bowling__mini-ball" />}
      </g>
      <rect x="8" y="19" width="5" height="14" rx="2.5" className="bowling__mini-shirt" />
      <circle cx="20" cy="11" r="8" className="bowling__mini-head" />
      <path d="M12 10 Q20 0 28 10 Q20 6 12 10 Z" className="bowling__mini-hair acc-base" />
      <path d="M11.8 11.5 Q11.8 2.6 20 2.6 Q28.2 2.6 28.2 11.5 Q20 8 11.8 11.5 Z" className="acc acc-beanie" />
      <circle cx="20" cy="2.6" r="2.3" className="acc acc-pom" />
      <path d="M10.6 16 Q9.6 1.8 20 1.8 Q30.4 1.8 29.4 16 Q27.2 7.6 20 7.6 Q12.8 7.6 10.6 16 Z" className="acc acc-hood" />
      <ellipse cx="20" cy="6.6" rx="11.5" ry="2.4" className="acc acc-brim" />
      <path d="M14.8 6.6 Q15.4 0.8 20 0.8 Q24.6 0.8 25.2 6.6 Z" className="acc acc-crown" />
      <rect x="11.5" y="17.5" width="17" height="3.2" rx="1.5" className="acc acc-scarf" />
    </svg>
  );
}

/**
 * 컷신 — 마지막 공. 볼러 옆모습 클로즈업: 공을 든 팔이 뒤로 크게 젖혀지고(휙~) 앞으로 내던진다.
 * 공을 놓으면(travel) 잠깐 흐려지며 레인으로 넘어간다.
 */
function Cutscene({ out, cutMs, ambience }: { out: boolean; cutMs: number; ambience: Ambience }) {
  return (
    <div
      className={['bowling__cut', out ? 'bowling__cut--out' : ''].filter(Boolean).join(' ')}
      style={{ '--cut': `${cutMs}ms` } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="bowling__cut-bg" />
      {/* 볼링장 창 — 바깥 계절과 날씨가 보인다 */}
      <span className="bowling__window">
        <span className="bowling__window-hz">
          <Horizon season={ambience.season} />
        </span>
        <SceneWeather weather={ambience.weather} />
      </span>
      <span className="bowling__garland" />
      <span className="bowling__speed" />
      <svg className="bowling__hero" viewBox="0 0 260 180">
        <rect x="0" y="150" width="260" height="30" className="bowling__h-floor" />
        <line x1="0" y1="150" x2="260" y2="150" className="bowling__h-floorline" />
        <ellipse cx="112" cy="152" rx="52" ry="5" className="bowling__h-shadow" />
        {/* 뒷다리(쭉 뻗음) · 앞다리(굽힘) */}
        <path d="M100 112 L60 146 L52 150" className="bowling__h-leg" />
        <path d="M112 112 L138 128 L136 150" className="bowling__h-leg" />
        <rect x="124" y="144" width="22" height="7" rx="3" className="bowling__h-shoe" />
        <rect x="42" y="145" width="18" height="7" rx="3" className="bowling__h-shoe" />
        {/* 몸(앞으로 숙임) */}
        <path d="M92 116 Q88 84 112 66 L130 70 Q130 100 118 118 Z" className="bowling__h-body acc-coat" />
        <path d="M95 104 L124 108" className="bowling__h-stripe" />
        {/* 왼팔 — 균형 잡느라 뒤로 */}
        <path d="M112 74 L84 84 L70 78" className="bowling__h-arm-l" />
        {/* 머리 */}
        <circle cx="140" cy="54" r="18" className="bowling__h-head" />
        <path d="M122 50 Q130 30 156 40 Q146 40 140 46 Q132 44 122 50 Z" className="bowling__h-hair acc-base" />
        <path d="M121.5 52 Q121.5 34 140 34 Q158.5 34 158.5 52 Q140 45 121.5 52 Z" className="acc acc-beanie" />
        <circle cx="140" cy="33" r="5" className="acc acc-pom" />
        <path d="M119 64 Q116 32 140 32 Q164 32 161 64 Q157 44 140 44 Q123 44 119 64 Z" className="acc acc-hood" />
        <ellipse cx="140" cy="42" rx="27" ry="5" className="acc acc-brim" />
        <path d="M127 42 Q129 27 140 27 Q151 27 153 42 Z" className="acc acc-crown" />
        <g className="acc acc-flower"><circle cx="127" cy="40" r="3.6" /><circle cx="132" cy="37" r="3.6" /><circle cx="129.6" cy="44" r="3.6" /><circle cx="129.5" cy="40.4" r="2.1" className="acc-flower__eye" /></g>
        <path d="M124 68 Q138 74 152 66 L153 72 Q138 80 123 74 Z" className="acc acc-scarf" />
        <circle cx="148" cy="54" r="2.6" className="bowling__h-eye" />
        <path d="M144 47 L153 46" className="bowling__h-brow" />
        <path d="M150 63 Q153 65 156 62" className="bowling__h-mouth" />
        {/* 공 든 팔 — 어깨(118,74)를 축으로 흔들린다 */}
        <g className="bowling__h-swing">
          <path d="M118 74 L118 120" className="bowling__h-arm" />
          <g className="bowling__h-ball">
            <circle cx="118" cy="132" r="15" className="bowling__h-ballbody" />
            <circle cx="113" cy="126" r="2.2" className="bowling__h-hole" />
            <circle cx="120" cy="124" r="2.2" className="bowling__h-hole" />
            <circle cx="118" cy="132" r="2.6" className="bowling__h-hole" />
          </g>
        </g>
      </svg>
      <span className="bowling__vignette" />
      <span className="bowling__letter bowling__letter--top" />
      <span className="bowling__letter bowling__letter--bottom" />
      <span className="bowling__caption">마지막 공!</span>
      <span className="bowling__sfx">휙~</span>
    </div>
  );
}
