/**
 * 보물찾기 — 해적 섬 지도 위 X 표시마다 가게 이름이 붙어 있고, 꼬마 해적이 삽을 들고 X 를 하나씩 판다.
 * 진짜 보물 상자가 나온 곳이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). X 자리는 후보 수마다 한 번, 파 볼 가짜 자리·사건·시각은
 * 판 번호 run 시드로 lib/treasure.ts 가 정한다. 마지막 구덩이는 언제나 당첨 자리다.
 *
 * 인트로(지도가 펼쳐지고 X 가 떨어진다) → 구덩이마다: (앵무새의 가짜 힌트) → (돌풍 — 지도가 날아갔다 카메라가 다시 잡는다)
 * → 점선을 따라 깡총 걸어감(카메라가 따라감) → 파바박 → (꽃게가 집음) → 나온 것(꽝·낡은 장화·동전 한 닢·미믹).
 * 마지막 구덩이는 (텅 빈 줄 알았는데 더 판다) → 상자가 솟고 → 금빛과 함께 열리며 동전이 쏟아진 뒤 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useAmbience } from '../../hooks/useAmbience';
import type { AmbienceSeason } from '../../lib/ambience';
import { SceneWeather } from './scene/SceneWeather';
import { SeasonProp } from './scene/SeasonProp';
import { ambienceClasses } from './scene/outfit';
import './Treasure.ambience.css';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { treasureSfxLater, type SfxName, type TreasureSfxName } from '../../lib/sfx';
import {
  cameraAt,
  standAt,
  timeline,
  treasureLayout,
  treasurePlan,
  walkControl,
  walkPath,
  type Dig,
  type DigPhase,
  type MapLayout,
} from '../../lib/treasure';
import { prefersReducedMotion, type GameProps } from './types';
import './Treasure.css';

type Phase = 'intro' | DigPhase | 'settle';

interface TreasureState {
  run: number;
  /** 지금 구덩이(인트로는 −1). */
  dig: number;
  phase: Phase;
}

/** X 자리는 후보 수마다 한 번 정한다 — 판마다 바뀌면 아까 그 X 를 눈으로 따라갈 수 없다. */
const LAYOUT_SEED = 23;
/** 터지는 동전 수. */
const COINS = 14;
/** 파낼 때 튀는 흙 알갱이 수. */
const DIRT = 7;

const ORDER: Record<Phase, number> = { intro: -1, parrot: 0, gust: 1, walk: 2, dig: 3, crab: 4, deep: 5, reveal: 6, open: 7, settle: 8 };
const pct = (n: number) => `${n.toFixed(2)}%`;

/** 카메라 transform 한 장. */
function cam(x: number, y: number, zoom: number): string {
  if (zoom <= 1) return 'translate(0%, 0%) scale(1)';
  const { tx, ty } = cameraAt(x, y, zoom);
  return `translate(${pct(tx)}, ${pct(ty)}) scale(${zoom})`;
}

/** 카메라 배율. 칸이 작을수록 더 당겨 본다. */
function zoomFor(layout: MapLayout): number {
  return layout.cols <= 2 ? 1.3 : layout.cols === 3 ? 1.45 : 1.7;
}

function SeasonCorner({ start, season }: { start: { x: number; y: number }; season: AmbienceSeason }) {
  // 여름은 원래 야자수, 다른 계절은 벚나무·단풍나무·눈사람이 그 자리를 지킨다.
  if (season === 'summer') return <Palm start={start} />;
  return (
    <span className="treasure__palm treasure__prop" style={{ top: pct(start.y) }} aria-hidden="true">
      <SeasonProp season={season} />
    </span>
  );
}

export function Treasure({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [state, setState] = useState<TreasureState>({ run: -1, dig: -1, phase: 'intro' });
  const layout = useMemo(() => treasureLayout(count, seededRandom(LAYOUT_SEED + count)), [count]);
  // 일정은 판 번호 시드라 몇 번 계산해도 같다. 구덩이·길을 그리려고 렌더에서도 쓴다.
  const plan = useMemo(
    () => (winnerIndex === null ? null : treasurePlan(layout, winnerIndex, seededRandom(run))),
    [layout, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 파는 장면 없이 열린 보물 상자만 보인다.
      setState({ run, dig: plan ? plan.digs.length - 1 : 0, phase: 'settle' });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 인트로에서 멈춘다.
    setState({ run, dig: -1, phase: 'intro' });

    const timers: number[] = [];
    const at = (ms: number, dig: number, phase: Phase) =>
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, dig, phase } : s)), ms));
    for (const e of timeline(plan)) at(e.ms, e.dig, e.phase);
    at(plan.settleMs, plan.digs.length - 1, 'settle');
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, TreasureSfxName | SfxName][] = [[40, 'unroll']];
    plan.digs.forEach((d) => {
      for (const p of d.phases) {
        if (p.phase === 'parrot') sounds.push([p.ms + 120, 'squawk']);
        else if (p.phase === 'gust') sounds.push([p.ms, 'whoosh']);
        else if (p.phase === 'dig' || p.phase === 'deep') sounds.push([p.ms + (p.phase === 'deep' ? 260 : 40), 'shovel']);
        else if (p.phase === 'crab') sounds.push([p.ms + 140, 'snip']);
        else if (p.phase === 'open') sounds.push([p.ms, 'fanfare']);
        else if (p.phase === 'reveal') {
          if (d.kind === 'empty') sounds.push([p.ms, 'thunk']);
          else if (d.kind === 'boot') sounds.push([p.ms + 60, 'bump']);
          else if (d.kind === 'coin') sounds.push([p.ms, 'clunk'], [p.ms + 260, 'coin']);
          else if (d.kind === 'mimic') sounds.push([p.ms, 'clunk'], [p.ms + 240, 'chomp']);
          else sounds.push([p.ms, 'clunk']);
        }
      }
    });
    const stopSfx = treasureSfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="treasure treasure--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 열린 보물 상자를 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const phase: Phase | null = live ? state.phase : settled ? 'settle' : null;
  const digs = plan?.digs ?? [];
  const digIdx = live ? state.dig : digs.length - 1;
  const dig: Dig | null = phase && phase !== 'settle' && phase !== 'intro' ? (digs[digIdx] ?? null) : null;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const nameMax = expanded ? 8 : layout.cols >= 4 ? 6 : 8;
  const name = (i: number) => shortName(candidates[i].name, 10);
  const final = dig?.kind === 'treasure';
  const after = (p: Phase) => phase !== null && ORDER[phase] >= ORDER[p];

  /** 구덩이 k 가 지금 파였는가 · 지금 파는 중인가. */
  const dugDone = (k: number) => phase === 'settle' || (phase !== null && (k < digIdx || (k === digIdx && after('reveal'))));
  const digging = (k: number) => k === digIdx && (phase === 'dig' || phase === 'crab' || phase === 'deep');
  const digOf = new Map<number, { k: number; d: Dig }>();
  digs.forEach((d, k) => digOf.set(d.spot, { k, d }));
  // 한 곳뿐(plan 없음)이면 그 자리에서 바로 보물.
  const soloWin = !plan && phase === 'settle' && winnerIndex !== null;

  // 해적 자리.
  const posBefore = (k: number) => (k <= 0 ? layout.start : standAt(layout, digs[k - 1].spot));
  let pirate = layout.start;
  let walking: { from: { x: number; y: number }; to: { x: number; y: number }; ms: number } | null = null;
  // 상자가 열리면 한 발 물러나 만세 — 커진 보물 상자에 가리지 않게.
  const cheerBack = (p: { x: number; y: number }) => ({ x: Math.max(layout.cellW * 0.18, p.x - layout.cellW * 0.14), y: p.y });
  if (phase === 'settle' && winnerIndex !== null) pirate = cheerBack(standAt(layout, winnerIndex));
  else if (dig) {
    const from = posBefore(digIdx);
    const to = standAt(layout, dig.spot);
    if (phase === 'parrot' || phase === 'gust') pirate = from;
    else if (phase === 'walk') {
      const walkEnd = dig.phases.find((p) => ORDER[p.phase] > ORDER.walk)?.ms ?? dig.digMs;
      walking = { from, to, ms: walkEnd - dig.walkMs };
      pirate = to;
    } else pirate = phase === 'open' ? cheerBack(to) : to;
  }

  // 카메라.
  const z = zoomFor(layout);
  let worldStyle: React.CSSProperties = {};
  if (dig) {
    const spot = layout.spots[dig.spot];
    if (phase === 'parrot') {
      // 해적과 앵무새가 가리키는 X 가 같이 보이게 물러난다(멀면 지도 전체).
      const span = Math.max(Math.abs(pirate.x - spot.x), Math.abs(pirate.y - spot.y)) + 30;
      worldStyle = { transform: cam((pirate.x + spot.x) / 2, (pirate.y + spot.y) / 2, Math.max(1, Math.min(z - 0.45, 100 / span))) };
    } else if (phase === 'gust') worldStyle = { transform: cam(pirate.x, pirate.y - 4, z) };
    else if (phase === 'walk' && walking)
      worldStyle = { transform: cam(spot.x, spot.y, z), '--walk': `${walking.ms}ms` } as React.CSSProperties;
    else worldStyle = { transform: cam(spot.x, spot.y, final ? z + 0.35 : z) };
  }

  const status = (() => {
    if (phase === 'settle' && winner) return `보물 발견! ${shortName(winner.name, 14)}`;
    if (phase === 'intro') return '보물 지도를 펼쳐요…';
    if (!dig) return `X 표시 ${count}곳 — 보물은 딱 한 곳!`;
    const n = name(dig.spot);
    switch (phase) {
      case 'parrot':
        return '앵무새: 저기예요!';
      case 'gust':
        return '휘잉~ 바람에 지도가 날아가요!';
      case 'walk':
        return final ? `이번엔 ${n}…?` : digIdx === 0 ? `${n}부터 파 볼까요?` : `다음은 ${n}!`;
      case 'dig':
        return final ? `파바박! ${n}… 이번엔?` : `파바박! ${n} 아래를 파요`;
      case 'crab':
        return '아야! 꽃게가 집었어요';
      case 'deep':
        return '어라, 텅 비었나…? 더 파 볼게요';
      case 'open':
        return '보물 발견!';
      default:
        switch (dig.kind) {
          case 'empty':
            return dig.parrot ? '꽝! 앵무새가 속였어요' : '꽝! 아무것도 없어요';
          case 'boot':
            return '낡은 장화… 이건 아니에요';
          case 'coin':
            return '동전 한 닢… 아깝다!';
          case 'mimic':
            return '앗, 미믹이에요!';
          default:
            return '뭔가 걸렸어요… 상자다!';
        }
    }
  })();

  // 화면 위 큰 글씨(만화 효과음).
  const callout = (() => {
    if (!dig) return null;
    switch (phase) {
      case 'gust':
        return { text: '휘잉~', tone: 'wind' };
      case 'dig':
        return { text: '파바박!', tone: 'dirt' };
      case 'crab':
        return { text: '아야!', tone: 'ouch' };
      case 'deep':
        return { text: '어라…?', tone: 'dirt' };
      case 'open':
        return { text: '보물 발견!', tone: 'gold' };
      case 'reveal': {
        const map: Record<Dig['kind'], [string, string]> = {
          empty: ['꽝!', 'miss'],
          boot: ['장화?!', 'miss'],
          coin: ['에게?', 'close'],
          mimic: ['덥석!', 'ouch'],
          treasure: ['두근두근…', 'gold'],
        };
        const [text, tone] = map[dig.kind];
        return { text, tone };
      }
      default:
        return null;
    }
  })();

  const pirateClass = (() => {
    if (phase === 'settle' || phase === 'open') return 'treasure__pirate--cheer';
    if (!dig) return '';
    switch (phase) {
      case 'walk':
        return 'treasure__pirate--walk';
      case 'gust':
        return 'treasure__pirate--hold';
      case 'dig':
        return 'treasure__pirate--dig';
      case 'crab':
        return 'treasure__pirate--ouch';
      case 'deep':
        return 'treasure__pirate--deep';
      case 'reveal':
        if (dig.kind === 'mimic') return 'treasure__pirate--startle';
        if (dig.kind === 'treasure') return 'treasure__pirate--wow';
        return 'treasure__pirate--sad';
      default:
        return '';
    }
  })();
  const flip = walking ? walking.to.x < walking.from.x - 0.5 : false;

  // 지나온 점선 길(지도 단위: 폭 100, 높이 100 / aspect).
  const H = 100 / layout.aspect;
  const legs: { k: number; d: string; drawing: boolean }[] = [];
  if (phase && phase !== 'intro')
    digs.forEach((d, k) => {
      if (phase !== 'settle' && (k > digIdx || (k === digIdx && !after('walk')))) return;
      const a = posBefore(k);
      const b = standAt(layout, d.spot);
      const c = walkControl(layout, a, b, d.bend);
      const sy = (y: number) => ((y / 100) * H).toFixed(2);
      legs.push({
        k,
        d: `M${a.x.toFixed(2)} ${sy(a.y)} Q${c.x.toFixed(2)} ${sy(c.y)} ${b.x.toFixed(2)} ${sy(b.y)}`,
        drawing: k === digIdx && phase === 'walk',
      });
    });

  const pirateStyle: Record<string, string> = { left: pct(pirate.x), top: pct(pirate.y) };
  if (walking) {
    const pts = walkPath(layout, walking.from, walking.to, digs[digIdx].bend);
    pirateStyle['--walk'] = `${walking.ms}ms`;
    pts.forEach((p, k) => {
      pirateStyle[`--x${k}`] = pct(p.x);
      pirateStyle[`--y${k}`] = pct(p.y);
    });
  }

  const parrotOn = dig?.parrot && (phase === 'parrot' || phase === 'gust' || phase === 'walk');

  return (
    <div
      className={['treasure', 'scene-outfit', ambienceClasses(ambience), expanded ? 'treasure--big' : '', settled ? 'treasure--settled' : ''].filter(Boolean).join(' ')}
      // 지도 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': layout.aspect.toFixed(4) } as React.CSSProperties}
    >
      <div
        className={[
          'treasure__range',
          phase === 'intro' ? 'treasure__range--intro' : '',
          phase === 'gust' ? 'treasure__range--gust' : '',
          phase === 'open' ? 'treasure__range--hit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="img"
        aria-label={`보물 지도, X 표시 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        style={
          {
            '--size': `${layout.size}cqw`,
            '--cell': `${layout.cellW}cqw`,
            '--top': pct(layout.top),
            '--beach': pct(layout.beach),
            '--n': count,
          } as React.CSSProperties
        }
      >
        <div
          className={[
            'treasure__world',
            phase === 'walk' ? 'treasure__world--walk' : '',
            phase === 'gust' ? 'treasure__world--gust' : '',
            phase === 'settle' ? 'treasure__world--settle' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={worldStyle}
        >
          <span className="treasure__island" style={{ top: pct(layout.top * 0.72), bottom: pct(Math.max(2, 100 - layout.start.y - (100 - layout.beach) * 0.3)) }} aria-hidden="true" />
          <span className="treasure__title" style={{ top: pct(layout.top * 0.18), height: pct(layout.top * 0.62) }} aria-hidden="true">
            보물 지도
          </span>
          <Compass top={layout.top} />
          <Boat start={layout.start} />
          <SeasonCorner start={layout.start} season={ambience.season} />

          <svg className="treasure__trail" viewBox={`0 0 100 ${H.toFixed(2)}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              {legs
                .filter((l) => l.drawing)
                .map((l) => (
                  <mask key={l.k} id={`treasure-reveal-${run}-${l.k}`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height={H.toFixed(2)}>
                    <path d={l.d} pathLength={1} className="treasure__trail-mask" style={{ '--walk': `${walking?.ms ?? 400}ms` } as React.CSSProperties} />
                  </mask>
                ))}
            </defs>
            {legs.map((l) => (
              <path
                key={`${run}-${l.k}`}
                d={l.d}
                className="treasure__trail-line"
                mask={l.drawing ? `url(#treasure-reveal-${run}-${l.k})` : undefined}
              />
            ))}
          </svg>

          {candidates.map((p, i) => {
            const s = layout.spots[i];
            const entry = digOf.get(i);
            const done = !!entry && dugDone(entry.k);
            const now = !!entry && digging(entry.k);
            const current = !!entry && entry.k === digIdx && phase !== 'settle';
            const kind = soloWin && i === winnerIndex ? 'treasure' : done ? entry!.d.kind : null;
            const isWin = (phase === 'settle' && i === winnerIndex) || (kind === 'treasure' && phase === 'open');
            const hinted = !!dig && dig.parrot && dig.spot === i && (phase === 'parrot' || phase === 'gust' || phase === 'walk');
            return (
              <div
                key={p.id}
                title={p.name}
                className={[
                  'treasure__spot',
                  done || now || kind ? 'treasure__spot--dug' : '',
                  current && phase === 'reveal' ? 'treasure__spot--reveal' : '',
                  hinted ? 'treasure__spot--hint' : '',
                  isWin ? 'treasure__spot--win' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ left: pct(s.x), top: pct(s.y), '--tilt': `${s.tilt}deg`, '--i': i } as React.CSSProperties}
              >
                <span className="treasure__mark" aria-hidden="true">
                  <span className="treasure__x" />
                  <span className="treasure__hole" />
                  {now && (
                    <span key={`${run}-${phase}`} className={['treasure__dirt', phase === 'deep' ? 'treasure__dirt--late' : ''].filter(Boolean).join(' ')}>
                      {Array.from({ length: DIRT }, (_, k) => (
                        <span key={k} style={{ '--a': `${-70 + (k * 140) / (DIRT - 1)}deg`, '--d': `${0.7 + (k % 3) * 0.2}`, '--t': `${(k % 4) * 60}ms` } as React.CSSProperties} />
                      ))}
                    </span>
                  )}
                  {now && phase === 'crab' && <Crab />}
                  {kind && (
                    <Find
                      kind={kind}
                      live={current && (phase === 'reveal' || phase === 'open')}
                      open={kind !== 'treasure' || phase === 'open' || phase === 'settle'}
                    />
                  )}
                  {isWin && <Burst key={`burst-${run}`} still={settled} />}
                </span>
                <span className="treasure__tag" aria-hidden="true">
                  {isWin ? p.name : shortName(p.name, nameMax)}
                </span>
              </div>
            );
          })}

          <span
            key={walking ? `walk-${run}-${digIdx}` : 'pirate'}
            className={['treasure__pirate', walking ? 'treasure__pirate--move' : '', pirateClass, flip ? 'treasure__pirate--flip' : '', phase === 'intro' ? 'treasure__pirate--enter' : '']
              .filter(Boolean)
              .join(' ')}
            style={pirateStyle as React.CSSProperties}
            aria-hidden="true"
          >
            <Pirate />
            {parrotOn && dig && (
              <span key={`parrot-${run}-${digIdx}`} className={['treasure__parrot', phase !== 'parrot' ? 'treasure__parrot--leave' : ''].filter(Boolean).join(' ')}>
                <Parrot />
                {phase === 'parrot' && <span className="treasure__bubble">저기예요!</span>}
              </span>
            )}
            {phase === 'deep' && <span className="treasure__think">?</span>}
          </span>
        </div>

        <SceneWeather weather={ambience.weather} band={[0, layout.top]} />
        {/* 화면에 붙은 효과(카메라 배율과 상관없음). */}
        <div className="treasure__fx" aria-hidden="true">
          {phase === 'intro' && <span className="treasure__roll" />}
          {phase === 'gust' && (
            <>
              <span className="treasure__wind" />
              {[0, 1, 2].map((k) => (
                <span key={k} className="treasure__leaf" style={{ '--k': k } as React.CSSProperties} />
              ))}
            </>
          )}
          {(phase === 'dig' || phase === 'deep' || phase === 'reveal') && final && <span className="treasure__vignette" />}
          {phase === 'open' && <span className="treasure__flash" />}
          {callout && (
            <span key={`${run}-${digIdx}-${phase}`} className={`treasure__callout treasure__callout--${callout.tone}`}>
              {callout.text}
            </span>
          )}
        </div>
      </div>
      <p className="treasure__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 파낸 것. live 면 지금 막 나오는 중(튀어나오는 움직임), 아니면 구덩이 옆에 놓인 모습. */
function Find({ kind, live, open }: { kind: Dig['kind']; live: boolean; open: boolean }) {
  const cls = (base: string) => [base, live ? `${base}--live` : ''].filter(Boolean).join(' ');
  if (kind === 'empty') return live ? <span className="treasure__puff" /> : null;
  if (kind === 'boot') {
    return (
      <svg className={cls('treasure__boot')} viewBox="0 0 30 30">
        <path d="M9 3 H19 V17 Q19 19 21 19 H25 Q29 19 29 24 V27 H5 Q3 27 3 25 V20 Q3 18 6 17 L9 16 Z" className="treasure__boot-body" />
        <path d="M9 3 H19 V7 H9 Z" className="treasure__boot-top" />
        <path d="M5 27 H29" className="treasure__boot-sole" />
        <path d="M10 22 l2 -2 M14 23 l2 -2" className="treasure__boot-patch" />
      </svg>
    );
  }
  return <Chest kind={kind} live={live} open={open} />;
}

/** 보물 상자(앞모습). 뚜껑은 뒤 경첩을 축으로 젖혀진다. 미믹은 이빨·눈·혀가 있다. */
function Chest({ kind, live, open }: { kind: 'coin' | 'mimic' | 'treasure'; live: boolean; open: boolean }) {
  return (
    <svg
      className={['treasure__chest', `treasure__chest--${kind}`, live ? 'treasure__chest--live' : '', open ? 'treasure__chest--open' : ''].filter(Boolean).join(' ')}
      viewBox="0 0 44 40"
    >
      {kind === 'treasure' && <circle cx="22" cy="20" r="20" className="treasure__chest-glow" />}
      {/* 속 — 뚜껑이 열리면 보인다 */}
      <path d="M5 18 Q22 10 39 18 V22 H5 Z" className="treasure__chest-inside" />
      {kind === 'treasure' && (
        <g className="treasure__gold">
          <ellipse cx="22" cy="19" rx="14" ry="4.5" />
          <circle cx="14" cy="16" r="3" />
          <circle cx="22" cy="14.5" r="3.4" />
          <circle cx="30" cy="16" r="3" />
          <path d="M19 12 l3 -5 l3 5 z" className="treasure__gem" />
        </g>
      )}
      {kind === 'coin' && (
        <g className="treasure__one-coin">
          <circle cx="22" cy="15.5" r="4.2" />
          <path d="M22 13 v5" className="treasure__one-coin-mark" />
        </g>
      )}
      {kind === 'mimic' && (
        <g className="treasure__mimic-face">
          <path d="M9 17 Q22 23 35 17 Q22 20 9 17 Z" className="treasure__mimic-tongue" />
          <circle cx="16" cy="16" r="2" className="treasure__mimic-eye" />
          <circle cx="28" cy="16" r="2" className="treasure__mimic-eye" />
          <path d="M6 22 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l3 4 l3 -4 l2 4" className="treasure__mimic-teeth" />
        </g>
      )}
      {/* 몸통 */}
      <rect x="4" y="21" width="36" height="17" rx="2.5" className="treasure__chest-body" />
      <rect x="10" y="21" width="4" height="17" className="treasure__chest-band" />
      <rect x="30" y="21" width="4" height="17" className="treasure__chest-band" />
      <rect x="19" y="23" width="6" height="7" rx="1.2" className="treasure__chest-lock" />
      {/* 뚜껑 */}
      <g className="treasure__lid">
        <path d="M4 22 V15 Q4 7 12 7 H32 Q40 7 40 15 V22 Z" className="treasure__chest-body" />
        <rect x="10" y="7" width="4" height="15" className="treasure__chest-band" />
        <rect x="30" y="7" width="4" height="15" className="treasure__chest-band" />
        {kind === 'mimic' && <path d="M6 22 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l3 -3 l3 3 l2 -3" className="treasure__mimic-teeth" />}
      </g>
    </svg>
  );
}

/** 금빛 줄기와 쏟아지는 동전. still 이면(다시 그린 끝 장면) 동전은 생략. */
function Burst({ still }: { still: boolean }) {
  return (
    <>
      <span className="treasure__rays" />
      {!still && (
        <span className="treasure__coins">
          {Array.from({ length: COINS }, (_, k) => (
            <span
              key={k}
              style={{ '--a': `${-80 + (k * 160) / (COINS - 1)}deg`, '--d': `${0.9 + (k % 4) * 0.3}`, '--t': `${(k % 5) * 40}ms` } as React.CSSProperties}
            />
          ))}
        </span>
      )}
    </>
  );
}

/** 꼬마 해적 — 빨간 두건, 안대, 줄무늬 셔츠, 오른손에 삽. 발끝이 (20, 50). */
function Pirate() {
  return (
    <span className="treasure__body">
      <svg viewBox="0 0 48 54" className="treasure__pirate-svg">
        <ellipse cx="20" cy="51" rx="11" ry="2.6" className="treasure__p-shadow" />
        <g className="treasure__p-legs">
          <rect x="14" y="40" width="5" height="10" rx="2" className="treasure__p-leg" />
          <rect x="22" y="40" width="5" height="10" rx="2" className="treasure__p-leg" />
          <path d="M12 49 h8 v2.5 h-8 z M21 49 h8 v2.5 h-8 z" className="treasure__p-boot" />
        </g>
        <g className="treasure__p-torso">
          <rect x="11" y="27" width="19" height="15" rx="5" className="treasure__p-shirt acc-coat" />
          <path d="M11 31.5 h19 M11 36 h19" className="treasure__p-stripe acc-coat-detail" />
          <rect x="11" y="38" width="19" height="3" className="treasure__p-belt" />
          {/* 머리 */}
          <circle cx="20.5" cy="18" r="11" className="treasure__p-head" />
          <g className="acc-base">
            <path d="M9.6 16 Q10 6 20.5 6 Q31 6 31.4 16 Q20.5 11 9.6 16 Z" className="treasure__p-bandana" />
            <circle cx="11" cy="14.5" r="2.4" className="treasure__p-bandana" />
            <path d="M9.6 14 l-5 -3 l1 5 z M9.6 15 l-4 4 l4.5 0.5 z" className="treasure__p-bandana" />
            <circle cx="27" cy="11" r="1.2" className="treasure__p-dot" />
            <circle cx="19" cy="9.5" r="1.2" className="treasure__p-dot" />
          </g>
          {/* 계절·날씨 덧옷(scene.css 가 하나만 켠다) */}
          <path d="M11.5 27.5 Q20.5 31.5 29.5 27.5 L30 30.5 Q20.5 34.5 11 30.5 Z" className="acc acc-scarf" />
          <path d="M14 30.5 l-2 8 l3 0.6 l1.6 -8.2 Z" className="acc acc-scarf" />
          <path d="M9.4 17 Q9.4 5 20.5 5 Q31.6 5 31.6 17 Q20.5 12.6 9.4 17 Z" className="acc acc-beanie" />
          <circle cx="20.5" cy="4.6" r="2.8" className="acc acc-pom" />
          <path d="M8 23 Q6.4 4 20.5 4 Q34.6 4 33 23 Q30.5 11.5 20.5 11.5 Q10.5 11.5 8 23 Z" className="acc acc-hood" />
          <ellipse cx="20.5" cy="11.5" rx="15" ry="3" className="acc acc-brim" />
          <path d="M13 11.5 Q14 3 20.5 3 Q27 3 28 11.5 Z" className="acc acc-crown" />
          <g className="acc acc-flower">
            <circle cx="11" cy="9" r="2.2" />
            <circle cx="14" cy="7.5" r="2.2" />
            <circle cx="12.6" cy="11" r="2.2" />
            <circle cx="12.5" cy="9.2" r="1.3" className="acc-flower__eye" />
          </g>
          <path d="M11 13 L31 21" className="treasure__p-strap" />
          <ellipse cx="25" cy="18.3" rx="3" ry="2.7" className="treasure__p-patch" />
          <circle cx="17" cy="18" r="1.6" className="treasure__p-eye" />
          <circle cx="14.5" cy="22" r="2" className="treasure__p-blush" />
          <path d="M19 23.5 Q21.5 25.5 24 23.5" className="treasure__p-mouth" />
        </g>
        {/* 삽 — 손(29, 31)을 축으로 휘두른다 */}
        <g className="treasure__shovel">
          <line x1="29" y1="31" x2="40" y2="47" className="treasure__s-handle" />
          <path d="M37.5 45 L44 43 L46 50.5 Q42 53 38.5 50 Z" className="treasure__s-blade" />
          <circle cx="29" cy="31" r="3" className="treasure__p-hand" />
        </g>
      </svg>
    </span>
  );
}

/** 앵무새 — 빨간 몸에 노란·파란 날개. */
function Parrot() {
  return (
    <svg viewBox="0 0 30 30" className="treasure__parrot-svg">
      <path d="M8 24 l-4 5 l6 -2 z" className="treasure__pr-tail" />
      <ellipse cx="14" cy="17" rx="7" ry="9" className="treasure__pr-body" />
      <path d="M9 16 Q12 24 18 25 Q12 21 11 14 Z" className="treasure__pr-wing" />
      <circle cx="17" cy="9" r="5.5" className="treasure__pr-body" />
      <circle cx="18.5" cy="8" r="1.5" className="treasure__pr-eye" />
      <path d="M21.5 8 Q26 9 23.5 13.5 Q22.5 11 20.5 11 Z" className="treasure__pr-beak" />
    </svg>
  );
}

/** 꽃게 — 구덩이에서 나와 해적 발을 집는다. */
function Crab() {
  return (
    <svg viewBox="0 0 30 20" className="treasure__crab">
      <path d="M3 9 Q1 3 6 4 L5 7 Z M27 9 Q29 3 24 4 L25 7 Z" className="treasure__c-claw" />
      <path d="M6 15 l-4 3 M8 16 l-3 4 M24 15 l4 3 M22 16 l3 4" className="treasure__c-leg" />
      <ellipse cx="15" cy="13" rx="9" ry="5.5" className="treasure__c-body" />
      <path d="M11 8 v-3 M19 8 v-3" className="treasure__c-leg" />
      <circle cx="11" cy="5" r="1.6" className="treasure__c-eye" />
      <circle cx="19" cy="5" r="1.6" className="treasure__c-eye" />
    </svg>
  );
}

/** 나침반 — 위 띠 오른쪽. */
function Compass({ top }: { top: number }) {
  return (
    <svg className="treasure__compass" viewBox="0 0 40 40" style={{ top: pct(top * 0.12), height: pct(top * 0.76) }} aria-hidden="true">
      <circle cx="20" cy="20" r="17" className="treasure__compass-ring" />
      <path d="M20 3 L23 20 L20 37 L17 20 Z" className="treasure__compass-ns" />
      <path d="M3 20 L20 17 L37 20 L20 23 Z" className="treasure__compass-ew" />
      <path d="M20 3 L23 20 L17 20 Z" className="treasure__compass-n" />
    </svg>
  );
}

/** 해적이 타고 온 작은 배 — 모래사장 왼쪽. */
function Boat({ start }: { start: { x: number; y: number } }) {
  return (
    <svg className="treasure__boat" viewBox="0 0 40 30" style={{ top: pct(start.y) }} aria-hidden="true">
      <path d="M19 3 V21" className="treasure__boat-mast" />
      <path d="M20 4 L33 18 H20 Z" className="treasure__boat-sail" />
      <path d="M18 6 L10 17 H18 Z" className="treasure__boat-sail2" />
      <path d="M4 21 H36 L31 28 H9 Z" className="treasure__boat-hull" />
    </svg>
  );
}

/** 야자수 — 모래사장 오른쪽. */
function Palm({ start }: { start: { x: number; y: number } }) {
  return (
    <svg className="treasure__palm" viewBox="0 0 40 40" style={{ top: pct(start.y) }} aria-hidden="true">
      <path d="M20 38 Q22 26 19 14" className="treasure__palm-trunk" />
      <path d="M19 14 Q10 8 3 14 Q11 11 19 14 Z M19 14 Q28 7 37 13 Q28 11 19 14 Z M19 14 Q14 4 7 4 Q15 7 19 14 Z M19 14 Q25 3 33 5 Q24 7 19 14 Z" className="treasure__palm-leaf" />
      <circle cx="18" cy="16" r="2" className="treasure__palm-nut" />
      <circle cx="21.5" cy="16.5" r="2" className="treasure__palm-nut" />
    </svg>
  );
}
