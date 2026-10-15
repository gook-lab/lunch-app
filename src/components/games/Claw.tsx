/**
 * 인형뽑기 — 가게 이름표를 단 인형들이 유리 상자에 쌓여 있고, 집게가 두세 번 내려간다.
 * 앞 왼쪽 출구에 떨어진 인형이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 인형 자리는 후보 수마다 한 번, 기회마다의 사건·시각·자세는
 * 판 번호 run 시드로 lib/claw.ts 가 정한다. 마지막 기회만 당첨 인형을 출구에 넣는다.
 *
 * 한 번마다: 조이스틱으로 옮김(시계 3·2·1) → 버튼, 집게가 내려감 → 철컥 → 들어 올림 → 사건.
 * 사건은 미끄러짐·문턱(아깝다)·힘 약한 집게·두 개 잡기·툭(당첨 인형이 출구 쪽으로 구름).
 * 마지막엔 출구로 쏙 들어간 인형이 튀어나와 가운데서 반짝이고 onSpinEnd 를 한 번 부른다.
 *
 * 각본은 단계(steps)마다 전체 자세를 들고 있다. 컴포넌트는 단계 번호만 바꾸고,
 * 사이 움직임은 CSS transition(단계가 정한 시간·곡선)이 한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import { clawLayout, clawNameMax, clawPlan, type ClawLayout, type Step, type ToyKind, type ToyPose } from '../../lib/claw';
import { seededRandom } from '../../lib/random';
import { clawSfxLater } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import './Claw.css';

interface ClawState {
  run: number;
  step: number;
}

/** 인형 자리는 후보 수마다 한 번 정한다 — 판마다 바뀌면 아까 그 인형을 눈으로 따라갈 수 없다. */
const LAYOUT_SEED = 11;
/** 반짝이 조각 수. */
const SPARKS = 14;
/** 함 높이(폭 = 100 기준): 테두리 2.4×2 + 간판 11 + 간격 1.6×2 + 조작판 15. 상자는 폭 95.2 에 aspect. */
const CAB_EXTRA = 2.4 * 2 + 11 + 1.6 * 2 + 15;
const BOX_W = 100 - 2.4 * 2;

const EASE: Record<ToyPose['ease'], string> = {
  move: 'cubic-bezier(.45,0,.25,1)',
  drop: 'cubic-bezier(.35,0,.65,1)',
  lift: 'cubic-bezier(.4,0,.3,1)',
  fall: 'cubic-bezier(.55,0,1,.5)',
  pop: 'cubic-bezier(.3,1.55,.5,1)',
};

const pct = (n: number) => `${n.toFixed(2)}%`;

/** 상태 줄 한 줄. Toss 말투 — 짧게. */
function statusText(step: Step, candidates: GameProps['candidates'], attempts: number): string {
  const nm = (i: number | null) => (i === null ? '' : shortName(candidates[i].name, 8));
  const final = step.attempt === attempts - 1;
  switch (step.say) {
    case 'move':
      return `${step.attempt + 1}번째 기회 — 집게를 옮겨요`;
    case 'count':
      return `마지막 기회! ${step.timer ?? 1}…`;
    case 'drop':
      return '집게가 내려가요…';
    case 'final-drop':
      return '제발… 제발…!';
    case 'grab':
      return final ? '철컥! 잡았다…?' : '철컥!';
    case 'weak-grab':
      return '어? 집게 힘이 약해요…';
    case 'double-grab':
      return '두 개나 잡았어요!';
    case 'lift':
      return `${withJosa(nm(step.who), '이/가')} 올라가요!`;
    case 'final-lift':
      return `${nm(step.who)} 잡았어요! 놓치지 마…`;
    case 'slip':
      return '앗, 미끄러졌어요!';
    case 'double-drop':
      return `${withJosa(nm(step.who), '이/가')} 먼저 떨어졌어요`;
    case 'double-slip':
      return '앗, 나머지도 미끄러졌어요!';
    case 'weak-miss':
      return `${nm(step.who)} 스치기만 했어요`;
    case 'nudge':
      return `툭! ${withJosa(nm(step.who), '이/가')} 출구 쪽으로 굴렀어요`;
    case 'carry':
      return '출구로 가요… 가요…';
    case 'edge':
      return `아깝다! ${withJosa(nm(step.who), '이/가')} 문턱에 걸렸어요`;
    case 'edge-back':
      return '아깝다! 다시 굴러떨어졌어요';
    case 'final-carry':
      return '출구로… 출구로…!';
    case 'teeter':
      return '어어… 문턱에 걸렸어요!';
    case 'drop-in':
      return '쏙!';
    case 'won':
      return `뽑았어요! ${shortName(candidates[step.who ?? 0].name, 14)}`;
  }
}

export function Claw({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [state, setState] = useState<ClawState>({ run: -1, step: 0 });
  const layout = useMemo(() => clawLayout(count, seededRandom(LAYOUT_SEED + count)), [count]);
  // 각본은 판 번호 시드라 몇 번 계산해도 같다. 자세를 그리려고 렌더에서도 쓴다.
  const plan = useMemo(
    () => (winnerIndex === null ? null : clawPlan(layout, winnerIndex, seededRandom(run))),
    [layout, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 뽑는 장면 없이 뽑힌 모습만 보인다.
      setState({ run, step: plan ? plan.steps.length - 1 : 0 });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 첫 단계에서 멈춘다.
    setState({ run, step: 0 });
    const timers: number[] = [];
    plan.steps.forEach((st, k) => {
      if (k === 0) return;
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { run, step: k } : s)), st.at));
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));
    const stopSfx = clawSfxLater(plan.sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="claw claw--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 뽑힌 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const steps = plan?.steps ?? [];
  const step: Step | null = plan ? (live ? (steps[state.step] ?? null) : settled ? steps[steps.length - 1] : null) : null;
  // 한 곳뿐이면 각본이 없다 — 그 인형이 바로 뽑힌 모습.
  const soloWon = !plan && winnerIndex !== null && (live || settled);
  const won = soloWon || step?.say === 'won';
  const attempts = plan?.attempts.length ?? 3;

  const idle: ToyPose[] = layout.toys.map((t) => ({ x: t.x, y: t.y, rot: t.rot, scale: 1, state: 'pile', ms: 0, ease: 'move' }));
  const poses: ToyPose[] = step
    ? step.toys
    : soloWon && winnerIndex !== null
      ? idle.map((p, i) => (i === winnerIndex ? { ...p, x: 50, y: 50, rot: 0, scale: Math.min(2.6, Math.max(1.6, 36 / layout.size)), state: 'won' } : p))
      : idle;
  const claw = step?.claw ?? { x: layout.home.x, y: layout.home.y, open: 0, ms: 0, ease: 'move' as const, swing: false };
  const nameMax = clawNameMax(layout.cols, expanded);
  const winner = winnerIndex === null ? null : candidates[winnerIndex];

  const status = (() => {
    if (soloWon && winner) return `뽑았어요! ${shortName(winner.name, 14)}`;
    if (!step) return `인형 ${count}개 — 출구에 떨어지면 당첨!`;
    return statusText(step, candidates, attempts);
  })();

  const fit = 100 / (CAB_EXTRA + BOX_W / layout.aspect);
  const callout = step?.callout ?? null;

  return (
    <div
      className={['claw', expanded ? 'claw--big' : '', settled ? 'claw--settled' : ''].filter(Boolean).join(' ')}
      // 함 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': fit.toFixed(4) } as React.CSSProperties}
    >
      <div className="claw__cab">
        <div className="claw__sign" aria-hidden="true">
          <span className="claw__bulbs" />
          <span className="claw__neon">인형뽑기</span>
          <span className="claw__bulbs claw__bulbs--r" />
        </div>

        <div
          className={['claw__box', won ? 'claw__box--won' : '', claw.swing ? 'claw__box--swing' : ''].filter(Boolean).join(' ')}
          role="img"
          aria-label={`인형뽑기 기계, 인형 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
          style={
            {
              aspectRatio: layout.aspect.toFixed(4),
              '--size': layout.size.toFixed(3),
              '--cell': layout.cellW.toFixed(3),
            } as React.CSSProperties
          }
        >
          <span className="claw__wall" aria-hidden="true" />
          <span className="claw__floor" style={{ top: pct(layout.floor) }} aria-hidden="true" />
          <span className="claw__hole" style={{ width: pct(layout.chuteW), top: pct(layout.chuteTop) }} aria-hidden="true" />

          {candidates.map((p, i) => (
            <ToyView
              key={p.id}
              name={p.name}
              label={shortName(p.name, nameMax)}
              pose={poses[i]}
              toy={layout.toys[i]}
              isWin={won && i === winnerIndex}
            />
          ))}

          <span className="claw__chute" style={{ width: pct(layout.chuteW), top: pct(layout.chuteTop) }} aria-hidden="true">
            <span className="claw__chute-label">출구</span>
          </span>

          <ClawRig layout={layout} claw={claw} />

          {won && (
            <span className="claw__sparks" aria-hidden="true">
              {Array.from({ length: SPARKS }, (_, k) => (
                <span
                  key={k}
                  style={
                    {
                      '--a': `${(k * 360) / SPARKS + (k % 3) * 9}deg`,
                      '--h': (k * 53) % 360,
                      '--d': `${0.9 + (k % 4) * 0.2}`,
                      '--delay': `${(k % 5) * 70}ms`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </span>
          )}
          <span className="claw__glass" aria-hidden="true" />
          {callout && (
            <span key={`${run}-${callout.key}`} className={`claw__callout claw__callout--${callout.tone}`} aria-hidden="true">
              {callout.text}
            </span>
          )}
        </div>

        <div className="claw__panel" aria-hidden="true">
          <span className={['claw__timer', step?.timer === 0 ? 'claw__timer--zero' : ''].filter(Boolean).join(' ')}>
            <small>TIME</small>
            {step && step.timer !== null ? `0${step.timer}` : '--'}
          </span>
          <span className="claw__lives">
            {Array.from({ length: attempts }, (_, k) => (
              <span
                key={k}
                className={[
                  'claw__life',
                  step && (k < step.attempt || won) ? 'claw__life--used' : '',
                  step && k === step.attempt && !won ? 'claw__life--now' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              />
            ))}
          </span>
          <span className="claw__stick" style={{ '--tilt': `${(step?.stick ?? 0) * 22}deg` } as React.CSSProperties}>
            <span className="claw__stick-rod" />
          </span>
          <span className={['claw__button', step?.button ? 'claw__button--on' : ''].filter(Boolean).join(' ')} />
        </div>
      </div>
      <p className="claw__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 인형 하나 — 자리(left/top)와 자세는 transition 으로 옮겨 간다. */
function ToyView({ name, label, pose, toy, isWin }: { name: string; label: string; pose: ToyPose; toy: ClawLayout['toys'][number]; isWin: boolean }) {
  const lifted = pose.state === 'held' || pose.state === 'fall' || pose.state === 'teeter' || pose.state === 'roll';
  const z = isWin ? 500 : pose.state === 'chute' ? 250 : lifted ? 260 : 100 + Math.round(100 - pose.y);
  return (
    <span
      title={name}
      className={['claw__toy', `claw__toy--${pose.state}`, isWin ? 'claw__toy--win' : ''].filter(Boolean).join(' ')}
      style={
        {
          left: pct(pose.x),
          top: pct(pose.y),
          zIndex: z,
          '--ms': `${pose.ms}ms`,
          '--ease': EASE[pose.ease],
          '--rot': `${pose.rot}deg`,
          '--scale': pose.scale.toFixed(3),
          '--c': toy.color,
          '--c2': toy.color2,
        } as React.CSSProperties
      }
    >
      <span className="claw__doll">
        <Doll kind={toy.kind} />
      </span>
      <span className="claw__tag">{isWin ? name : label}</span>
    </span>
  );
}

/** 레일 위 수레 · 줄 · 집게 머리. 발톱 벌림은 --open. */
function ClawRig({ layout, claw }: { layout: ClawLayout; claw: Step['claw'] }) {
  const style = {
    '--x': pct(claw.x),
    '--y': pct(claw.y),
    '--rail': pct(layout.rail),
    '--open': claw.open.toFixed(2),
    '--ms': `${claw.ms}ms`,
    '--ease': EASE[claw.ease],
  } as React.CSSProperties;
  return (
    <span className="claw__rig" style={style} aria-hidden="true">
      <span className="claw__rail" />
      <span className="claw__cart" />
      <span className="claw__cable" />
      <span className={['claw__head', claw.swing ? 'claw__head--swing' : ''].filter(Boolean).join(' ')}>
        <svg viewBox="0 0 100 95" className="claw__svg">
          <path className="claw__prong claw__prong--back" d="M50 33 L50 78 Q50 86 56 88" />
          <path className="claw__prong claw__prong--l" d="M32 32 Q12 52 18 76 Q22 88 34 90" />
          <path className="claw__prong claw__prong--r" d="M68 32 Q88 52 82 76 Q78 88 66 90" />
          <rect className="claw__hub" x="24" y="6" width="52" height="28" rx="9" />
          <rect className="claw__hub-band" x="24" y="20" width="52" height="6" />
          <circle className="claw__bolt" cx="50" cy="14" r="4" />
        </svg>
      </span>
    </span>
  );
}

/** 인형 모양 여덟 가지 — 몸·머리는 같고 귀·얼굴이 다르다. 색은 --c(몸)·--c2(배·귀 안). */
function Doll({ kind }: { kind: ToyKind }) {
  const eyesY = kind === 'frog' ? 22 : 42;
  const eyesX = kind === 'frog' ? 15 : 9;
  return (
    <svg viewBox="0 0 100 100" className="claw__svgdoll">
      {/* 귀(머리 뒤) */}
      {kind === 'bear' && (
        <>
          <circle cx="28" cy="20" r="11" className="d-c" />
          <circle cx="72" cy="20" r="11" className="d-c" />
          <circle cx="28" cy="20" r="5.5" className="d-c2" />
          <circle cx="72" cy="20" r="5.5" className="d-c2" />
        </>
      )}
      {kind === 'bunny' && (
        <>
          <ellipse cx="38" cy="12" rx="8" ry="19" transform="rotate(-12 38 12)" className="d-c" />
          <ellipse cx="62" cy="12" rx="8" ry="19" transform="rotate(12 62 12)" className="d-c" />
          <ellipse cx="38" cy="13" rx="3.5" ry="13" transform="rotate(-12 38 13)" className="d-pink" />
          <ellipse cx="62" cy="13" rx="3.5" ry="13" transform="rotate(12 62 13)" className="d-pink" />
        </>
      )}
      {(kind === 'cat' || kind === 'pig') && (
        <>
          <path d={kind === 'cat' ? 'M25 32 L26 6 L46 20 Z' : 'M27 26 L28 10 L44 20 Z'} className="d-c" />
          <path d={kind === 'cat' ? 'M75 32 L74 6 L54 20 Z' : 'M73 26 L72 10 L56 20 Z'} className="d-c" />
          <path d={kind === 'cat' ? 'M29 26 L30 13 L41 21 Z' : 'M31 23 L32 15 L40 20 Z'} className="d-pink" />
          <path d={kind === 'cat' ? 'M71 26 L70 13 L59 21 Z' : 'M69 23 L68 15 L60 20 Z'} className="d-pink" />
        </>
      )}
      {kind === 'frog' && (
        <>
          <circle cx="35" cy="22" r="12" className="d-c" />
          <circle cx="65" cy="22" r="12" className="d-c" />
          <circle cx="35" cy="22" r="7.5" className="d-white" />
          <circle cx="65" cy="22" r="7.5" className="d-white" />
        </>
      )}
      {kind === 'chick' && <path d="M48 16 Q44 4 52 3 Q50 9 56 6 Q54 12 52 16 Z" className="d-c" />}
      {/* 몸 · 팔 · 발 */}
      <ellipse cx="22" cy="70" rx="8" ry="11" transform="rotate(20 22 70)" className="d-c" />
      <ellipse cx="78" cy="70" rx="8" ry="11" transform="rotate(-20 78 70)" className="d-c" />
      <ellipse cx="50" cy="73" rx="28" ry="23" className="d-c" />
      <ellipse cx="36" cy="94" rx="10" ry="5.5" className="d-c" />
      <ellipse cx="64" cy="94" rx="10" ry="5.5" className="d-c" />
      <ellipse cx="50" cy="77" rx="17" ry="14" className={kind === 'penguin' ? 'd-white' : 'd-c2'} />
      {/* 머리 */}
      <circle cx="50" cy="42" r="27" className="d-c" />
      {kind === 'dog' && (
        <>
          <ellipse cx="24" cy="40" rx="8" ry="16" transform="rotate(18 24 40)" className="d-c d-shade" />
          <ellipse cx="76" cy="40" rx="8" ry="16" transform="rotate(-18 76 40)" className="d-c d-shade" />
          <ellipse cx="60" cy="34" rx="7" ry="6" className="d-shade-only" />
        </>
      )}
      {kind === 'penguin' && <ellipse cx="50" cy="47" rx="19" ry="17" className="d-white" />}
      {kind === 'pig' && (
        <>
          <ellipse cx="50" cy="51" rx="10" ry="7" className="d-c2" />
          <circle cx="46.5" cy="51" r="1.8" className="d-ink" />
          <circle cx="53.5" cy="51" r="1.8" className="d-ink" />
        </>
      )}
      {(kind === 'bear' || kind === 'dog') && <ellipse cx="50" cy="51" rx="9" ry="7" className="d-c2" />}
      {/* 눈 · 볼 · 입 */}
      <circle cx={50 - eyesX} cy={eyesY} r="3.6" className="d-ink" />
      <circle cx={50 + eyesX} cy={eyesY} r="3.6" className="d-ink" />
      <circle cx={51 - eyesX} cy={eyesY - 1.4} r="1.2" className="d-white" />
      <circle cx={51 + eyesX} cy={eyesY - 1.4} r="1.2" className="d-white" />
      <ellipse cx="33" cy="52" rx="5" ry="3" className="d-blush" />
      <ellipse cx="67" cy="52" rx="5" ry="3" className="d-blush" />
      {kind === 'chick' || kind === 'penguin' ? (
        <path d="M44 48 L56 48 L50 56 Z" className="d-beak" />
      ) : kind === 'frog' ? (
        <path d="M36 48 Q50 60 64 48" className="d-line" />
      ) : kind === 'pig' ? null : (
        <path d={kind === 'bear' || kind === 'dog' ? 'M50 51 v4 M45 56 Q50 60 55 56' : 'M45 52 Q47.5 55 50 52 Q52.5 55 55 52'} className="d-line" />
      )}
    </svg>
  );
}
