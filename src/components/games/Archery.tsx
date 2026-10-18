/**
 * 활쏘기 — 가게 이름표를 단 과녁들이 사로에 서 있고, 궁수가 화살 세 발을 쏜다.
 * 정중앙에 꽂힌 과녁이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 과녁 자리·흔들림 박자는 후보 수마다 한 번, 화살 세 발의
 * 사건·시각·궤적은 판 번호 run 시드로 lib/archery.ts 가 정한다. 마지막 화살은 언제나 당첨 정중앙이다.
 *
 * 한 발마다: 컷신(궁수 클로즈업 — 시위가 끼이익 늘어나고 화면이 조여 든다) → 푸슝(속도선·화면 흔들림)
 * → 카메라가 화살을 따라간다(마지막 발은 슬로모션) → 닿음(사건). 사건은 바람·튕김·빗나감·아깝다·새·로빈후드.
 * 마지막 화살이 꽂히면 번쩍이고 카메라가 물러나며 꽃가루가 터진 뒤 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import {
  archeryPlan,
  cameraAt,
  flightPath,
  rangeLayout,
  settleMs,
  shotEnd,
  SHOTS,
  type RangeLayout,
  type Shot,
} from '../../lib/archery';
import { seededRandom } from '../../lib/random';
import { archerySfxLater, type ArcherySfx } from '../../lib/sfx';
import type { SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import type { AmbienceWeather } from '../../lib/ambience';
import { Horizon } from './scene/Horizon';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import './Archery.css';
import './Archery.ambience.css';

/**
 * draw: 컷신 — 시위를 당긴다 · release: 푸슝 · fly: 카메라가 화살을 따라간다
 * · impact: 닿음(사건) · settle: 카메라가 물러나고 당첨 과녁이 빛난다(마지막 장면).
 */
type Phase = 'draw' | 'release' | 'fly' | 'impact' | 'settle';

interface ArcheryState {
  run: number;
  shot: number;
  phase: Phase;
}

/** 과녁 자리는 후보 수마다 한 번 정한다 — 판마다 바뀌면 아까 그 과녁을 눈으로 따라갈 수 없다. */
const LAYOUT_SEED = 11;
/** 카메라 배율: 앞 두 발 · 마지막 발. */
const ZOOM = 1.7;
const FINAL_ZOOM = 2.3;
/** 꽃가루 조각 수. */
const CONFETTI = 16;

const isFinal = (s: Shot) => s.kind === 'bullseye' || s.kind === 'split';
const ORDER: Record<Phase, number> = { draw: 0, release: 1, fly: 2, impact: 3, settle: 4 };

const pct = (n: number) => `${n.toFixed(2)}%`;

/** 카메라 transform 한 장. */
function cam(x: number, y: number, zoom: number): string {
  const { tx, ty } = cameraAt(x, y, zoom);
  return `translate(${pct(tx)}, ${pct(ty)}) scale(${zoom})`;
}

/** 꽂힌 화살 꼬리가 궁수 쪽을 향하는 각(도). 화살은 궁수에게서 날아왔다. */
function tailAngle(layout: RangeLayout, x: number, y: number): number {
  const dx = layout.bow.x - x;
  const dy = (layout.bow.y - y) / layout.aspect;
  return (Math.atan2(-dx, dy) * 180) / Math.PI;
}

export function Archery({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const ambience = useAmbience();
  const { season, weather } = ambience;
  const [state, setState] = useState<ArcheryState>({ run: -1, shot: 0, phase: 'draw' });
  const layout = useMemo(() => rangeLayout(count, seededRandom(LAYOUT_SEED + count)), [count]);
  // 일정은 판 번호 시드라 몇 번 계산해도 같다. 궤적·사건을 그리려고 렌더에서도 쓴다.
  const plan = useMemo(
    () => (winnerIndex === null ? null : archeryPlan(count, winnerIndex, layout.cols, seededRandom(run))),
    [count, winnerIndex, run, layout.cols],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 쏘는 장면 없이 꽂힌 모습만 보인다.
      setState({ run, shot: SHOTS - 1, phase: 'settle' });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 첫 컷신에서 멈춘다.
    setState({ run, shot: 0, phase: 'draw' });

    const timers: number[] = [];
    const at = (ms: number, shot: number, phase: Phase) =>
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, shot, phase } : s)), ms));
    const sounds: [number, ArcherySfx | SfxName][] = [];
    plan.shots.forEach((s, k) => {
      if (k > 0) at(s.drawMs, k, 'draw');
      at(s.releaseMs, k, 'release');
      at(s.flyMs, k, 'fly');
      at(s.impactMs, k, 'impact');
      sounds.push([s.drawMs + 60, 'creak'], [s.releaseMs, 'twang']);
      if (s.kind === 'wind') sounds.push([s.flyMs + 80, 'whoosh']);
      if (s.bird) sounds.push([s.flyMs + 120, 'tweet']);
      if (s.kind === 'ricochet') sounds.push([s.impactMs, 'ting']);
      else if (s.kind === 'miss') sounds.push([s.impactMs - 120, 'whoosh']);
      else sounds.push([s.impactMs, 'thwack']);
      if (s.kind === 'close') sounds.push([s.impactMs + 160, 'wobble']);
      if (s.kind === 'split') sounds.push([s.impactMs + 120, 'pop']);
    });
    const last = plan.shots[plan.shots.length - 1];
    at(settleMs(last), SHOTS - 1, 'settle');
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const stopSfx = archerySfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="archery archery--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 꽂힌 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const phase: Phase | null = live ? state.phase : settled ? 'settle' : null;
  const shotIdx = live ? state.shot : SHOTS - 1;
  const shots = plan?.shots ?? [];
  const shot: Shot | null = phase && phase !== 'settle' ? (shots[shotIdx] ?? null) : null;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const finalShot = shots.at(-1) ?? null;
  const splitDone = finalShot?.kind === 'split' && (phase === 'settle' || (shot === finalShot && phase === 'impact'));
  // 이름표는 두 줄까지(10/18 리뷰) — 한 줄 6자에서 '한 그릇 …' 처럼 잘렸다. 줄은 CSS 가 접는다.
  const nameMax = expanded ? 16 : 12;
  const name = (i: number | null) => (i === null ? '' : shortName(candidates[i].name, 10));

  /** 이 발이 지금 꽂혀 있는가(닿은 뒤부터 판 끝까지). */
  const landed = (k: number) =>
    phase !== null && (phase === 'settle' ? k < shots.length : k < shotIdx || (k === shotIdx && ORDER[phase] >= ORDER.impact));

  // 꽂힌 화살들 — 과녁마다 모은다. 한 곳뿐(plan 없음)이면 당첨 정중앙 하나.
  const stuck = new Map<number, { k: number; dx: number; dy: number; split: boolean; fin: boolean }[]>();
  shots.forEach((s, k) => {
    if (s.hit === null || !landed(k)) return;
    // 로빈후드가 쪼갠 화살은 쪼개지는 장면(impact) 뒤로는 보이지 않는다.
    const split = s.kind === 'close' && s.hit === winnerIndex && splitDone;
    if (split && phase === 'settle') return;
    const list = stuck.get(s.hit) ?? [];
    list.push({ k, dx: s.dx, dy: s.dy, split, fin: isFinal(s) });
    stuck.set(s.hit, list);
  });
  if (!plan && phase === 'settle' && winnerIndex !== null) stuck.set(winnerIndex, [{ k: 0, dx: 0, dy: 0, split: false, fin: true }]);

  // 카메라와 화살 궤적.
  const zoom = shot && isFinal(shot) ? FINAL_ZOOM : ZOOM;
  const path = shot ? flightPath(layout, shot) : null;
  const end = shot ? shotEnd(layout, shot) : null;
  const flyMs = shot ? shot.impactMs - shot.flyMs : 0;
  let worldStyle: React.CSSProperties = {};
  if (shot && path && end) {
    if (phase === 'draw' || phase === 'release') worldStyle = { transform: cam(layout.bow.x, layout.bow.y, zoom) };
    else if (phase === 'fly') {
      const v: Record<string, string> = { '--fly': `${flyMs}ms` };
      path.forEach((p, k) => (v[`--c${k}`] = cam(p.x, p.y, zoom)));
      worldStyle = v as React.CSSProperties;
    } else if (phase === 'impact') worldStyle = { transform: cam(end.x, end.y, zoom) };
  }
  const arrowStyle: Record<string, string> = {};
  if (path && phase === 'fly') {
    arrowStyle['--fly'] = `${flyMs}ms`;
    path.forEach((p, k) => {
      arrowStyle[`--x${k}`] = pct(p.x);
      arrowStyle[`--y${k}`] = pct(p.y);
      arrowStyle[`--a${k}`] = `${p.angle.toFixed(1)}deg`;
      // 멀어질수록 작아진다.
      arrowStyle[`--s${k}`] = (1 - 0.42 * (k / (path.length - 1))).toFixed(3);
    });
  }

  // 새: 화살이 궤적 가운데를 지날 때 새도 그 자리를 지난다.
  const birdStyle = (() => {
    if (!shot?.bird || !path || (phase !== 'release' && phase !== 'fly' && phase !== 'impact')) return null;
    const mid = path[2];
    const durMs = 1100;
    const fromLeft = shot.dx >= 0;
    const share = fromLeft ? (mid.x + 12) / 124 : (112 - mid.x) / 124;
    // 지연은 이 요소가 생긴 때(release)부터 잰다.
    const delay = shot.flyMs - shot.releaseMs + flyMs / 2 - durMs * share;
    return {
      fromLeft,
      style: { top: pct(mid.y - 4), '--bird-dur': `${durMs}ms`, '--bird-delay': `${Math.round(delay)}ms` } as React.CSSProperties,
    };
  })();

  const status = (() => {
    if (phase === 'settle' && winner) {
      const n = shortName(winner.name, 12);
      return finalShot?.kind === 'split' ? `로빈후드! ${n} 정중앙, 화살까지 쪼갰어요` : `명중! ${n} 정중앙이에요`;
    }
    if (!shot) return `과녁 ${count}개 — 정중앙을 맞히면 당첨!`;
    const final = isFinal(shot);
    if (phase === 'draw') return final ? '마지막 화살 — 숨을 고르고…' : `${shotIdx + 1}번째 화살 — 활시위를 당겨요…`;
    if (phase === 'release') return '푸슝!';
    if (phase === 'fly') {
      if (shot.kind === 'wind') return '바람이 불어요!';
      if (shot.bird) return '앗, 새가 지나가요!';
      return final ? '명중할까…?' : '화살이 날아가요…';
    }
    switch (shot.kind) {
      case 'plain':
        return `${name(shot.hit)} 가장자리 — 정중앙이 아니에요`;
      case 'wind':
        return `바람에 휘어 ${name(shot.hit)}에 꽂혔어요`;
      case 'ricochet':
        return `팅! ${name(shot.aim)} 테에 맞고 튕겨 나갔어요`;
      case 'miss':
        return '빗나갔어요! 하늘로 슝~';
      case 'close':
        return `아깝다! ${name(shot.hit)} 정중앙 바로 옆이에요`;
      case 'split':
        return '로빈후드! 앞 화살을 쪼갰어요';
      default:
        return '명중!';
    }
  })();

  // 화면 가운데 큰 글씨(만화 효과음). 컷신 안 글씨(끼이익·푸슝)는 컷신이 따로 그린다.
  const callout = (() => {
    if (!shot) return null;
    if (phase === 'fly') {
      if (shot.kind === 'wind') return { text: '휘잉~', tone: 'wind' };
      if (shot.bird) return { text: '짹짹!', tone: 'bird' };
      return null;
    }
    if (phase !== 'impact') return null;
    const map: Record<Shot['kind'], [string, string]> = {
      plain: ['퍽!', 'plain'],
      wind: ['옆 과녁!', 'plain'],
      ricochet: ['팅!', 'ting'],
      miss: ['빗나감~', 'plain'],
      close: ['아깝다!', 'close'],
      bullseye: ['명중!', 'hit'],
      split: ['로빈후드!', 'hit'],
    };
    const [text, tone] = map[shot.kind];
    return { text, tone };
  })();

  const cut = shot && (phase === 'draw' || phase === 'release' || phase === 'fly');
  const final = shot ? isFinal(shot) : false;

  return (
    <div
      className={[
        'archery',
        expanded ? 'archery--big' : '',
        settled ? 'archery--settled' : '',
        ambienceClasses(ambience),
      ]
        .filter(Boolean)
        .join(' ')}
      // 사로 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': layout.aspect.toFixed(4) } as React.CSSProperties}
    >
      <div
        className={['archery__range', phase === 'release' ? 'archery__range--shake' : '', phase === 'impact' && shot && isFinal(shot) ? 'archery__range--hit' : '']
          .filter(Boolean)
          .join(' ')}
        role="img"
        aria-label={`활쏘기 사로, 과녁 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
        style={{ '--size': `${layout.size}cqw`, '--cell-w': `${layout.cellW}cqw`, '--sky': pct(layout.sky), '--line': pct(layout.line) } as React.CSSProperties}
      >
        <div
          className={['archery__world', phase === 'fly' ? 'archery__world--fly' : '', phase === 'settle' ? 'archery__world--settle' : '']
            .filter(Boolean)
            .join(' ')}
          style={worldStyle}
        >
          {/* 지평선 나무 — 계절마다 벚꽃·초록·단풍·눈. 과녁보다 뒤. */}
          <span className="archery__horizon" aria-hidden="true">
            <Horizon season={season} />
          </span>
          <span className="archery__line" style={{ top: pct(layout.line) }} aria-hidden="true" />
          {candidates.map((p, i) => {
            const t = layout.targets[i];
            const touched =
              !!shot &&
              phase === 'impact' &&
              (shot.hit === i || (shot.kind === 'ricochet' && shot.aim === i));
            const isWin = phase === 'settle' && i === winnerIndex;
            return (
              <div
                key={p.id}
                title={p.name}
                className={[
                  'archery__target',
                  touched ? 'archery__target--wobble' : '',
                  isWin ? 'archery__target--win' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: pct(t.x),
                    top: pct(t.y),
                    '--slide': `${t.slide}cqw`,
                    '--period': `${t.periodMs}ms`,
                    '--delay': `${t.delayMs}ms`,
                  } as React.CSSProperties
                }
              >
                <span className="archery__face" aria-hidden="true">
                  {(stuck.get(i) ?? []).map((a) => (
                    <span
                      key={a.k}
                      className={[
                        'archery__stuck',
                        a.fin ? 'archery__stuck--final' : '',
                        a.split ? 'archery__stuck--split' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={
                        {
                          left: pct(50 + a.dx * 50),
                          top: pct(50 + a.dy * 50),
                          '--tail': `${tailAngle(layout, t.x + (a.dx * layout.size) / 2, t.y + (a.dy * layout.size * layout.aspect) / 2).toFixed(1)}deg`,
                        } as React.CSSProperties
                      }
                    >
                      <span className="archery__shaft" />
                      {a.split && (
                        <>
                          <span className="archery__shard archery__shard--l" />
                          <span className="archery__shard archery__shard--r" />
                        </>
                      )}
                    </span>
                  ))}
                  {isWin && phase === 'settle' && (
                    <span className="archery__confetti">
                      {Array.from({ length: CONFETTI }, (_, k) => (
                        <span
                          key={k}
                          style={{ '--a': `${(k * 360) / CONFETTI + (k % 3) * 7}deg`, '--h': (k * 47) % 360, '--d': `${0.8 + (k % 4) * 0.22}` } as React.CSSProperties}
                        />
                      ))}
                    </span>
                  )}
                </span>
                <span className="archery__tag" aria-hidden="true" title={p.name}>
                  {shortName(p.name, isWin ? 12 : nameMax)}
                </span>
              </div>
            );
          })}

          {/* 날아가는 화살. key 를 발마다 바꿔 키프레임이 처음부터 돈다. */}
          {phase === 'fly' && path && (
            <span key={`${run}-${shotIdx}`} className={['archery__arrow', final ? 'archery__arrow--slow' : ''].filter(Boolean).join(' ')} style={arrowStyle as React.CSSProperties} aria-hidden="true" />
          )}
          {/* 튕겨 나간 화살 — 테에서 옆으로 튀어 떨어진다. */}
          {phase === 'impact' && shot?.kind === 'ricochet' && end && (
            <span
              className={['archery__bounce', shot.dx < 0 ? 'archery__bounce--left' : ''].filter(Boolean).join(' ')}
              style={{ left: pct(end.x), top: pct(end.y) }}
              aria-hidden="true"
            />
          )}
          {/* 빗나간 화살은 하늘 끝에서 별처럼 반짝 사라진다. */}
          {phase === 'impact' && shot?.kind === 'miss' && end && (
            <span className="archery__twinkle" style={{ left: pct(Math.min(94, Math.max(6, end.x))), top: pct(layout.sky * 0.4) }} aria-hidden="true" />
          )}
          {birdStyle && (
            <span
              key={`bird-${run}-${shotIdx}`}
              className={['archery__bird', birdStyle.fromLeft ? '' : 'archery__bird--rtl'].filter(Boolean).join(' ')}
              style={birdStyle.style}
              aria-hidden="true"
            >
              <span className="archery__wing" />
            </span>
          )}

          {/* 사로 아래 궁수(뒷모습). 컷신이 끝나면 여기서 화살이 출발한다. */}
          <span
            className={['archery__me', phase === 'release' || phase === 'fly' ? 'archery__me--shot' : ''].filter(Boolean).join(' ')}
            style={{ left: pct(layout.bow.x), top: pct(layout.bow.y) }}
            aria-hidden="true"
          >
            <MiniArcher />
          </span>
        </div>

        <SceneWeather weather={weather} band={[0, layout.sky]} />
        {/* 화면에 붙은 효과(카메라 배율과 상관없음). */}
        <div className="archery__fx" aria-hidden="true">
          {phase && phase !== 'settle' && (
            <span className="archery__quiver">
              {Array.from({ length: SHOTS }, (_, k) => (
                <span key={k} className={k < shotIdx || (k === shotIdx && ORDER[phase] >= ORDER.fly) ? 'archery__q archery__q--used' : 'archery__q'} />
              ))}
            </span>
          )}
          {phase === 'fly' && final && (
            <>
              <span className="archery__bar archery__bar--top" />
              <span className="archery__bar archery__bar--bottom" />
            </>
          )}
          {phase === 'fly' && shot?.kind === 'wind' && end && (
            <span
              className={['archery__wind', layout.targets[shot.aim].x > end.x ? 'archery__wind--left' : ''].filter(Boolean).join(' ')}
            />
          )}
          {phase === 'impact' && final && <span className="archery__flash" />}
          {callout && (
            <span key={`${run}-${shotIdx}-${phase}`} className={`archery__callout archery__callout--${callout.tone}`}>
              {callout.text}
            </span>
          )}
        </div>

        {cut && shot && (
          <Cutscene key={`${run}-${shotIdx}`} phase={phase} final={final} shot={shotIdx} drawMs={shot.releaseMs - shot.drawMs} weather={weather} />
        )}
      </div>
      <p className="archery__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 사로 아래 작은 궁수(뒷모습) — 초록 모자에 깃털, 왼손에 활. */
function MiniArcher() {
  return (
    <svg viewBox="0 0 40 46" className="archery__mini">
      <ellipse cx="20" cy="43" rx="12" ry="2.6" className="archery__mini-shadow" />
      <rect x="11" y="22" width="18" height="19" rx="7" className="archery__mini-body" />
      <circle cx="20" cy="15" r="9" className="archery__mini-head" />
      <path d="M10 14 Q20 1 30 14 Z" className="archery__mini-hat acc-base" />
      <path d="M27 9 q6 -6 9 -3" className="archery__mini-feather acc-base" />
      {/* 계절·날씨 덧옷 — 루트의 outfit--* 가 하나만 켠다(Archery.ambience.css). */}
      <rect x="12" y="21" width="16" height="3.4" rx="1.5" className="acc acc-scarf" />
      <path d="M11 14 Q11 5 20 5 Q29 5 29 14 Z" className="acc acc-beanie" />
      <circle cx="20" cy="4.4" r="2.6" className="acc acc-pom" />
      <path d="M10 17 Q9 4 20 4 Q31 4 30 17 Q27 9 20 9 Q13 9 10 17 Z" className="acc acc-hood" />
      <ellipse cx="20" cy="11" rx="13" ry="2.6" className="acc acc-brim" />
      <path d="M14 11 Q20 2 26 11 Z" className="acc acc-crown" />
      <circle cx="25" cy="8" r="2.2" className="acc acc-flower" />
      <path d="M33 4 Q41 18 33 32" className="archery__mini-bow" />
      <line x1="33" y1="4" x2="33" y2="32" className="archery__mini-string" />
    </svg>
  );
}

/**
 * 컷신 — 궁수 옆모습 클로즈업. draw 동안 시위가 늘어나고(끼이익) 화면이 조여 들고,
 * release 에 화살이 푸슝 튀어 나간다. fly 가 시작되면 잠깐 흐려지며 사로로 넘어간다.
 *
 * 시위는 활 끝(위·아래)에 매단 두 줄이다. 끝을 축으로 θ 돌리고 길이를 1/cos θ 로 늘리면
 * 두 줄이 만나는 점(오늬)이 정확히 L·tan θ 만큼 뒤로 간다 — 화살·당기는 손도 그만큼 뒤로 간다(CSS).
 */
function Cutscene({ phase, final, shot, drawMs, weather }: { phase: Phase | null; final: boolean; shot: number; drawMs: number; weather: AmbienceWeather }) {
  return (
    <div
      className={[
        'archery__cut',
        phase === 'release' ? 'archery__cut--release' : '',
        phase === 'fly' ? 'archery__cut--out' : '',
        final ? 'archery__cut--final' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--draw': `${drawMs}ms` } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="archery__cut-bg" />
      <SceneWeather weather={weather} band={[0, 70]} />
      {final && <span className="archery__focus" />}
      <span className="archery__speed" />
      <svg className="archery__hero" viewBox="0 0 260 180">
        <ellipse cx="96" cy="170" rx="46" ry="6" className="archery__h-shadow" />
        {/* 화살통(등) */}
        <g className="archery__h-quiver">
          <rect x="52" y="86" width="16" height="44" rx="5" transform="rotate(-18 60 108)" />
          <path d="M48 84 l-6 -12 l6 3 l3 -6 l1 13 z M58 82 l-3 -13 l5 4 l4 -5 l-1 13 z" className="archery__h-fletch" />
        </g>
        {/* 다리·몸 */}
        <rect x="80" y="140" width="11" height="26" rx="5" className="archery__h-leg" />
        <rect x="99" y="140" width="11" height="26" rx="5" className="archery__h-leg" />
        <path d="M72 104 Q72 94 84 94 L106 94 Q118 94 118 104 L120 146 Q120 150 116 150 L76 150 Q72 150 72 146 Z" className="archery__h-body" />
        <rect x="72" y="128" width="48" height="6" className="archery__h-belt" />
        {/* 활 든 팔 */}
        <line x1="104" y1="104" x2="176" y2="100" className="archery__h-arm" />
        {/* 머리 */}
        <circle cx="94" cy="70" r="26" className="archery__h-head" />
        <path d="M64 66 Q90 22 126 60 Q100 52 64 66 Z" className="archery__h-hat acc-base" />
        <path d="M70 58 Q52 34 40 40 Q54 44 64 62 Z" className="archery__h-feather acc-base" />
        {/* 계절·날씨 덧옷 */}
        <path d="M74 92 Q94 104 114 92 L116 101 Q94 113 72 101 Z" className="acc acc-scarf" />
        <path d="M82 102 l-4 24 l9 1 l3 -23 Z" className="acc acc-scarf" />
        <path d="M67 64 Q66 38 94 38 Q122 38 121 64 Q94 56 67 64 Z" className="acc acc-beanie" />
        <circle cx="94" cy="36" r="8" className="acc acc-pom" />
        <path d="M62 80 Q56 34 94 32 Q132 34 126 80 Q122 56 94 52 Q66 56 62 80 Z" className="acc acc-hood" />
        <ellipse cx="94" cy="54" rx="46" ry="8" className="acc acc-brim" />
        <path d="M70 54 Q72 30 94 30 Q116 30 118 54 Z" className="acc acc-crown" />
        <g className="acc acc-flower">
          <circle cx="80" cy="44" r="5" />
          <circle cx="88" cy="40" r="5" />
          <circle cx="84" cy="50" r="5" />
          <circle cx="84" cy="44" r="3" className="acc-flower__eye" />
        </g>
        <g className="archery__h-eye-open">
          <ellipse cx="108" cy="70" rx="3.6" ry="4.6" />
          <circle cx="109.4" cy="68.4" r="1.3" className="archery__h-glint" />
        </g>
        <path d="M102 70 Q108 66 114 70" className="archery__h-eye-focus" />
        <path d="M100 62 L114 59" className="archery__h-brow" />
        <circle cx="102" cy="81" r="4.5" className="archery__h-blush" />
        <path d="M110 86 Q114 88 117 85" className="archery__h-mouth" />
        {/* 활·시위 */}
        <path d="M158 52 Q198 100 158 148" className="archery__h-bow" />
        <line x1="158" y1="52" x2="158" y2="100" className="archery__h-string archery__h-string--top" />
        <line x1="158" y1="148" x2="158" y2="100" className="archery__h-string archery__h-string--bottom" />
        <circle cx="178" cy="100" r="7" className="archery__h-hand" />
        {/* 화살 — 오늬가 시위 가운데(158,100) */}
        <g className="archery__h-arrow">
          <line x1="158" y1="100" x2="244" y2="100" className="archery__h-shaft" />
          <path d="M244 94 L258 100 L244 106 Z" className="archery__h-tip" />
          <path d="M158 100 L150 93 L170 93 L176 100 Z M158 100 L150 107 L170 107 L176 100 Z" className="archery__h-fletching" />
        </g>
        {/* 당기는 손 — 오늬를 잡고 같이 뒤로 */}
        <circle cx="158" cy="100" r="7.5" className="archery__h-hand archery__h-pull" />
      </svg>
      <span className="archery__vignette" />
      <span className="archery__bar archery__bar--top" />
      <span className="archery__bar archery__bar--bottom" />
      <span className="archery__caption">{final ? '마지막 화살!' : `${shot + 1} / ${SHOTS}`}</span>
      <span className="archery__sfx archery__sfx--draw">끼이익…</span>
      <span className="archery__sfx archery__sfx--shoot">푸슝!</span>
    </div>
  );
}
