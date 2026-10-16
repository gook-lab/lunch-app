/**
 * 컬링 — 가게 이름표를 단 스톤들이 하우스(과녁) 둘레에 흩어져 있고, 우리 스톤 2~3개가 휘어
 * 미끄러져 와 부딪친다. 다 멈췄을 때 버튼(한가운데)에 가장 가까운 가게가 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 충돌 각본은 lib/curling.ts 가 판 번호(run) 시드로 짠다 —
 * 끝 장면에서 당첨 스톤이 버튼에 가장 가깝도록 거꾸로 짠 각본이라 물리 계산은 없다.
 * 화면은 각본에서 t(ms) 장면을 그대로 계산해(frameAt) 그린다. 끝나면 onSpinEnd 를 한 번 부른다.
 *
 * 사건(판마다 rng): 테이크아웃 · 더블 테이크아웃 · 연쇄 충돌 · 한 끗 모자란 투구 · 당첨 밀어 올리기 ·
 * 가장자리에 걸쳐 흔들리는 스톤 · "닦아요! 닦아요!" · 간발의 차면 '측정 중…' 테이프.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import {
  BUTTON,
  BUTTON_R,
  CM_PER_UNIT,
  RINGS,
  R,
  SHEET_L,
  curlingNameMax,
  curlingPlan,
  dist,
  eventAt,
  frameAt,
  idleLayout,
  sweepersAt,
  type CurlEvent,
  type CurlingPlan,
  type Pt,
} from '../../lib/curling';
import { seededRandom } from '../../lib/random';
import { curlSfxLater, type CurlSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SEASON_NAME } from '../../lib/ambience';
import { ambienceClasses } from './scene/outfit';
import { Climax } from './scene/Climax';
import './Curling.css';
import './Curling.ambience.css';

/** 얼음 밑 대회 로고의 계절 표시. */
const LOGO_MARK = { spring: '🌸', summer: '☀️', autumn: '🍁', winter: '❄️' } as const;

interface CurlingState {
  run: number;
  /** 이번 판 시작부터 흐른 시간(ms). */
  t: number;
}

/** 부딪친 자리에 "탕!" 이 떠 있는 시간. */
const BURST_MS = 420;
/** 판이 시작할 때 스톤이 새 자리로 미끄러져 가는 시간(각본의 첫 투구 전 틈보다 짧다). */
const RACK_MS = 260;

const BURST_TEXT: Partial<Record<CurlEvent['kind'], string>> = {
  hit: '탕!',
  double: '탕탕!',
  chain: '딱!',
  raise: '쿵!',
};

/** 화면 좌표(%) — 시트 폭 100 · 길이 SHEET_L 단위. */
const left = (p: Pt) => `${p.x}%`;
const top = (p: Pt) => `${(p.y / SHEET_L) * 100}%`;

/** 이름표 글자 — 잘린 자리에 공백이 남으면("만두 …") 붙인다. */
const tagName = (name: string, max: number) => shortName(name, max).replace(/\s+…$/, '…');

/** 가게 스톤 색(손잡이 덮개). 이웃끼리 겹치지 않게 황금각씩 돈다. */
const hueOf = (i: number) => Math.round((i * 137.5 + 200) % 360);

function statusText(plan: CurlingPlan, ev: CurlEvent | null, t: number, winnerName: string): string {
  if (!ev) return '스톤을 밀어요…';
  switch (ev.kind) {
    case 'deliver':
      return ev.throwNo === plan.throws - 1
        ? '마지막 스톤이 미끄러져요…'
        : `${(ev.throwNo ?? 0) + 1}번째 스톤이 미끄러져요…`;
    case 'sweep':
      return t <= (ev.until ?? ev.t) ? '닦아요! 닦아요!' : '스톤이 미끄러져요…';
    case 'hit':
      return '탕! 테이크아웃!';
    case 'double':
      return '탕탕! 더블 테이크아웃!';
    case 'chain':
      return '딱! 연쇄 충돌이에요!';
    case 'raise':
      return '쿵! 밀려 올라가요…';
    case 'short':
      return '아깝다, 한 끗 모자라요';
    case 'teeter':
      return t <= (ev.until ?? ev.t) ? '걸칠까 말까…' : '아슬아슬하게 걸쳤어요';
    case 'measure':
      return '측정 중…';
    case 'reveal':
      return `${withJosa(winnerName, '이/가')} 버튼에 제일 가까워요!`;
  }
}

export function Curling({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [state, setState] = useState<CurlingState>({ run: -1, t: 0 });
  const plan = useMemo(
    () => (winnerIndex === null ? null : curlingPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );
  const idle = useMemo(() => idleLayout(count), [count]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 투구 없이 끝 장면만 보인다.
      setState({ run, t: plan ? plan.endMs : 0 });
      const tm = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(tm);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 갱신이 s.run === run 에 막혀 스톤이 안 움직인다.
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

    const sounds: [number, CurlSfxName | SfxName][] = [];
    for (const e of plan.events) {
      if (e.kind === 'deliver') sounds.push([e.t + 80, 'rumble']);
      if (e.kind === 'sweep') for (let k = e.t; k < (e.until ?? e.t); k += 160) sounds.push([k, 'sweep']);
      if (e.kind in BURST_TEXT) sounds.push([e.t, 'clack']);
      if (e.kind === 'teeter') sounds.push([e.t, 'wobble']);
      if (e.kind === 'measure') sounds.push([e.t + 80, 'tape'], [e.t + 650, 'tape']);
    }
    const stopSfx = curlSfxLater(sounds);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((tm) => window.clearTimeout(tm));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="curling curling--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 끝 장면을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const t = live ? state.t : settled && plan ? plan.endMs : null;
  const frame = plan && t !== null ? frameAt(plan, t) : null;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const winnerName = winner ? shortName(winner.name, 12) : '';
  const revealed = winnerIndex !== null && (live || settled) && (!plan || (t !== null && t >= plan.revealMs));
  const ev = plan && t !== null ? eventAt(plan, t) : null;
  // 마지막 스톤을 놓은 뒤부터 결과가 보일 때까지 — 긴박감 층.
  const lastDeliver = plan?.events.find((e) => e.kind === 'deliver' && e.throwNo === plan.throws - 1)?.t;
  const climax = live && t !== null && lastDeliver !== undefined && t >= lastDeliver && !revealed;
  const status =
    revealed && winner
      ? `${withJosa(winnerName, '이/가')} 버튼에 제일 가까워요!`
      : plan && t !== null
        ? statusText(plan, ev, t, winnerName)
        : `스톤 ${count}개가 하우스를 노려요`;

  const pos: Pt[] = frame ? frame.pos : count === 1 ? [BUTTON] : idle;
  const nameMax = curlingNameMax(count, expanded);
  const sweepers = plan && t !== null ? sweepersAt(plan, t) : [];
  const bursts =
    plan && t !== null ? plan.events.filter((e) => e.at && BURST_TEXT[e.kind] && t >= e.t && t < e.t + BURST_MS) : [];
  const teetering = plan?.teeter && t !== null && t >= plan.teeter.t0 && t < plan.teeter.t1 ? plan.teeter.id : -1;
  const m = plan?.measure;
  const measuring = m && t !== null && t >= m.startMs && t < m.endMs ? (t - m.startMs) / (m.endMs - m.startMs) : null;
  const racking = live && t !== null && t < RACK_MS;

  // 측정 테이프: 앞 절반은 2등까지, 뒤 절반은 당첨까지 풀린다. 당첨을 밝힌 뒤엔 당첨까지만 남는다.
  const tapes: { to: Pt; p: number; cm: number; win: boolean }[] = [];
  if (frame && winnerIndex !== null) {
    if (m && measuring !== null) {
      tapes.push({
        to: frame.pos[m.runner],
        p: Math.min(1, measuring / 0.4),
        cm: m.runnerDist * CM_PER_UNIT,
        win: false,
      });
      if (measuring > 0.5)
        tapes.push({
          to: frame.pos[winnerIndex],
          p: Math.min(1, (measuring - 0.5) / 0.4),
          cm: m.winnerDist * CM_PER_UNIT,
          win: true,
        });
    } else if (revealed) {
      tapes.push({
        to: frame.pos[winnerIndex],
        p: 1,
        cm: dist(frame.pos[winnerIndex], BUTTON) * CM_PER_UNIT,
        win: true,
      });
    }
  }

  // 측정 숫자는 상태 줄에 — 얼음 위에 달면 버튼 둘레 이름표와 겹친다.
  const readout = tapes.filter((tp) => tp.p >= 1).map((tp) => `${tp.cm.toFixed(1)}cm`);
  const shownStatus = measuring !== null && readout.length > 0 ? `측정 중… ${readout.join(' vs ')}` : status;

  return (
    <div
      className={[
        'curling',
        ambienceClasses(ambience),
        expanded ? 'curling--big' : '',
        settled ? 'curling--settled' : '',
        racking ? 'curling--rack' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--fit': (100 / SHEET_L).toFixed(4) } as React.CSSProperties}
    >
      <div
        className="curling__sheet"
        role="img"
        aria-label={`컬링 시트, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
      >
        <svg className="curling__ice" viewBox={`0 0 100 ${SHEET_L}`} aria-hidden="true">
          {/* 하우스 — 파란 12피트 · 흰 8피트 · 빨간 4피트 · 흰 버튼 */}
          <circle className="curling__ring curling__ring--12" cx={BUTTON.x} cy={BUTTON.y} r={RINGS[0]} />
          <circle className="curling__ring curling__ring--8" cx={BUTTON.x} cy={BUTTON.y} r={RINGS[1]} />
          <circle className="curling__ring curling__ring--4" cx={BUTTON.x} cy={BUTTON.y} r={RINGS[2]} />
          <circle className="curling__ring curling__ring--button" cx={BUTTON.x} cy={BUTTON.y} r={BUTTON_R} />
          <line className="curling__line" x1="0" x2="100" y1={BUTTON.y} y2={BUTTON.y} />
          <line className="curling__line" x1="50" x2="50" y1="0" y2={SHEET_L} />
          <line className="curling__line" x1="0" x2="100" y1={BUTTON.y - RINGS[0]} y2={BUTTON.y - RINGS[0]} />
          <line
            className="curling__line curling__line--hog"
            x1="0"
            x2="100"
            y1={BUTTON.y + RINGS[0] + 26}
            y2={BUTTON.y + RINGS[0] + 26}
          />
        </svg>
        <div className="curling__logo" aria-hidden="true">
          <span className="curling__logo-mark">{LOGO_MARK[ambience.season]}</span>
          <span className="curling__logo-name">
            {ambience.weekday === 5 ? '불금 컬링 나이트' : `${SEASON_NAME[ambience.season]} 컬링 리그`}
          </span>
        </div>
        <span className="curling__wx" aria-hidden="true" />
        <Climax on={climax} label="마지막 스톤!" />

        {candidates.map((p, i) => {
          const at = pos[i] ?? BUTTON;
          const isWin = revealed && i === winnerIndex;
          const moving = frame?.moving[i] ?? false;
          return (
            <div
              key={p.id}
              title={p.name}
              className={[
                'curling__stone',
                moving ? 'curling__stone--moving' : '',
                i === teetering ? 'curling__stone--teeter' : '',
                plan && frame && plan.tagUp.includes(i) ? 'curling__stone--tagUp' : '',
                isWin ? 'curling__stone--win' : '',
                m && measuring !== null && (i === m.runner || i === winnerIndex) ? 'curling__stone--measured' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  left: left(at),
                  top: top(at),
                  '--hue': hueOf(i),
                  '--rot': `${frame?.rot[i] ?? 0}deg`,
                } as React.CSSProperties
              }
            >
              <span className="curling__granite" aria-hidden="true">
                <span className="curling__cap" />
              </span>
              <span className="curling__tag" aria-hidden="true">
                {tagName(p.name, isWin ? 12 : nameMax)}
              </span>
            </div>
          );
        })}

        {/* 우리 스톤 — 이름표 없이 팀 색. 던지기 전엔 없다. */}
        {plan &&
          frame &&
          Array.from({ length: plan.throws }, (_, k) => {
            const id = plan.count + k;
            if (!frame.shown[id]) return null;
            return (
              <div
                key={`shot-${run}-${k}`}
                className={['curling__stone', 'curling__stone--ours', frame.moving[id] ? 'curling__stone--moving' : '']
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: left(frame.pos[id]),
                    top: top(frame.pos[id]),
                    '--rot': `${frame.rot[id]}deg`,
                  } as React.CSSProperties
                }
                aria-hidden="true"
              >
                <span className="curling__granite">
                  <span className="curling__cap" />
                </span>
              </div>
            );
          })}

        {/* 측정 테이프 — 스톤 위로 버튼에서 스톤 가운데까지 줄자를 편다. */}
        {tapes.length > 0 && (
          <svg className="curling__overlay" viewBox={`0 0 100 ${SHEET_L}`} aria-hidden="true">
            <circle className="curling__pin" cx={BUTTON.x} cy={BUTTON.y} r={1.1} />
            {tapes.map((tp) => {
              // 스톤 가장자리까지만 — 가운데까지 그으면 스톤 손잡이·이름표를 가로지른다.
              const full = Math.max(0, 1 - R / Math.max(dist(tp.to, BUTTON), R));
              const end = {
                x: BUTTON.x + (tp.to.x - BUTTON.x) * tp.p * full,
                y: BUTTON.y + (tp.to.y - BUTTON.y) * tp.p * full,
              };
              return (
                <line
                  key={tp.win ? 'w' : 'r'}
                  className={['curling__tape', tp.win ? 'curling__tape--win' : ''].filter(Boolean).join(' ')}
                  x1={BUTTON.x}
                  y1={BUTTON.y}
                  x2={end.x}
                  y2={end.y}
                />
              );
            })}
          </svg>
        )}

        {sweepers.map((sw) => {
          // 스톤 앞(나아가는 쪽) 양옆에 하나씩 서서 얼음을 닦는다.
          const ahead = { x: sw.at.x + sw.dir.x * (R + 3.2), y: sw.at.y + sw.dir.y * (R + 3.2) };
          const side = { x: -sw.dir.y * 4.2, y: sw.dir.x * 4.2 };
          return (
            <div key={`sw-${sw.id}`} aria-hidden="true">
              {[-1, 1].map((k) => (
                <span
                  key={k}
                  className={[
                    'curling__sweeper',
                    sw.shout ? 'curling__sweeper--hard' : '',
                    k > 0 ? 'curling__sweeper--b' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: left({ x: ahead.x + side.x * k, y: 0 }), top: top({ x: 0, y: ahead.y + side.y * k }) }}
                >
                  <span className="curling__broom" />
                  <span className="curling__body" />
                </span>
              ))}
              {sw.shout && (
                <span
                  className="curling__shout"
                  style={{ left: `${Math.min(74, Math.max(26, ahead.x))}%`, top: top({ x: 0, y: ahead.y - 7 }) }}
                >
                  닦아요! 닦아요!
                </span>
              )}
            </div>
          );
        })}

        {bursts.map((b) => (
          <span
            key={`${b.kind}-${b.t}`}
            className="curling__burst"
            style={{ left: left(b.at!), top: top(b.at!) }}
            aria-hidden="true"
          >
            {BURST_TEXT[b.kind]}
          </span>
        ))}
      </div>
      <p className="curling__status" aria-live="polite">
        {shownStatus}
      </p>
    </div>
  );
}
