/**
 * 플링코 — 드로퍼가 공을 떨어뜨리고, 공은 삼각형 핀을 맞으며 내려가 아래 칸 하나에 들어간다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 각본은 lib/plinko.ts 가 판 번호 run 시드로 정한다 — 진짜 공의 길은
 * plinkoPath(winnerIndex) 라 언제나 그 칸에 들어가고, 가짜 공은 당첨이 아닌 칸으로만 간다.
 *
 * 한 판: 드로퍼 클로즈업(드르륵) → (가끔) 가짜 공이 먼저 떨어져 꽝 → 진짜 공이 입구에서 망설임(가끔 멈칫)
 * → 톡! 카메라가 공을 따라간다(범퍼에 맞으면 팡) → 마지막 핀부터 슬로모션 → (가끔) 칸 벽 위에서 아슬아슬
 * → 골인 · 칸에 불이 들어오고 꽃가루 → onSpinEnd 한 번. 핀볼(구슬 레이스)과 다르다: 판은 화면 한 장.
 */
import { useEffect, useMemo, useState } from 'react';
import { categoryHue } from '../../lib/category';
import { shortName } from '../../lib/name';
import {
  BALL_R,
  HEAD,
  ballAt,
  beatAt,
  cameraAt,
  cameraTransform,
  dropperX,
  dropY,
  pinX,
  pinY,
  plinkoBoard,
  plinkoPlan,
  restY,
  slotX,
  wallTop,
  type BeatKind,
  type PlinkoPlan,
} from '../../lib/plinko';
import { seededRandom } from '../../lib/random';
import { plinkoSfxLater, type PlinkoSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import './Plinko.css';

/** 큰 글씨가 떠 있는 시간. */
const CALLOUT_MS = 900;
/** 핀이 맞은 뒤 커져 있는 시간 · 범퍼가 번쩍이는 시간. */
const PIN_FLASH_MS = 200;
const BUMP_FLASH_MS = 420;
const CONFETTI = 18;

const CALLOUT: Partial<Record<BeatKind, [string, string]>> = {
  intro: ['드르륵…', 'soft'],
  decoy: ['공이 먼저?!', 'warn'],
  decoyLand: ['가짜!', 'bad'],
  fake: ['멈칫!', 'warn'],
  drop: ['톡!', 'soft'],
  perch: ['멈칫…', 'warn'],
  bump: ['팡!', 'bump'],
  edge: ['아슬아슬!', 'close'],
  land: ['골인!', 'win'],
};

/** 판 끝 길이(테스트·크게 보기 전환에서 쓴다). 한 곳뿐이면 0. */
export function plinkoDuration(count: number, winnerIndex: number, run: number): number {
  return plinkoPlan(count, winnerIndex, seededRandom(run))?.endMs ?? 0;
}

export function Plinko({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const b = useMemo(() => plinkoBoard(count), [count]);
  const plan: PlinkoPlan | null = useMemo(
    () => (winnerIndex === null ? null : plinkoPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );
  const [state, setState] = useState<{ run: number; ms: number }>({ run: -1, ms: -1 });

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 떨어지는 장면 없이 칸에 든 모습만 보인다.
      setState({ run, ms: Infinity });
      const tm = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(tm);
    }
    // 이번 판을 시작한다.
    setState({ run, ms: 0 });
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const ms = now - t0;
      setState((s) => (s.run === run ? { run, ms: Math.min(ms, plan.endMs) } : s));
      if (ms < plan.endMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const end = window.setTimeout(() => {
      setState({ run, ms: Infinity });
      onSpinEnd();
    }, plan.endMs);

    const rows = Math.max(1, b.rows - 1);
    const sounds: [number, PlinkoSfxName | SfxName, number?][] = [[0, 'whirr'], [plan.releaseMs, 'clack']];
    plan.decoys.forEach((d) => sounds.push([d.start, 'clack'], [d.landMs, 'thunk']));
    plan.hits.forEach((h) => {
      sounds.push([h.at, 'peg', h.row / rows]);
      if (h.bumper && h.ball === 0) sounds.push([h.at, 'boing']);
    });
    plan.beats.forEach((bt) => {
      if (bt.kind === 'fake' || bt.kind === 'perch') sounds.push([bt.at, 'wobble']);
      if (bt.kind === 'edge') sounds.push([bt.at, 'teeter']);
    });
    sounds.push([plan.landMs, 'thunk'], [plan.landMs + 80, 'fanfare']);
    const stopSfx = plinkoSfxLater(sounds);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(end);
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan, b.rows]);

  // 핀마다 맞은 시각들 — 진짜 공 · 모든 공.
  const pinHitsMap = useMemo(() => {
    const all = new Map<string, number[]>();
    const real = new Map<string, number>();
    plan?.hits.forEach((h) => {
      const k = `${h.row}-${h.pin}`;
      all.set(k, [...(all.get(k) ?? []), h.at]);
      if (h.ball === 0 && !real.has(k)) real.set(k, h.at);
    });
    return { all, real };
  }, [plan]);

  if (count === 0) return <div className="plinko plinko--empty" />;

  const live = state.run === run;
  const settled = !live && winnerIndex !== null && !spinning;
  // -1 = 아직 안 돌림(공은 드로퍼 안). Infinity = 끝난 모습.
  const rawMs = live ? state.ms : settled ? Infinity : -1;
  const ms = plan ? Math.min(rawMs, plan.endMs) : rawMs;
  const done = winnerIndex !== null && (rawMs === Infinity || (plan !== null && ms >= plan.landMs));

  const cur = plan && ms >= 0 ? beatAt(plan, ms) : null;
  const beat = cur?.beat ?? null;
  const slow = !!plan && ms >= plan.slowMs && ms < plan.landMs && rawMs !== Infinity;
  const intro = !!plan && ms >= 0 && ms < plan.introMs;

  // 카메라.
  let camStyle: React.CSSProperties | undefined;
  if (plan && ms >= 0 && rawMs !== Infinity) {
    const c = cameraAt(plan, b, ms);
    const { tx, ty, z } = cameraTransform(c.fx, c.fy, c.z);
    camStyle = { transform: `translate(${tx.toFixed(2)}%, ${ty.toFixed(2)}%) scale(${z.toFixed(3)})` };
  }

  // 공 자리.
  const dx = dropperX(plan, b, Math.max(0, ms));
  let ball = { x: dx, y: dropY };
  if (done && winnerIndex !== null) ball = { x: slotX(b, winnerIndex), y: restY(b) };
  else if (plan && ms >= 0) {
    const p = ballAt(plan.real, ms) ?? ball;
    ball = ms < plan.introMs ? { x: p.x + dx - b.cx, y: p.y } : p;
  }
  const falling = !!plan && ms > plan.releaseMs && ms < plan.landMs;
  const trail = falling && plan ? [45, 90, 135].map((d) => ballAt(plan.real, ms - d)).filter((p) => p !== null) : [];
  const held = !plan || ms < plan.releaseMs;

  const lastBump = plan?.hits.filter((h) => h.ball === 0 && h.bumper && h.at <= ms).at(-1)?.at ?? -Infinity;
  const bumpShake = ms - lastBump < 280;
  const flash = !!plan && rawMs !== Infinity && ms >= plan.landMs && ms - plan.landMs < 380;

  const decoyLanded = new Set(plan?.decoys.filter((d) => ms >= d.landMs).map((d) => d.slot) ?? []);
  const name = (i: number | null | undefined, n = 10) => (i == null ? '' : shortName(candidates[i].name, n));

  const status = (() => {
    if (done && winnerIndex !== null) return `골인! ${name(winnerIndex, 12)} 칸에 쏙 들어갔어요`;
    if (!beat) return `공을 떨어뜨리면 핀을 따라 내려가 ${count}개 칸 중 하나에 들어가요`;
    switch (beat.kind) {
      case 'intro':
        return '드로퍼가 자리를 잡고 있어요…';
      case 'decoy':
        return '어? 공이 먼저 떨어져요!';
      case 'decoyLand':
        return `${name(beat.slot)} 칸… 근데 이건 가짜 공이에요!`;
      case 'hesitate':
        return beat.afterDecoy ? '진짜 공은 이거예요. 떨어질까 말까…' : '떨어질까 말까…';
      case 'fake':
        return '앗, 아직이에요!';
      case 'drop':
        return '톡! 공이 떨어져요';
      case 'perch':
        return '첫 핀 위에서 멈칫했어요…';
      case 'bump':
        return '범퍼에 맞고 튀어 올랐어요!';
      case 'slow':
        return '마지막 핀이에요… 두근두근';
      case 'edge':
        return `아슬아슬! ${name(beat.slot)} 칸으로 넘어갈까…?`;
      default:
        return '공이 내려가고 있어요…';
    }
  })();
  const callout = (() => {
    if (!cur || rawMs === Infinity || ms - cur.beat.at > CALLOUT_MS) return null;
    const c = CALLOUT[cur.beat.kind];
    return c ? { text: c[0], tone: c[1], key: cur.index } : null;
  })();

  const H = b.totalH;
  const labelPct = (b.labelH / H) * 100;
  const nameMax = count > 10 ? 4 : count > 4 ? 6 : 8;
  const winX = winnerIndex === null ? 50 : (slotX(b, winnerIndex) / b.W) * 100;

  return (
    <div
      className={['plinko', expanded ? 'plinko--big' : '', count <= 4 ? 'plinko--wide' : '', settled ? 'plinko--settled' : '']
        .filter(Boolean)
        .join(' ')}
      // 그림 폭 ÷ 높이. 크게 보기 폭 식(desktop.css)이 후보 수와 상관없이 높이에 맞춘다.
      style={{ '--fit': (b.W / H).toFixed(3) } as React.CSSProperties}
    >
      <div
        className={['plinko__view', bumpShake ? 'plinko__view--bump' : '', slow || intro ? 'plinko__view--slow' : ''].filter(Boolean).join(' ')}
        role="img"
        aria-label={`플링코 판, 칸 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
      >
        <div className="plinko__world" style={camStyle}>
          <svg className="plinko__board" viewBox={`0 ${-HEAD} ${b.W} ${H}`} aria-hidden="true">
            <rect className="plinko__back" x={0} y={-HEAD} width={b.W} height={HEAD + b.boardH} />
            {/* 칸(바닥은 이름표 띠까지 이어진다). */}
            {candidates.map((p, k) => (
              <rect
                key={p.id}
                className={[
                  'plinko__bin',
                  done && k === winnerIndex ? 'plinko__bin--win' : '',
                  decoyLanded.has(k) && k !== winnerIndex ? 'plinko__bin--miss' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                x={k * b.slotW}
                y={wallTop(b)}
                width={b.slotW}
                height={H - HEAD - wallTop(b)}
                style={{ '--cat-hue': categoryHue(p.category) } as React.CSSProperties}
              />
            ))}
            {Array.from({ length: count + 1 }, (_, k) => (
              <line
                key={k}
                className={[
                  'plinko__wall',
                  plan?.neighbour != null && beat?.kind === 'edge' && k === Math.max(plan.neighbour, winnerIndex ?? 0) ? 'plinko__wall--edge' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                x1={k * b.slotW}
                x2={k * b.slotW}
                y1={wallTop(b)}
                y2={H - HEAD}
              />
            ))}
            {/* 핀. 범퍼는 크고 맞으면 번쩍인다. */}
            {Array.from({ length: b.rows }, (_, r) =>
              Array.from({ length: r + 1 }, (_, j) => {
                const key = `${r}-${j}`;
                const bumper = !!plan?.bumpers.includes(key);
                const ats = pinHitsMap.all.get(key);
                const lastHit = ats ? Math.max(-Infinity, ...ats.filter((a) => a <= ms)) : -Infinity;
                const age = ms - lastHit;
                const realAt = pinHitsMap.real.get(key);
                const trailed = realAt !== undefined && realAt <= ms;
                if (bumper) {
                  const k = age < BUMP_FLASH_MS ? 1 - age / BUMP_FLASH_MS : 0;
                  return (
                    <g key={key} className={k > 0 ? 'plinko__bumper plinko__bumper--hit' : 'plinko__bumper'}>
                      <circle className="plinko__bumper-ring" cx={pinX(b, r, j)} cy={pinY(b, r)} r={5.6 + k * 5} style={{ opacity: k > 0 ? k : undefined }} />
                      <circle className="plinko__pin plinko__bumper-core" cx={pinX(b, r, j)} cy={pinY(b, r)} r={4.6 + k * 1.6} />
                    </g>
                  );
                }
                const now = age < PIN_FLASH_MS;
                return (
                  <circle
                    key={key}
                    className={now ? 'plinko__pin plinko__pin--now' : trailed ? 'plinko__pin plinko__pin--hit' : 'plinko__pin'}
                    cx={pinX(b, r, j)}
                    cy={pinY(b, r)}
                    r={now ? 4.5 : 3}
                  />
                );
              }),
            )}
            {/* 드로퍼 — 레일 위 집게. 공을 물고 있다가 놓는다. */}
            <line className="plinko__rail" x1={4} x2={b.W - 4} y1={-HEAD + 4} y2={-HEAD + 4} />
            <g className={['plinko__dropper', held ? '' : 'plinko__dropper--open', intro ? 'plinko__dropper--move' : ''].filter(Boolean).join(' ')} transform={`translate(${dx.toFixed(2)} 0)`}>
              <rect className="plinko__carriage" x={-11} y={-HEAD + 1} width={22} height={7} rx={2.5} />
              <circle className="plinko__lamp" cx={0} cy={-HEAD + 4.5} r={1.8} />
              <path className="plinko__claw plinko__claw--l" d={`M -4 ${-HEAD + 8} L -9 ${dropY - 2} L -6 ${dropY + 4}`} />
              <path className="plinko__claw plinko__claw--r" d={`M 4 ${-HEAD + 8} L 9 ${dropY - 2} L 6 ${dropY + 4}`} />
            </g>
            {[...decoyLanded].filter((k) => k !== winnerIndex).map((k) => (
              <text key={`x${k}`} className="plinko__miss" x={slotX(b, k)} y={wallTop(b) + 2} fontSize={Math.min(b.slotW * 0.5, 9)} textAnchor="middle" dominantBaseline="hanging">
                꽝
              </text>
            ))}
            {/* 가짜 공 — 회색, 칸에 들어간 뒤에도 남는다. */}
            {plan?.decoys.map((d, k) => {
              const p = ms >= 0 ? (rawMs === Infinity ? d.segs[d.segs.length - 1].to : ballAt(d, ms)) : null;
              return p ? <circle key={k} className="plinko__decoy" cx={p.x} cy={p.y} r={BALL_R * 0.92} /> : null;
            })}
            {trail.map((p, k) => (
              <circle key={`t${k}`} className="plinko__trail" cx={p.x} cy={p.y} r={BALL_R * (0.85 - k * 0.15)} style={{ opacity: 0.32 - k * 0.09 }} />
            ))}
            {slow && <circle className="plinko__glow" cx={ball.x} cy={ball.y} r={BALL_R * 2.1} />}
            <circle className="plinko__ball" cx={ball.x} cy={ball.y} r={BALL_R} />
            <circle className="plinko__shine" cx={ball.x - BALL_R * 0.35} cy={ball.y - BALL_R * 0.35} r={BALL_R * 0.28} />
          </svg>
          <ol className="plinko__slots" style={{ height: `${labelPct.toFixed(3)}%`, gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
            {candidates.map((p, i) => (
              <li
                key={p.id}
                className={[
                  'plinko__slot',
                  done && i === winnerIndex ? 'plinko__slot--win' : '',
                  decoyLanded.has(i) && i !== winnerIndex ? 'plinko__slot--miss' : '',
                  beat?.kind === 'edge' && beat.slot === i && !done ? 'plinko__slot--near' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={p.name}
              >
                {shortName(p.name, nameMax)}
              </li>
            ))}
          </ol>
          {done && rawMs !== Infinity && (
            <span className="plinko__confetti" style={{ left: `${winX}%`, top: `${((restY(b) + HEAD) / H) * 100}%` }} aria-hidden="true">
              {Array.from({ length: CONFETTI }, (_, k) => (
                <span key={k} style={{ '--a': `${-80 + (k * 160) / (CONFETTI - 1)}deg`, '--h': (k * 47) % 360, '--d': `${0.7 + (k % 4) * 0.2}` } as React.CSSProperties} />
              ))}
            </span>
          )}
        </div>
        <div className="plinko__fx" aria-hidden="true">
          {slow && (
            <>
              <span className="plinko__bar plinko__bar--top" />
              <span className="plinko__bar plinko__bar--bottom" />
            </>
          )}
          {flash && <span className="plinko__flash" />}
          {callout && (
            <span key={`${run}-${callout.key}`} className={`plinko__callout plinko__callout--${callout.tone}`}>
              {callout.text}
            </span>
          )}
        </div>
      </div>
      <p className="plinko__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
