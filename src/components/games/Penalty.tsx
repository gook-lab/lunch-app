/**
 * 승부차기 — 골문 입구를 가게 이름표를 단 구역으로 나누고, 키커가 공 세 개를 찬다.
 * 골망을 흔든 구역이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 구역 자리는 후보 수로, 슛 세 번의 사건·시각·궤적·골키퍼 다이빙은
 * 판 번호 run 시드로 lib/penalty.ts 가 정한다. 마지막 슛은 언제나 당첨 구역 골망에 꽂힌다.
 *
 * 한 번마다: 컷신(눈싸움 — 키커와 골키퍼가 노려본다 → 도움닫기 → 뻥! 속도선·공 회전)
 * → 카메라가 공을 따라간다(마지막 슛은 슬로모션) → 닿음(사건). 사건은 선방·골대 깡·홈런·캐치·크로스바 맞고 라인 앞.
 * 마지막 슛이 들어가면 골망이 출렁이고 꽃가루·관중 파도타기 뒤 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import {
  ballPath,
  cameraAt,
  isFinal,
  keeperMove,
  penaltyPlan,
  pitchLayout,
  settleMs,
  SHOTS,
  type PitchLayout,
  type Shot,
} from '../../lib/penalty';
import { seededRandom } from '../../lib/random';
import { penaltySfxLater, type PenaltySfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import './Penalty.css';

/**
 * stare: 컷신 — 눈싸움 · run: 도움닫기 · kick: 뻥 · fly: 카메라가 공을 따라간다
 * · impact: 닿음(사건) · settle: 카메라가 물러나고 당첨 구역이 빛난다(마지막 장면).
 */
type Phase = 'stare' | 'run' | 'kick' | 'fly' | 'impact' | 'settle';

interface PenaltyState {
  run: number;
  shot: number;
  phase: Phase;
}

const ORDER: Record<Phase, number> = { stare: 0, run: 1, kick: 2, fly: 3, impact: 4, settle: 5 };
/** 카메라 배율: 앞 두 슛 · 마지막 슛. */
const ZOOM = 1.35;
const FINAL_ZOOM = 1.7;
/** 관중 앞줄 머릿수(파도타기). */
const FANS = 22;
const CONFETTI = 18;

const pct = (n: number) => `${n.toFixed(2)}%`;
const cqw = (n: number) => `${n.toFixed(2)}cqw`;

function cam(x: number, y: number, zoom: number): string {
  const { tx, ty } = cameraAt(x, y, zoom);
  return `translate(${pct(tx)}, ${pct(ty)}) scale(${zoom})`;
}

/** 공이 닿은 뒤 움직임에 쓰는 값(폭 단위 cqw). */
function afterVars(layout: PitchLayout, shot: Shot): React.CSSProperties {
  const dir = shot.post !== 0 ? -shot.post : shot.x < 50 ? -1 : 1;
  // 크로스바에서 골라인 바로 앞까지 떨어지는 거리.
  const drop = (layout.goal.bottom + 2.5 - shot.y) / layout.aspect;
  return { '--dir': dir, '--drop': cqw(drop) } as React.CSSProperties;
}

export function Penalty({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [state, setState] = useState<PenaltyState>({ run: -1, shot: 0, phase: 'stare' });
  const layout = useMemo(() => pitchLayout(count), [count]);
  const plan = useMemo(
    () => (winnerIndex === null ? null : penaltyPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 차는 장면 없이 골망에 꽂힌 모습만 보인다.
      setState({ run, shot: SHOTS - 1, phase: 'settle' });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 첫 컷신에서 멈춘다.
    setState({ run, shot: 0, phase: plan.shots[0].runMs > plan.shots[0].stareMs ? 'stare' : 'run' });

    const timers: number[] = [];
    const at = (ms: number, shot: number, phase: Phase) =>
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, shot, phase } : s)), ms));
    const sounds: [number, PenaltySfxName | SfxName][] = [];
    plan.shots.forEach((s, k) => {
      const stare = s.runMs > s.stareMs;
      if (k > 0) at(s.stareMs, k, stare ? 'stare' : 'run');
      if (stare) {
        at(s.runMs, k, 'run');
        sounds.push([s.stareMs + 40, 'whistle']);
      }
      at(s.kickMs, k, 'kick');
      at(s.flyMs, k, 'fly');
      at(s.impactMs, k, 'impact');
      sounds.push([s.runMs + 30, 'steps'], [s.kickMs, 'kick']);
      if (s.kind === 'save') sounds.push([s.impactMs, 'glove'], [s.impactMs + 160, 'groan']);
      else if (s.kind === 'catch') sounds.push([s.impactMs, 'glove'], [s.impactMs + 200, 'groan']);
      else if (s.kind === 'post' || s.kind === 'bar') sounds.push([s.impactMs, 'clang'], [s.impactMs + 220, 'groan']);
      else if (s.kind === 'over') sounds.push([s.impactMs - 120, 'whoosh'], [s.impactMs + 100, 'groan']);
      else sounds.push([s.impactMs, 'net'], [s.impactMs + 60, 'roar'], [s.impactMs + 260, 'chime']);
    });
    const last = plan.shots[plan.shots.length - 1];
    at(settleMs(last), SHOTS - 1, 'settle');
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const stopSfx = penaltySfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="penalty penalty--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 골망에 꽂힌 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const phase: Phase | null = live ? state.phase : settled ? 'settle' : null;
  const shotIdx = live ? state.shot : SHOTS - 1;
  const shots = plan?.shots ?? [];
  const shot: Shot | null = phase && phase !== 'settle' ? (shots[shotIdx] ?? null) : null;
  const finalShot = shots.at(-1) ?? null;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const final = shot ? isFinal(shot) : false;
  const nameMax = expanded ? 8 : layout.maxCols >= 5 ? 5 : layout.maxCols >= 4 ? 6 : 8;
  const name = (i: number) => shortName(candidates[i].name, 10);
  const miss = shot && phase === 'impact' && !final;

  // 카메라와 공 궤적.
  const zoom = final ? FINAL_ZOOM : ZOOM;
  const path = shot ? ballPath(layout, shot) : null;
  let worldStyle: React.CSSProperties = {};
  if (shot && path) {
    if (phase === 'fly') {
      const v: Record<string, string> = { '--fly': `${shot.impactMs - shot.flyMs}ms` };
      path.forEach((p, k) => (v[`--c${k}`] = cam(p.x, p.y, zoom)));
      worldStyle = v as React.CSSProperties;
    } else if (phase === 'impact') worldStyle = { transform: cam(shot.x, Math.max(shot.y, layout.goal.top + 6), zoom) };
    else worldStyle = { transform: cam(layout.spot.x, layout.spot.y, zoom) };
  }
  const ballStyle: Record<string, string | number> = {};
  if (path && phase === 'fly' && shot) {
    ballStyle['--fly'] = `${shot.impactMs - shot.flyMs}ms`;
    path.forEach((p, k) => {
      ballStyle[`--x${k}`] = pct(p.x);
      ballStyle[`--y${k}`] = pct(p.y);
      ballStyle[`--s${k}`] = p.s.toFixed(3);
    });
  }

  // 골키퍼: 이번 슛의 다이빙(날기~닿음~마지막 장면). 다음 슛 컷신이 덮는 동안 제자리로 돌아온다.
  const diveShot: Shot | null =
    phase === 'settle' ? finalShot : shot && (phase === 'fly' || phase === 'impact') ? shot : null;
  const keeperStyle: Record<string, string> = {
    left: pct(layout.keeper.x),
    top: pct(layout.keeper.y),
    '--kh': cqw(layout.keeper.h),
  };
  if (diveShot) {
    const m = keeperMove(layout, diveShot);
    keeperStyle['--kdx'] = cqw(m.dx);
    keeperStyle['--kdy'] = cqw(m.dy);
    keeperStyle['--krot'] = `${m.rot.toFixed(1)}deg`;
    keeperStyle['--kdur'] = `${diveShot.dive.durMs}ms`;
    // 지연은 이 요소가 생긴 때(fly)부터 잰다. 끝난 판을 다시 그리면 다 넘어진 모습 그대로.
    keeperStyle['--kdelay'] = phase === 'settle' && !live ? `-${diveShot.dive.durMs}ms` : `${diveShot.dive.delayMs}ms`;
  }

  const status = (() => {
    if (phase === 'settle' && winner) {
      const n = shortName(winner.name, 12);
      if (finalShot?.kind === 'panenka') return `파넨카 성공! ${n} 골망을 흔들었어요`;
      if (finalShot?.kind === 'late') return `손끝을 스치고 골! ${n} 당첨이에요`;
      return `골!!! ${n} 골망을 흔들었어요`;
    }
    if (!shot) return `구역 ${count}개 — 골망을 흔들면 당첨!`;
    if (phase === 'stare') return final ? '마지막 키커 — 숨을 고르고…' : `${shotIdx + 1}번째 키커 — 눈치 싸움…`;
    if (phase === 'run') return final ? '마지막 슛 — 도움닫기!' : `${shotIdx + 1}번째 슛 — 도움닫기!`;
    if (phase === 'kick') return '뻥!';
    if (phase === 'fly') {
      if (shot.kind === 'panenka') return '앗, 살짝 띄웠어요!';
      return final ? '들어가나…?' : `${name(shot.aim)} 쪽으로!`;
    }
    switch (shot.kind) {
      case 'save':
        return `선방! ${name(shot.aim)} 쪽을 막았어요`;
      case 'post':
        return `깡! 골대 맞고 나왔어요 — ${name(shot.aim)} 아깝다!`;
      case 'over':
        return '홈런… 공이 관중석으로 갔어요';
      case 'catch':
        return `골키퍼가 잡았어요 — ${name(shot.aim)} 아깝다`;
      case 'bar':
        return '아깝다! 크로스바 맞고 라인 앞에 떨어졌어요';
      default:
        return '골!!!';
    }
  })();

  const callout = (() => {
    if (!shot) return null;
    if (phase === 'fly' && shot.kind === 'panenka') return { text: '둥실~', tone: 'soft' };
    if (phase !== 'impact') return null;
    const map: Record<Shot['kind'], [string, string]> = {
      save: ['선방!', 'save'],
      post: ['깡!', 'ting'],
      over: ['홈런…', 'plain'],
      catch: ['잡았다!', 'save'],
      bar: ['노골!', 'ting'],
      goal: ['골!!!', 'goal'],
      late: ['골!!!', 'goal'],
      panenka: ['파넨카!', 'goal'],
    };
    const [text, tone] = map[shot.kind];
    return { text, tone };
  })();

  const cut = shot && (phase === 'stare' || phase === 'run' || phase === 'kick' || phase === 'fly');
  const goalIn = (phase === 'impact' && final) || phase === 'settle';
  const g = layout.goal;
  // 공: 스폿에 놓여 있다(대기·컷신) · 날아간다 · 닿은 뒤 사건대로 움직인다 · 마지막엔 골망 안.
  const ballAt: { x: number; y: number; s: number } | null =
    phase === 'settle' && winnerIndex !== null
      ? finalShot
        ? { x: finalShot.x, y: finalShot.y, s: 0.42 }
        : { x: layout.zones[winnerIndex].x, y: layout.zones[winnerIndex].y, s: 0.42 }
      : phase === 'impact' && shot
        ? { x: shot.x, y: shot.y, s: 0.42 }
        : phase === 'fly'
          ? null
          : { x: layout.spot.x, y: layout.spot.y, s: 1 };
  const fanMood = phase === 'settle' || (phase === 'impact' && final) ? 'wave' : miss ? 'groan' : null;

  return (
    <div
      className={['penalty', expanded ? 'penalty--big' : '', settled ? 'penalty--settled' : ''].filter(Boolean).join(' ')}
      style={{ '--fit': layout.aspect.toFixed(4) } as React.CSSProperties}
    >
      <div
        className={[
          'penalty__pitch',
          phase === 'kick' ? 'penalty__pitch--shake' : '',
          phase === 'impact' && (final || shot?.kind === 'post' || shot?.kind === 'bar') ? 'penalty__pitch--hit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="img"
        aria-label={`승부차기 골문, 구역 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
        style={
          {
            '--stands': pct(layout.stands),
            '--g-top': pct(g.top),
            '--g-bottom': pct(g.bottom),
            '--spot-y': pct(layout.spot.y),
          } as React.CSSProperties
        }
      >
        <div
          className={['penalty__world', phase === 'fly' ? 'penalty__world--fly' : '', phase === 'settle' ? 'penalty__world--settle' : '']
            .filter(Boolean)
            .join(' ')}
          style={worldStyle}
        >
          {/* 관중석 — 앞줄 머리들이 탄식하거나 파도를 탄다. */}
          <div className={['penalty__stands', fanMood ? `penalty__stands--${fanMood}` : ''].filter(Boolean).join(' ')} aria-hidden="true">
            <span className="penalty__crowd" />
            <span className="penalty__fans">
              {Array.from({ length: FANS }, (_, k) => (
                <span key={k} style={{ '--i': k, '--h': (k * 67) % 360 } as React.CSSProperties} />
              ))}
            </span>
            <span className="penalty__board">⚽ 점심 리그 · 오늘의 메뉴 결정전 · ⚽ 점심 리그 · 오늘의 메뉴 결정전</span>
          </div>

          {/* 골문 — 골망 위에 구역, 그 위에 골대 테. */}
          <span
            className="penalty__net"
            style={{ left: pct(g.left), top: pct(g.top), width: pct(g.right - g.left), height: pct(g.bottom - g.top) }}
            aria-hidden="true"
          />
          {/* 페널티 박스 선·스폿 */}
          <span className="penalty__box" style={{ top: pct(g.bottom) }} aria-hidden="true" />
          <span className="penalty__spot" style={{ left: pct(layout.spot.x), top: pct(layout.spot.y) }} aria-hidden="true" />

          {/* 골키퍼 — 이름표 아래, 골라인 조금 앞에 선다. */}
          <span
            key={diveShot ? `dive-${run}-${shots.indexOf(diveShot)}` : 'home'}
            className={['penalty__keeper', diveShot ? 'penalty__keeper--dive' : '', diveShot?.kind === 'catch' && phase === 'impact' ? 'penalty__keeper--catch' : '']
              .filter(Boolean)
              .join(' ')}
            style={keeperStyle as React.CSSProperties}
            aria-hidden="true"
          >
            <Keeper />
          </span>

          {candidates.map((p, i) => {
            const z = layout.zones[i];
            const isWin = phase === 'settle' && i === winnerIndex;
            const near = !!miss && shot!.aim === i;
            const hit = goalIn && i === winnerIndex;
            return (
              <div
                key={p.id}
                title={p.name}
                className={[
                  'penalty__zone',
                  near ? 'penalty__zone--near' : '',
                  hit ? 'penalty__zone--hit' : '',
                  isWin ? 'penalty__zone--win' : '',
                  z.col === 0 && z.cols > 1 ? 'penalty__zone--l' : '',
                  z.col === z.cols - 1 && z.cols > 1 ? 'penalty__zone--r' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: pct(z.x - z.w / 2), top: pct(z.y - z.h / 2), width: pct(z.w), height: pct(z.h) }}
              >
                <span className="penalty__tag" aria-hidden="true">
                  {isWin ? p.name : shortName(p.name, nameMax)}
                </span>
              </div>
            );
          })}

          <span
            className={['penalty__frame', phase === 'impact' && (shot?.kind === 'post' || shot?.kind === 'bar') ? 'penalty__frame--ring' : '']
              .filter(Boolean)
              .join(' ')}
            style={{ left: pct(g.left), top: pct(g.top), width: pct(g.right - g.left), height: pct(g.bottom - g.top) }}
            aria-hidden="true"
          />

          {/* 골망 출렁 — 공이 꽂힌 자리에서 물결이 퍼진다. */}
          {goalIn && ballAt && (
            <span key={`rip-${run}`} className="penalty__ripple" style={{ left: pct(ballAt.x), top: pct(ballAt.y) }} aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          )}
          {/* 골대·크로스바 맞은 자리 불꽃 */}
          {phase === 'impact' && shot && (shot.kind === 'post' || shot.kind === 'bar') && (
            <span className="penalty__spark" style={{ left: pct(shot.x), top: pct(shot.y) }} aria-hidden="true" />
          )}

          {/* 키커(뒷모습) — 스폿 왼쪽 뒤. */}
          <span
            className={['penalty__kicker', phase === 'fly' || phase === 'impact' ? 'penalty__kicker--shot' : ''].filter(Boolean).join(' ')}
            style={{ left: pct(layout.spot.x - 9), top: pct(layout.spot.y + 3) }}
            aria-hidden="true"
          >
            <MiniKicker />
          </span>

          {/* 공 */}
          {phase === 'fly' && path && (
            <span
              key={`fly-${run}-${shotIdx}`}
              className={['penalty__ball', 'penalty__ball--fly', final ? 'penalty__ball--slow' : ''].filter(Boolean).join(' ')}
              style={ballStyle as React.CSSProperties}
              aria-hidden="true"
            >
              <span className="penalty__ball-skin penalty__ball-skin--spin" />
            </span>
          )}
          {ballAt && (
            <span
              key={`ball-${run}-${shotIdx}-${phase === 'impact' ? 'i' : phase}`}
              className={[
                'penalty__ball',
                phase === 'impact' && shot ? `penalty__ball--${shot.kind}` : '',
                phase === 'settle' ? 'penalty__ball--in' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ left: pct(ballAt.x), top: pct(ballAt.y), '--s': ballAt.s, ...(phase === 'impact' && shot ? afterVars(layout, shot) : {}) } as React.CSSProperties}
              aria-hidden="true"
            >
              <span className="penalty__ball-skin" />
            </span>
          )}

          {(phase === 'settle' || (phase === 'impact' && final)) && ballAt && (
            <span className="penalty__confetti" style={{ left: pct(ballAt.x), top: pct(ballAt.y) }} aria-hidden="true">
              {Array.from({ length: CONFETTI }, (_, k) => (
                <span
                  key={k}
                  style={{ '--a': `${(k * 360) / CONFETTI + (k % 3) * 7}deg`, '--h': (k * 47) % 360, '--d': `${0.8 + (k % 4) * 0.22}` } as React.CSSProperties}
                />
              ))}
            </span>
          )}
        </div>

        {/* 화면에 붙은 효과(카메라 배율과 상관없음). */}
        <div className="penalty__fx" aria-hidden="true">
          {phase && phase !== 'settle' && (
            <span className="penalty__tally">
              {Array.from({ length: SHOTS }, (_, k) => (
                <span
                  key={k}
                  className={[
                    'penalty__t',
                    k < shotIdx || (k === shotIdx && ORDER[phase] >= ORDER.impact) ? (isFinal(shots[k] ?? finalShot!) ? 'penalty__t--in' : 'penalty__t--out') : '',
                    k === shotIdx ? 'penalty__t--now' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
              ))}
            </span>
          )}
          {phase === 'fly' && final && (
            <>
              <span className="penalty__bar penalty__bar--top" />
              <span className="penalty__bar penalty__bar--bottom" />
              <span className="penalty__slow">느린 화면</span>
            </>
          )}
          {phase === 'impact' && final && <span className="penalty__flash" />}
          {callout && (
            <span key={`${run}-${shotIdx}-${phase}`} className={`penalty__callout penalty__callout--${callout.tone}`}>
              {callout.text}
            </span>
          )}
          {phase === 'settle' && winner && (
            <span className="penalty__banner">
              <b>골!!!</b> {winner.name}
            </span>
          )}
        </div>

        {cut && shot && (
          <Cutscene key={`${run}-${shotIdx}`} phase={phase} final={final} shot={shotIdx} stareMs={shot.runMs - shot.stareMs} runMs={shot.kickMs - shot.runMs} />
        )}
      </div>
      <p className="penalty__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 골키퍼(앞모습) — 형광 상의, 큰 장갑, 팔을 벌리고 선다. */
function Keeper() {
  return (
    <span className="penalty__keeper-body">
      <svg viewBox="0 0 60 96" className="penalty__keeper-svg">
        <ellipse cx="30" cy="93" rx="16" ry="3" className="penalty__k-shadow" />
        <rect x="18" y="62" width="9" height="28" rx="4" className="penalty__k-leg" />
        <rect x="33" y="62" width="9" height="28" rx="4" className="penalty__k-leg" />
        <rect x="16" y="56" width="28" height="12" rx="4" className="penalty__k-shorts" />
        <path d="M14 34 Q14 26 22 26 L38 26 Q46 26 46 34 L46 60 L14 60 Z" className="penalty__k-shirt" />
        <path d="M16 32 L3 16" className="penalty__k-arm" />
        <path d="M44 32 L57 16" className="penalty__k-arm" />
        <circle cx="3" cy="14" r="6" className="penalty__k-glove" />
        <circle cx="57" cy="14" r="6" className="penalty__k-glove" />
        <circle cx="30" cy="16" r="11" className="penalty__k-head" />
        <path d="M19 14 Q30 1 41 14 Q30 9 19 14 Z" className="penalty__k-hair" />
        <circle cx="26" cy="17" r="1.6" className="penalty__k-eye" />
        <circle cx="34" cy="17" r="1.6" className="penalty__k-eye" />
        <path d="M27 22 Q30 24 33 22" className="penalty__k-mouth" />
        <text x="30" y="49" className="penalty__k-num">1</text>
      </svg>
    </span>
  );
}

/** 스폿 뒤 작은 키커(뒷모습) — 등번호 10. */
function MiniKicker() {
  return (
    <svg viewBox="0 0 40 52" className="penalty__mini">
      <ellipse cx="20" cy="49" rx="12" ry="2.6" className="penalty__mini-shadow" />
      <rect x="12" y="34" width="6" height="14" rx="3" className="penalty__mini-leg" />
      <rect x="22" y="34" width="6" height="14" rx="3" className="penalty__mini-leg penalty__mini-leg--kick" />
      <rect x="10" y="17" width="20" height="19" rx="6" className="penalty__mini-body" />
      <text x="20" y="31" className="penalty__mini-num">10</text>
      <circle cx="20" cy="11" r="7.5" className="penalty__mini-head" />
    </svg>
  );
}

/**
 * 컷신 — 눈싸움(키커와 골키퍼가 화면을 반씩 나눠 노려본다) → 도움닫기(옆모습으로 달려온다)
 * → 뻥(발이 공을 차고 공이 찌그러지며 튀어 나간다). fly 가 시작되면 번지며 경기장으로 넘어간다.
 */
function Cutscene({ phase, final, shot, stareMs, runMs }: { phase: Phase | null; final: boolean; shot: number; stareMs: number; runMs: number }) {
  const stage = phase === 'stare' ? 'stare' : phase === 'run' ? 'run' : 'kick';
  return (
    <div
      className={[
        'penalty__cut',
        `penalty__cut--${stage}`,
        phase === 'fly' ? 'penalty__cut--out' : '',
        final ? 'penalty__cut--final' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--stare': `${stareMs}ms`, '--run': `${runMs}ms` } as React.CSSProperties}
      aria-hidden="true"
    >
      {stage === 'stare' ? (
        <div className="penalty__stare">
          <span className="penalty__face penalty__face--kicker">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="66" r="44" className="penalty__f-skin" />
              <path d="M16 58 Q24 10 70 14 Q104 18 104 52 Q86 34 58 36 Q34 38 16 58 Z" className="penalty__f-hair" />
              <path d="M30 56 L52 62" className="penalty__f-brow" />
              <path d="M90 56 L68 62" className="penalty__f-brow" />
              <path d="M34 70 Q43 64 52 70" className="penalty__f-eye" />
              <path d="M68 70 Q77 64 86 70" className="penalty__f-eye" />
              <path d="M50 92 L70 92" className="penalty__f-mouth" />
              <path d="M98 40 q6 10 0 14 q-6 -4 0 -14 z" className="penalty__f-sweat" />
            </svg>
          </span>
          <span className="penalty__face penalty__face--keeper">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="66" r="44" className="penalty__f-skin penalty__f-skin--keeper" />
              <path d="M18 54 Q30 14 64 16 Q100 18 102 54 Q80 40 60 42 Q38 42 18 54 Z" className="penalty__f-hair penalty__f-hair--keeper" />
              <path d="M30 60 L52 56" className="penalty__f-brow" />
              <path d="M90 60 L68 56" className="penalty__f-brow" />
              <circle cx="43" cy="70" r="6" className="penalty__f-dot" />
              <circle cx="77" cy="70" r="6" className="penalty__f-dot" />
              <path d="M48 94 Q60 86 72 94" className="penalty__f-mouth" />
              <circle cx="8" cy="100" r="16" className="penalty__f-glove" />
              <circle cx="112" cy="100" r="16" className="penalty__f-glove" />
            </svg>
          </span>
          <span className="penalty__bolt" />
          <span className="penalty__sfx penalty__sfx--stare">{final ? '마지막…' : '눈치 싸움…'}</span>
        </div>
      ) : (
        <>
          <span className="penalty__cut-bg" />
          {final && <span className="penalty__focus" />}
          <span className="penalty__speed" />
          <svg className="penalty__hero" viewBox="0 0 260 180">
            <ellipse cx="110" cy="168" rx="44" ry="6" className="penalty__h-shadow" />
            {/* 뒷다리 · 몸 · 팔 · 머리 · 차는 다리 */}
            <g className="penalty__h-runner">
              <rect x="96" y="112" width="13" height="46" rx="6" className="penalty__h-leg penalty__h-leg--back" />
              <path d="M82 70 Q82 58 96 58 L118 58 Q130 58 130 70 L132 118 L80 118 Z" className="penalty__h-shirt" />
              <text x="106" y="100" className="penalty__h-num">10</text>
              <rect x="80" y="110" width="52" height="16" rx="5" className="penalty__h-shorts" />
              <line x1="88" y1="68" x2="66" y2="94" className="penalty__h-arm" />
              <line x1="124" y1="68" x2="146" y2="88" className="penalty__h-arm" />
              <circle cx="108" cy="38" r="22" className="penalty__h-head" />
              <path d="M86 34 Q96 6 128 24 Q120 30 86 34 Z" className="penalty__h-hair" />
              <circle cx="120" cy="38" r="3" className="penalty__h-eye" />
              <path d="M114 50 Q120 53 126 49" className="penalty__h-mouth" />
              <g className="penalty__h-kickleg">
                <rect x="112" y="112" width="13" height="44" rx="6" className="penalty__h-leg" />
                <path d="M110 150 L134 150 Q140 150 140 157 L140 160 L110 160 Z" className="penalty__h-boot" />
              </g>
            </g>
            <g className="penalty__h-ball">
              <circle cx="168" cy="150" r="13" className="penalty__h-ballskin" />
              <path d="M168 143 l6 4 l-2 7 l-8 0 l-2 -7 z" className="penalty__h-ballspot" />
            </g>
          </svg>
          <span className="penalty__vignette" />
          <span className="penalty__bar penalty__bar--top" />
          <span className="penalty__bar penalty__bar--bottom" />
          <span className="penalty__sfx penalty__sfx--run">{final ? '다다다닥…' : '다다닥'}</span>
          <span className="penalty__sfx penalty__sfx--kick">뻥!</span>
        </>
      )}
      <span className="penalty__caption">{final ? '마지막 슛!' : `${shot + 1} / ${SHOTS}`}</span>
    </div>
  );
}
