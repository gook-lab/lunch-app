/**
 * 종이비행기 — 가게마다 색종이 비행기 한 대씩. 책상에서 한꺼번에 날려 점심 테이블까지 경주하고,
 * 하나씩 떨어져 끝까지 날아 테이블에 내려앉는 비행기가 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 비행기마다 나는 길·떨어지는 방식·사건(돌풍·공중제비·비둘기·
 * 유리창·에어컨 바람·테이블 모서리·기사회생)은 lib/plane.ts 가 판 번호(run) 시드로 정한다.
 * 테이블에 내려앉는 건 언제나 당첨이다. 축하까지 끝나면 onSpinEnd 를 한 번 부른다.
 *
 * 움직임은 Web Animations(element.animate)로 lib 의 자세 표본을 그대로 재생하고, 이름표·구겨짐·
 * 상태 문구처럼 '언제 바뀌는지'가 중요한 것은 장면 순서(planeMarks)마다 상태를 바꿔 그린다.
 * 화면은 지금 시각(now) 하나로 정해진다 — 판이 끝난 뒤 다시 그려도(크게 보기 등) 마지막 장면 그대로다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import {
  crumples,
  FLIGHT_L,
  LAND_Y,
  LIFT_AT,
  planeLayout,
  planeMarks,
  planePlan,
  planePose,
  planeSamples,
  sceneX,
  sceneY,
  TABLE_L,
  type Mark,
  type PlanePlan,
  type Pose,
} from '../../lib/plane';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { planeSfxLater, type PlaneSfxName, type SfxName } from '../../lib/sfx';
import { useAmbience } from '../../hooks/useAmbience';
import { Horizon } from './scene/Horizon';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import './PaperPlane.css';
import './PaperPlane.ambience.css';

interface PlaneState {
  run: number;
  /** 판 시작부터 지난 시각(ms) — 마지막으로 지나간 장면의 시각. Infinity 면 마지막 장면. */
  now: number;
}

/** 상태 문구가 머무는 시간. 다음 사건이 먼저 오면 그걸로 바뀐다. */
const HOLD_MS = 1100;
/** 축하 종이 조각 수. */
const CONFETTI = 12;
const IDLE: Pose = { x: 0, y: 0.12, r: 0, phase: 'desk' };
const LANDED: Pose = { x: 100, y: LAND_Y, r: 0, phase: 'landed' };

const hueOf = (i: number) => Math.round((i * 137.5 + 200) % 360);
const craftTransform = (r: number) => `translate(-50%, -50%) rotate(${r.toFixed(1)}deg)`;

/** 장면 하나의 상태 문구. 문구가 없는 장면(바닥에 닿음 등)은 null. */
function markText(m: Mark, name: (i: number) => string): string | null {
  const n = m.plane >= 0 ? name(m.plane) : '';
  switch (m.kind) {
    case 'launch':
      return '하나, 둘, 셋 — 날려요!';
    case 'gust':
      return m.plane < 0 ? '휘이잉 — 바람이 불어요!' : `${withJosa(n, '이/가')} 바람에 뒤집혔어요!`;
    case 'loop':
      return `${n} 공중제비!`;
    case 'dip':
      return `${withJosa(n, '이/가')} 떨어진다…!`;
    case 'lift':
      return '에어컨 바람에 다시 떠올라요!';
    case 'pigeonShow':
      return '앗, 비둘기다!';
    case 'pigeon':
      return `비둘기가 ${withJosa(n, '을/를')} 쳤어요!`;
    case 'window':
      return `${n} 유리창에 쾅!`;
    case 'spiral':
      return `${n} 빙글빙글 추락…`;
    case 'bounce':
      return `아깝다! ${n} 테이블 모서리에 튕겼어요`;
    case 'land':
    case 'end':
      return `${withJosa(n, '이/가')} 점심 테이블에 착륙했어요!`;
    default:
      return null;
  }
}

/** 장면마다 울릴 소리. */
function planeSounds(plan: PlanePlan, marks: Mark[]): [number, SfxName | PlaneSfxName][] {
  const out: [number, SfxName | PlaneSfxName][] = [[0, 'start'], [Math.min(...plan.tracks.map((t) => t.launchMs)), 'whoosh']];
  for (const m of marks) {
    if (m.kind === 'gust') out.push([m.ms, m.plane < 0 ? 'whoosh' : 'wobble']);
    else if (m.kind === 'loop') out.push([m.ms, 'boost']);
    else if (m.kind === 'lift') out.push([m.ms, 'boost']);
    else if (m.kind === 'dip') out.push([m.ms, 'slip']);
    else if (m.kind === 'pigeonShow') out.push([m.ms + 200, 'coo']);
    else if (m.kind === 'pigeon') out.push([m.ms, 'bump']);
    else if (m.kind === 'window') out.push([m.ms, 'glass']);
    else if (m.kind === 'spiral') out.push([m.ms, 'slip']);
    else if (m.kind === 'bounce') out.push([m.ms, 'bump']);
    else if (m.kind === 'rest' && crumples(plan.tracks[m.plane].fate)) out.push([m.ms, 'crumple']);
    else if (m.kind === 'land') out.push([m.ms, 'pop']);
  }
  return out;
}

export function PaperPlane({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [state, setState] = useState<PlaneState>({ run: -1, now: 0 });
  const layout = useMemo(() => planeLayout(count), [count]);
  // 일정은 판 번호 시드라 몇 번 계산해도 같다. 렌더에서도 지금 시각의 자세를 그리는 데 쓴다.
  const plan = useMemo(
    () => (winnerIndex === null ? null : planePlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );
  const marks = useMemo(() => (plan ? planeMarks(plan) : []), [plan]);
  const crafts = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 날지 않고 내려앉은 마지막 장면만 보인다.
      setState({ run, now: Infinity });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 장면이 안 넘어간다.
    setState({ run, now: 0 });

    const timers: number[] = [];
    for (const ms of new Set(marks.map((m) => m.ms))) {
      if (ms <= 0) continue;
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, now: ms } : s)), ms));
    }
    // 마지막 장면(end)이 먼저 그려진 뒤 끝낸다 — 같은 시각이면 먼저 건 타이머가 먼저 돈다.
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    // 비행 자체는 자세 표본을 키프레임으로 — jsdom 처럼 animate 가 없으면 장면마다 뛰어 옮겨 간다.
    const anims: Animation[] = [];
    crafts.current.slice(0, count).forEach((el, i) => {
      if (!el || typeof el.animate !== 'function') return;
      const frames = planeSamples(plan, i).map(({ offset, pose }) => ({
        offset,
        left: `${sceneX(pose.x)}%`,
        top: `${sceneY(layout, i, pose.y)}%`,
        transform: craftTransform(pose.r),
      }));
      anims.push(el.animate(frames, { duration: plan.endMs, fill: 'forwards', easing: 'linear' }));
    });

    const stopSfx = planeSfxLater(planeSounds(plan, marks));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.cancel());
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan, marks, layout]);

  if (count === 0) return <div className="plane plane--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 마지막 장면을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const now: number | null = live ? state.now : settled ? Infinity : null;
  const pose = (i: number): Pose => {
    if (now === null) return IDLE;
    if (plan) return planePose(plan, i, now);
    // 한 곳뿐 — 그 비행기가 곧장 내려앉는다.
    return now === Infinity && i === winnerIndex ? LANDED : IDLE;
  };
  const landed = now !== null && winnerIndex !== null && (plan ? now >= plan.landMs : now === Infinity);
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const nameOf = (i: number) => shortName(candidates[i].name, 12);
  const alive = plan && now !== null ? plan.tracks.filter((t) => t.fate === 'win' || t.downMs > now).length : count;

  let status: string;
  if (landed && winner) status = `${withJosa(shortName(winner.name, 12), '이/가')} 점심 테이블에 착륙했어요!`;
  else if (now === null) status = `종이비행기 ${count}대가 책상 위에서 기다려요`;
  else {
    let text: string | null = null;
    for (const m of marks) {
      if (m.ms > now) break;
      const t = markText(m, nameOf);
      if (t && now - m.ms < HOLD_MS) text = t;
    }
    status = text ?? `날아가는 중… 남은 비행기 ${alive}대`;
  }

  const total = 1 / layout.aspect;
  const laneH = (layout.lane / total) * 100;
  // 레인이 넉넉하면 이름을 두 줄까지 보인다(CSS .plane--roomy).
  const roomy = layout.lane >= 0.12;
  const nameMax = roomy ? 16 : 10;
  const showFx = live && plan !== null && now !== null && now !== Infinity;

  return (
    <div
      className={['plane', ambienceClasses(ambience), expanded ? 'plane--big' : '', roomy ? 'plane--roomy' : '', settled ? 'plane--settled' : ''].filter(Boolean).join(' ')}
      // 장면 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': layout.aspect.toFixed(4) } as React.CSSProperties}
    >
      <div
        className="plane__scene"
        role="img"
        aria-label={`종이비행기 경주, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        style={
          {
            '--head': `${(layout.head / total) * 100}%`,
            '--foot': `${(layout.foot / total) * 100}%`,
            '--desk': `${FLIGHT_L - 2}%`,
            '--table': `${TABLE_L}%`,
            '--pw': `${layout.planeW}cqw`,
          } as React.CSSProperties
        }
      >
        <span className="plane__sign plane__sign--start" aria-hidden="true">책상</span>
        <span className={['plane__sign', 'plane__sign--table', landed ? 'plane__sign--lit' : ''].filter(Boolean).join(' ')} aria-hidden="true">
          {ambience.weekday === 5 ? '🎉 불금 점심' : '🍱 점심'}
        </span>
        <span className="plane__city" aria-hidden="true" />
        <span className="plane__outside" aria-hidden="true">
          <Horizon season={ambience.season} className="plane__hz" />
          <SceneWeather weather={ambience.weather} />
        </span>
        <span className="plane__garland" aria-hidden="true" />
        <span className="plane__table" aria-hidden="true" />
        <span className="plane__floor" aria-hidden="true" />

        {candidates.map((p, i) => {
          const tr = plan?.tracks[i];
          const out = !!tr && tr.fate !== 'win' && now !== null && now >= tr.downMs;
          const isWin = landed && i === winnerIndex;
          return (
            <div
              key={p.id}
              title={p.name}
              className={['plane__lane', out ? 'plane__lane--out' : '', isWin ? 'plane__lane--win' : ''].filter(Boolean).join(' ')}
              style={{ top: `${sceneY(layout, i, -0.5)}%`, height: `${laneH}%`, '--hue': hueOf(i) } as React.CSSProperties}
            >
              <span className="plane__tag" aria-hidden="true">
                {shortName(p.name, isWin ? Math.max(12, nameMax) : nameMax)}
              </span>
            </div>
          );
        })}

        {/* 유리창 — 부딪히기 조금 전에 나타나 끝까지 남는다(부딪히면 금이 간다). */}
        {plan &&
          now !== null &&
          plan.tracks.map((t, i) => {
            if (t.fate !== 'window' || now < t.downMs - 600) return null;
            const hit = planePose(plan, i, t.downMs - 1);
            return (
              <span
                key={`w${i}`}
                className={['plane__window', now >= t.downMs ? 'plane__window--cracked' : ''].filter(Boolean).join(' ')}
                style={{ left: `calc(${sceneX(hit.x)}% + var(--pw) * 0.5)`, top: `${sceneY(layout, i, 0)}%`, height: `${laneH * 1.3}%` }}
                aria-hidden="true"
              />
            );
          })}

        {showFx && plan.gust && now >= plan.gust.ms && now < plan.gust.ms + plan.gust.durMs + 400 && (
          <span key={`g${run}`} className="plane__wind" style={{ '--dur': `${plan.gust.durMs}ms` } as React.CSSProperties} aria-hidden="true">
            {Array.from({ length: 9 }, (_, k) => (
              <span key={k} className="plane__gust" style={{ top: `${10 + ((k * 37) % 80)}%`, '--k': k } as React.CSSProperties} />
            ))}
          </span>
        )}

        {/* 비둘기 — 오른쪽에서 날아와 비행기와 부딪히고 위로 달아난다. */}
        {showFx &&
          plan.tracks.map((t, i) => {
            if (t.fate !== 'pigeon' || now < t.downMs - 700 || now >= t.restMs) return null;
            const hit = planePose(plan, i, t.downMs);
            const y1 = sceneY(layout, i, hit.y - 0.15);
            return (
              <span
                key={`p${i}`}
                className="plane__pigeon"
                style={
                  {
                    '--x0': '102%',
                    '--x1': `calc(${sceneX(hit.x)}% + var(--pw) * 0.55)`,
                    '--x2': `calc(${sceneX(hit.x)}% + var(--pw) * 2.5)`,
                    '--y0': `${y1 - 3}%`,
                    '--y1': `${y1}%`,
                    '--y2': `${Math.max(2, y1 - 30)}%`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                🐦
              </span>
            );
          })}

        {/* 에어컨 — 바닥에서 바람을 올려 보내 떨어지던 비행기를 띄운다. */}
        {showFx &&
          plan.flourishes.map((f) => {
            if (f.kind === 'loop' || now < f.ms || now > f.ms + f.durMs + 600) return null;
            const at = planePose(plan, f.plane, f.ms + f.durMs * LIFT_AT);
            return (
              <span
                key={`a${f.ms}`}
                className="plane__ac"
                style={
                  {
                    left: `${sceneX(at.x)}%`,
                    '--reach': `${100 - sceneY(layout, f.plane, at.y)}%`,
                    '--lift': `${Math.round(f.durMs * LIFT_AT)}ms`,
                    '--dur': `${f.durMs + 500}ms`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                <span className="plane__breeze" />
                <span className="plane__unit" />
              </span>
            );
          })}

        {candidates.map((p, i) => {
          const ps = pose(i);
          const tr = plan?.tracks[i];
          const rested = !!tr && tr.fate !== 'win' && now !== null && now >= tr.restMs;
          const crumpled = rested && crumples(tr!.fate);
          const isWin = landed && i === winnerIndex;
          return (
            <div
              key={p.id}
              ref={(el) => {
                crafts.current[i] = el;
              }}
              className={[
                'plane__craft',
                ps.phase === 'fall' ? 'plane__craft--falling' : '',
                rested ? 'plane__craft--down' : '',
                crumpled ? 'plane__craft--crumpled' : '',
                isWin ? 'plane__craft--win' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  left: `${sceneX(ps.x)}%`,
                  top: `${sceneY(layout, i, ps.y)}%`,
                  transform: craftTransform(ps.r),
                  '--hue': hueOf(i),
                } as React.CSSProperties
              }
              aria-hidden="true"
            >
              <span className="plane__paper">
                <span className="plane__wing" />
                <span className="plane__fold" />
              </span>
              <span className="plane__ball" />
            </div>
          );
        })}

        {/* 내려앉으면 테이블 위로 색종이 조각이 터진다. */}
        {live && landed && winnerIndex !== null && now !== Infinity && (
          <span
            className="plane__confetti"
            style={{ left: `${sceneX(100)}%`, top: `${sceneY(layout, winnerIndex, LAND_Y)}%` }}
            aria-hidden="true"
          >
            {Array.from({ length: CONFETTI }, (_, k) => (
              <span
                key={k}
                style={{ '--a': `${(k * 360) / CONFETTI + 8}deg`, '--hue': hueOf(k + 3), '--d': `${(k % 3) * 0.25 + 0.8}` } as React.CSSProperties}
              />
            ))}
          </span>
        )}
      </div>
      <p className="plane__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
