/**
 * 픽셀 경마 · 픽셀 레이싱 — 같은 경주 엔진(lib/race.ts)에 그림만 다르다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 경기를 무작위로 만든 뒤 1등 기록을 당첨에게
 * 맞바꾼다 — 사고·부스트도 기록과 함께 옮겨 가므로 공정성은 그대로다.
 * 3·2·1 카운트다운 → 경주(당첨이 결승하는 데 약 6.5초) → 1등 들어오면 끝.
 * 주자 그림은 box-shadow 픽셀 아트라 카테고리 색 토큰을 그대로 쓴다.
 */
import { useEffect, useMemo, useState } from 'react';
import { categoryHue } from '../../lib/category';
import { shortName } from '../../lib/name';
import { buildRace, progress, SLICE, type RaceEventKind } from '../../lib/race';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';

export type RaceTheme = 'horse' | 'car';

const COUNT_STEP_MS = 400;
const COUNTDOWN = ['3', '2', '1', '출발!'];
/** 당첨이 결승하는 데 걸리는 실제 시간. */
export const RACE_MS = 6500;
const AFTER_MS = 500;

const HORSE: string[][] = [
  [
    '......cc......',
    '.....jjjj.....',
    '......jj...mb.',
    '..bbbbbbbbbbbb',
    '.bbbbbbbbbbbb.',
    'm.bbbbbbbbb...',
    '..b.b....b.b..',
    '.b...b..b...b.',
  ],
  [
    '......cc......',
    '.....jjjj.....',
    '......jj...mb.',
    '..bbbbbbbbbbbb',
    '.bbbbbbbbbbbb.',
    '.mbbbbbbbbb...',
    '...bb....bb...',
    '...b.b..b.b...',
  ],
];
const CAR: string[][] = [
  [
    '....bbbbbb....',
    '...bggbggbb...',
    '.bbbbbbbbbbbbw',
    'bbbbbbbbbbbbbb',
    '.kkk......kkk.',
    '.kwk......kwk.',
  ],
  [
    '....bbbbbb....',
    '...bggbggbb...',
    '.bbbbbbbbbbbbw',
    'bbbbbbbbbbbbbb',
    '.kkk......kkk.',
    '.wkk......wkk.',
  ],
];

function palette(theme: RaceTheme, hue: number): Record<string, string> {
  return theme === 'horse'
    ? {
        b: 'oklch(0.48 0.08 55)',
        m: 'var(--color-neutral-900)',
        j: `oklch(0.66 0.17 ${hue})`,
        c: `oklch(0.48 0.16 ${hue})`,
      }
    : {
        b: `oklch(0.62 0.17 ${hue})`,
        g: 'oklch(0.86 0.04 230)',
        k: 'var(--color-neutral-900)',
        w: 'var(--color-bg)',
      };
}

/** 그림 한 장을 box-shadow 한 줄로. 픽셀 하나 = px. */
function sprite(rows: string[], colors: Record<string, string>, px: number): string {
  const out: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) out.push(`${(x + 1) * px}px ${(y + 1) * px}px 0 ${colors[ch]}`);
    }),
  );
  return out.join(',');
}

const EVENT_ICON: Record<RaceTheme, Record<RaceEventKind, string>> = {
  horse: { crash: '💥', boost: '🥕', wobble: '💫' },
  car: { crash: '💥', boost: '🔥', wobble: '💦' },
};

function eventLine(theme: RaceTheme, kind: RaceEventKind, name: string): string {
  if (theme === 'horse') {
    return kind === 'crash'
      ? `${name} 말이 넘어졌어요!`
      : kind === 'boost'
        ? `${name} 당근 먹고 질주해요!`
        : `${name} 말이 휘청해요`;
  }
  return kind === 'crash' ? `${name} 차가 스핀했어요!` : kind === 'boost' ? `${name} 니트로!` : `${name} 차가 미끄러져요`;
}

interface View {
  run: number;
  /** 카운트다운 단계(0~3), 경주 중이면 -1. */
  count: number;
  /** 경기 시간. */
  t: number;
}

export function PixelRace({
  theme,
  candidates,
  winnerIndex,
  spinning,
  run,
  onSpinEnd,
  expanded = false,
}: GameProps & { theme: RaceTheme }) {
  const count = candidates.length;
  const race = useMemo(
    () => (winnerIndex === null || count === 0 ? null : buildRace(count, winnerIndex, seededRandom(run * 13 + 5))),
    [count, winnerIndex, run],
  );
  const [view, setView] = useState<View>({ run: -1, count: -1, t: 0 });
  const live = view.run === run && race !== null;
  const settled = !live && race !== null && !spinning;
  const t = live ? view.t : settled && race ? race.finish[winnerIndex!] : 0;

  useEffect(() => {
    if (!spinning || !race || winnerIndex === null) return;
    const winT = race.finish[winnerIndex];
    if (prefersReducedMotion()) {
      // 움직임을 줄였으면 바로 끝낸다. 끝난 판(settled)은 당첨이 결승한 순간으로 그린다.
      const tm = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(tm);
    }
    const lastT = Math.min(Math.max(...race.finish), winT * 1.3);
    const msPerT = RACE_MS / winT;
    const timers: number[] = [];
    let raf = 0;
    COUNTDOWN.forEach((_, i) => timers.push(window.setTimeout(() => setView({ run, count: i, t: 0 }), i * COUNT_STEP_MS)));
    const startAt = COUNTDOWN.length * COUNT_STEP_MS - COUNT_STEP_MS / 2;
    timers.push(
      window.setTimeout(() => {
        const t0 = performance.now();
        const tick = (now: number) => {
          // rAF 의 now 는 t0 보다 앞설 수 있다(프레임 시작 시각). 음수면 그림 칸이 -1 이 된다.
          const tt = Math.min(lastT, Math.max(0, (now - t0) / msPerT));
          setView({ run, count: -1, t: tt });
          if (tt < lastT) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }, startAt),
    );
    timers.push(window.setTimeout(onSpinEnd, startAt + RACE_MS + AFTER_MS));
    return () => {
      timers.forEach((x) => window.clearTimeout(x));
      cancelAnimationFrame(raf);
    };
  }, [spinning, race, winnerIndex, run, onSpinEnd]);

  if (count === 0) return <div className="prace prace--empty" />;

  const px = expanded ? 4 : count > 10 ? 2 : 3;
  const frame = Math.floor(t * 24) % 2;
  const art = theme === 'horse' ? HORSE : CAR;
  const dist = candidates.map((_, i) => (race && (live || settled) ? progress(race.paces[i], t) : 0));
  const rankOf = new Map<number, number>();
  if (race) race.order.forEach((i, r) => race.finish[i] <= t + 1e-9 && rankOf.set(i, r + 1));
  const leader = dist.indexOf(Math.max(...dist));
  // 지금 일어나는 사건(가장 최근 것 하나를 알림 줄에).
  let latest: { i: number; kind: RaceEventKind; at: number } | null = null;
  if (race && live) {
    race.events.forEach((evs, i) =>
      evs.forEach((e) => {
        const at = e.slice * SLICE;
        if (at <= t && (!latest || at > latest.at)) latest = { i, kind: e.kind, at };
      }),
    );
  }
  const counting = live && view.count >= 0;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const line = counting
    ? '곧 출발해요'
    : (rankOf.get(winnerIndex ?? -1) ?? 0) === 1 && winner
      ? `${shortName(winner.name, 10)} 1등으로 들어왔어요!`
      : latest
        ? eventLine(theme, (latest as { kind: RaceEventKind }).kind, shortName(candidates[(latest as { i: number }).i].name, 8))
        : live
          ? `선두 ${shortName(candidates[leader].name, 8)}`
          : theme === 'horse'
            ? `말 ${count}마리가 출발선에 섰어요`
            : `차 ${count}대가 출발선에 섰어요`;

  return (
    <div
      className={['prace', `prace--${theme}`, expanded ? 'prace--big' : ''].filter(Boolean).join(' ')}
      style={{ '--px': `${px}px` } as React.CSSProperties}
    >
      <p className="prace__line" aria-live="polite">
        {line}
      </p>
      <div className="prace__board">
        {candidates.map((p, i) => {
          const hue = categoryHue(p.category);
          const ev = race?.events[i].find((e) => t >= e.slice * SLICE && t < (e.slice + 1) * SLICE) ?? null;
          const rank = rankOf.get(i);
          return (
            <div key={p.id} className={rank === 1 ? 'prace__lane prace__lane--win' : 'prace__lane'}>
              <span className="prace__name" title={p.name}>
                {shortName(p.name, count > 10 ? 4 : 6)}
              </span>
              <span className="prace__track">
                <span
                  className={['prace__runner', ev ? `prace__runner--${ev.kind}` : ''].filter(Boolean).join(' ')}
                  style={
                    {
                      left: `calc((100% - ${16 * px}px) * ${dist[i]})`,
                    } as React.CSSProperties
                  }
                  aria-hidden="true"
                >
                  <span
                    className="prace__sprite"
                    style={{ width: px, height: px, boxShadow: sprite(art[frame], palette(theme, hue), px) }}
                  />
                  {ev && <span className="prace__fx">{EVENT_ICON[theme][ev.kind]}</span>}
                </span>
                <span className="prace__finish" aria-hidden="true" />
              </span>
              <span className="prace__rank">{rank ? `${rank}등` : ''}</span>
            </div>
          );
        })}
        {counting && (
          <span className="prace__count" aria-hidden="true">
            {COUNTDOWN[view.count]}
          </span>
        )}
      </div>
    </div>
  );
}

export function HorseRace(props: GameProps) {
  return <PixelRace theme="horse" {...props} />;
}

export function CarRace(props: GameProps) {
  return <PixelRace theme="car" {...props} />;
}
