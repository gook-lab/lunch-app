/**
 * 뽑기 기계 — 손잡이를 돌리면(드르륵 컷신) 돔 안 캡슐이 뒤섞이고 하나가 떨어진다. 크게 열면 뽁! 쪽지에 가게.
 *
 * 당첨은 App 이 정했다(winnerIndex). 돔 안 캡슐에는 이름이 없고 서로 구별되지 않으므로 어느 캡슐이
 * 떨어지든 공정하다 — 열어 본 쪽지가 당첨 가게다. 사건(출구까지 왔다 돌아가는 캡슐 · 출구에 걸림 ·
 * 골드 캡슐)과 시각은 판 번호 시드로 lib/gacha.ts 가 정하고, 당첨을 바꾸지 않는다.
 *
 * 각본은 단계(steps)마다 이름(say)을 들고 있다. 컴포넌트는 단계 번호만 바꾸고, 움직임은 CSS 가 한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { categoryHue, categoryLabel } from '../../lib/category';
import { gachaPlan, type GachaSay } from '../../lib/gacha';
import { withJosa } from '../../lib/josa';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { gachaCardsSfxLater, type GachaCardsSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SEASON_NAME } from '../../lib/ambience';
import { Horizon } from './scene/Horizon';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import { Climax } from './scene/Climax';
import './Gacha.css';
import './Gacha.ambience.css';

/** 돔 꼭대기 계절 장식(왼쪽·가운데·오른쪽). */
const TOPPER = { spring: ['🌷', '🌸', '🌷'], summer: ['🐚', '🌻', '🐚'], autumn: ['🍂', '🎃', '🍁'], winter: ['❄️', '🎄', '❄️'] } as const;

/** 돔에 그리는 캡슐 수 상한. 넘으면 "캡슐이 N개 더 있어요" 로 적는다. */
export const MAX_CAPSULES = 20;
/** 쪽지가 열릴 때 튀는 반짝이 수. */
const SPARKS = 16;

interface Shown {
  run: number;
  step: number;
}

/** 단계마다 큰 글씨 한 마디. */
const CALLOUT: Partial<Record<GachaSay, string>> = {
  crank: '드르륵',
  'peek-back': '아깝다!',
  drop: '덜컹!',
  jam: '어?',
  knock: '탁!',
  pop: '뽁!',
};

export function Gacha({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [shown, setShown] = useState<Shown>({ run: -1, step: 0 });
  const plan = useMemo(
    () => (winnerIndex === null ? null : gachaPlan(count, winnerIndex, seededRandom(run * 7 + 3))),
    [count, winnerIndex, run],
  );

  // 돔 안 캡슐: 후보 카테고리 색을 판 번호로 섞어 바닥부터 쌓는다. 이름은 없다.
  // 아래 줄일수록 앞(크고 밝게), 위 줄일수록 뒤 — 쌓인 더미가 입체로 보인다.
  const capsules = useMemo(() => {
    const r = seededRandom(run + 11);
    const hues = candidates.slice(0, MAX_CAPSULES).map((p) => categoryHue(p.category));
    for (let i = hues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [hues[i], hues[j]] = [hues[j], hues[i]];
    }
    const out: { hue: number; x: number; y: number; tilt: number; depth: number; dx: number; dy: number }[] = [];
    const size = 0.16;
    for (let row = 0, y = 0.8; out.length < hues.length; row += 1, y -= 0.115) {
      // 돔 안쪽 원(반지름 0.44)이 이 높이에서 갖는 폭만큼 한 줄에 놓는다.
      const half = Math.sqrt(Math.max(0, 0.44 ** 2 - (y - 0.5) ** 2));
      const fit = Math.max(1, Math.floor((half * 2) / size));
      const take = Math.min(fit, hues.length - out.length);
      const start = 0.5 - ((take - 1) * size) / 2 + (row % 2 ? size / 4 : -size / 4);
      for (let k = 0; k < take; k += 1) {
        out.push({
          hue: hues[out.length],
          x: (start + k * size + (r() - 0.5) * 0.02) * 100,
          y: (y + (r() - 0.5) * 0.02) * 100,
          tilt: Math.round((r() - 0.5) * 120),
          depth: row,
          dx: Math.round((r() - 0.5) * 160),
          dy: -Math.round(90 + r() * 220),
        });
      }
    }
    return out;
  }, [candidates, run]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 열린 쪽지만 보인다.
      setShown({ run, step: plan ? plan.steps.length - 1 : 0 });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 첫 단계에서 멈춘다.
    setShown({ run, step: 0 });
    const timers: number[] = [];
    plan.steps.forEach((st, k) => {
      if (k === 0) return;
      timers.push(window.setTimeout(() => setShown((s) => (s.run === run ? { run, step: k } : s)), st.at));
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, GachaCardsSfxName | SfxName][] = [];
    for (const st of plan.steps) {
      if (st.say === 'crank') for (let k = 0; k < plan.cranks; k += 1) sounds.push([k * 450, 'crank']);
      if (st.say === 'tumble') for (let k = 0; k < 4; k += 1) sounds.push([st.at + k * 270, 'rattle']);
      if (st.say === 'peek') sounds.push([st.at + 250, 'wobble']);
      if (st.say === 'peek-back') sounds.push([st.at, 'slip']);
      if (st.say === 'drop') sounds.push([st.at + 120, 'thunk']);
      if (st.say === 'jam') sounds.push([st.at, 'bump']);
      if (st.say === 'knock') sounds.push([st.at, 'knock']);
      if (st.say === 'open' && plan.gold) sounds.push([st.at, 'sparkle']);
      if (st.say === 'pop') sounds.push([st.at, 'popOpen']);
      if (st.say === 'won') sounds.push([st.at, 'chime']);
    }
    const stopSfx = gachaCardsSfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="gacha gacha--empty" />;

  const live = shown.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 열린 쪽지를 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const steps = plan?.steps ?? [];
  const say: GachaSay | 'idle' = !plan
    ? winnerIndex !== null && (live || settled)
      ? 'won'
      : 'idle'
    : live
      ? (steps[shown.step]?.say ?? 'idle')
      : settled
        ? 'won'
        : 'idle';
  const at = (s: GachaSay) => steps.findIndex((x) => x.say === s);
  const idx = live ? shown.step : settled ? steps.length - 1 : -1;
  const reached = (s: GachaSay) => {
    if (say === 'won' && !plan) return s === 'won' || s === 'pop' || s === 'open';
    const k = at(s);
    return k >= 0 && idx >= k;
  };
  const dropped = reached('drop');
  const opening = reached('open');
  const popped = reached('pop');
  const gold = plan?.gold ?? false;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const peek = plan?.peek ?? null;
  const camera = say === 'crank' ? 'handle' : say === 'jam' || say === 'knock' ? 'chute' : '';

  const status = (() => {
    const nm = (i: number) => shortName(candidates[i].name, 10);
    switch (say) {
      case 'idle':
        return `캡슐 ${count}개 — 손잡이를 돌려 볼까요?`;
      case 'crank':
        return '드르륵… 손잡이를 돌려요';
      case 'tumble':
        return '캡슐이 데굴데굴 섞여요…';
      case 'peek':
        return peek === null ? '' : `어? ${nm(peek)}… 나오려나요?`;
      case 'peek-back':
        return '아깝다! 다시 들어갔어요';
      case 'drop':
        return gold ? '덜컹! 어… 골드 캡슐이에요?!' : '덜컹! 캡슐이 나왔어요';
      case 'jam':
        return '어? 걸렸어요';
      case 'knock':
        return '탁! 빠졌어요';
      case 'open':
        return gold ? '골드 캡슐! 열어 볼게요… 두근두근' : '열어 볼게요… 두근두근';
      case 'pop':
        return '뽁!';
      case 'won':
        return winner ? `뽑았어요! ${withJosa(shortName(winner.name, 14), '이/가')} 나왔어요` : '';
    }
  })();
  const callout = live ? (say === 'open' && gold ? '골드!' : CALLOUT[say as GachaSay]) : undefined;

  return (
    <div
      className={[
        'gacha',
        ambienceClasses(ambience),
        expanded ? 'gacha--big' : '',
        `gacha--${say}`,
        gold ? 'gacha--gold' : '',
        settled ? 'gacha--settled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="gacha__view"
        role="img"
        aria-label={`뽑기 기계, 캡슐 ${count}개: ${candidates.map((p) => p.name).join(', ')}`}
      >
        <span className="gacha__yard" aria-hidden="true">
          <Horizon season={ambience.season} className="gacha__hz" />
          <SceneWeather weather={ambience.weather} />
        </span>
        <Climax on={say === 'drop' || say === 'jam' || say === 'knock' || say === 'open'} />
        <div className={['gacha__machine', camera ? `gacha__machine--${camera}` : ''].filter(Boolean).join(' ')} aria-hidden="true">
          <span className="gacha__topper">
            {TOPPER[ambience.season].map((e, i) => (
              <span key={i}>{e}</span>
            ))}
          </span>
          <span className="gacha__tag">{ambience.weekday === 5 ? '불금 2배' : `${SEASON_NAME[ambience.season]} 한정`}</span>
          <div className="gacha__dome">
            {/* 하나가 나오면 돔에서도 하나(맨 위)가 빠진다. */}
            {capsules.slice(0, dropped ? capsules.length - 1 : capsules.length).map((c, i) => (
              <span
                key={i}
                className="gacha__capsule"
                style={
                  {
                    '--cat-hue': c.hue,
                    '--tilt': `${c.tilt}deg`,
                    '--dx': `${c.dx}%`,
                    '--dy': `${c.dy}%`,
                    '--i': i,
                    left: `${c.x}%`,
                    top: `${c.y}%`,
                    zIndex: 10 - c.depth,
                    scale: `${1 - c.depth * 0.04}`,
                    filter: `brightness(${1 - c.depth * 0.05})`,
                  } as React.CSSProperties
                }
              />
            ))}
            {peek !== null && (say === 'peek' || say === 'peek-back') && (
              <span
                className={`gacha__peek gacha__peek--${say}`}
                style={{ '--cat-hue': categoryHue(candidates[peek].category) } as React.CSSProperties}
              >
                <span className="gacha__peektag">{shortName(candidates[peek].name, 6)}</span>
              </span>
            )}
            <span className="gacha__glare" />
          </div>
          <div className="gacha__body">
            <span className="gacha__slot" />
            <span className="gacha__handle" />
            <span className="gacha__chute">
              {winner && dropped && !opening && (
                <span
                  className={['gacha__out', say === 'jam' ? 'gacha__out--jam' : '', say === 'knock' ? 'gacha__out--free' : '']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}
                >
                  <span className="gacha__half gacha__half--top" />
                  <span className="gacha__half gacha__half--bottom" />
                </span>
              )}
            </span>
          </div>
          <span className="gacha__base" />
        </div>

        {say === 'crank' && live && (
          <>
            <span className="gacha__bar gacha__bar--top" aria-hidden="true" />
            <span className="gacha__bar gacha__bar--bottom" aria-hidden="true" />
          </>
        )}
        {say === 'knock' && live && (
          <span className="gacha__fist" aria-hidden="true">
            👊
          </span>
        )}

        {winner && opening && (
          <div className={['gacha__reveal', popped ? 'gacha__reveal--popped' : ''].filter(Boolean).join(' ')} aria-hidden="true">
            <span className="gacha__rays" />
            <span className="gacha__big" style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}>
              <span className="gacha__bighalf gacha__bighalf--top" />
              <span className="gacha__bighalf gacha__bighalf--bottom" />
            </span>
            <span className="gacha__slip">
              <small>오늘 점심은</small>
              <strong>{winner.name}</strong>
              <span>
                {categoryLabel(winner)} · {winner.walkMin}분
              </span>
            </span>
            {popped && (
              <span className="gacha__sparks">
                {Array.from({ length: SPARKS }, (_, k) => (
                  <span
                    key={k}
                    style={
                      {
                        '--a': `${(k * 360) / SPARKS + (k % 3) * 7}deg`,
                        '--h': gold ? 70 + (k % 4) * 8 : (k * 47) % 360,
                        '--d': `${0.8 + (k % 4) * 0.18}`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </span>
            )}
          </div>
        )}

        {callout && (
          <span key={`${run}-${shown.step}`} className={`gacha__callout gacha__callout--${say}`} aria-hidden="true">
            {callout}
          </span>
        )}
      </div>
      <p className="gacha__status" aria-live="polite">
        {status}
      </p>
      {count > MAX_CAPSULES && <p className="muted small gacha__more">캡슐이 {count - MAX_CAPSULES}개 더 있어요</p>}
    </div>
  );
}
