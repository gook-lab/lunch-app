/**
 * 픽셀 경마 · 픽셀 레이싱 — 같은 경주 엔진(lib/race.ts)에 그림만 다르다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 경기를 무작위로 만든 뒤 1등 기록을 당첨에게
 * 맞바꾼다 — 사고·부스트도 기록과 함께 옮겨 가므로 공정성은 그대로다.
 * 3·2·1 카운트다운 → 경주(기본 세 바퀴 12초, 바퀴 수는 고를 수 있다) → 1등 들어오면 끝.
 * 그리기는 RaceCircuit(기울인 타원 트랙)이 맡는다.
 *
 * 바퀴 수 · 자리 섞기는 핀볼의 판 테마 · 자리 섞기처럼 보이는 것만 바꾼다. 경기 기록(누가
 * 언제 어디까지 달렸나)은 바퀴 수와 무관한 거리 0~1 이라 당첨은 그대로다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import { buildRace, progress, SLICE, type RaceEventKind } from '../../lib/race';
import { seededRandom } from '../../lib/random';
import { RaceCircuit } from './RaceCircuit';
import { prefersReducedMotion, type GameProps } from './types';

export type RaceTheme = 'horse' | 'car';

const COUNT_STEP_MS = 400;
const COUNTDOWN = ['3', '2', '1', '출발!'];
/** 고를 수 있는 바퀴 수. 기본은 세 바퀴(10/13 사용자). */
const LAP_CHOICES = [1, 3, 5] as const;
const DEFAULT_LAPS = 3;
const lapsKey = (theme: RaceTheme) => `lunch-app:race-laps-${theme}`;
function readLaps(theme: RaceTheme): number {
  try {
    const saved = Number(localStorage.getItem(lapsKey(theme)));
    return (LAP_CHOICES as readonly number[]).includes(saved) ? saved : DEFAULT_LAPS;
  } catch {
    return DEFAULT_LAPS;
  }
}
/** 당첨이 결승하는 데 걸리는 실제 시간 — 한 바퀴 3초에 출발·결승 3초. 세 바퀴면 12초. */
const raceMs = (laps: number) => 3000 + laps * 3000;
/** 사건은 바퀴가 많을수록 많이(둘~다섯). 넘어지거나 뒤집히면 옆 주자도 같이 받는다. */
const raceOptions = (laps: number) => ({ maxEvents: Math.max(2, laps), eventChance: 0.5, collisions: true });
/** 던진 것이 떨어지는 때(사건 구간 안 비율)와 바닥에 남아 있는 구간 수. */
const LAND = 0.3;
const HAZARD_SLICES = 3;

/** 경마 사건은 같은 종류도 두 가지 장면 중 하나로 — 주자·구간으로 고르니 판마다 섞인다. */
const HORSE_SCENES: Record<RaceEventKind, { icon: string; line: (name: string, other: string | null) => string }[]> = {
  crash: [
    { icon: '💥', line: (n, o) => (o ? `${n} 말이 ${o} 말과 부딪혀 넘어졌어요!` : `${n} 말이 넘어졌어요!`) },
    {
      icon: '😵',
      line: (n, o) => (o ? `${n} 말이 ${o} 말과 엉켜 기수가 떨어질 뻔했어요!` : `${n} 기수가 떨어질 뻔했어요!`),
    },
  ],
  boost: [
    { icon: '🥕', line: (n) => `${n} 당근 먹고 질주해요!` },
    { icon: '⚡', line: (n) => `${n} 채찍 한 번에 날아가요!` },
  ],
  wobble: [
    { icon: '🌿', line: (n) => `${n} 말이 풀 뜯느라 멈췄어요` },
    { icon: '👀', line: (n) => `${n} 말이 갑자기 뒤를 돌아봐요` },
  ],
  bump: [
    { icon: '💢', line: (n) => `${n} 말이 부딪혀 주춤해요` },
    { icon: '💢', line: (n) => `${n} 말이 밀려서 휘청해요` },
  ],
  slip: [
    { icon: '🍌', line: (n) => `관중이 던진 바나나 껍질에 ${n} 말이 미끄러졌어요!` },
    { icon: '🥤', line: (n) => `관중석에서 날아온 음료수에 ${n} 말이 미끄러져요!` },
  ],
};
/** 레이싱에서 관중이 던지는 것 — 같은 사건도 두 가지 중 하나로. */
const CAR_SLIPS = [
  { icon: '🛢️', line: (n: string) => `관중석에서 기름통이 날아와 ${n} 차가 미끄러져요!` },
  { icon: '🍌', line: (n: string) => `바나나 껍질 밟고 ${n} 차가 빙글 돌아요!` },
];
const horseScene = (kind: RaceEventKind, i: number, slice: number) => HORSE_SCENES[kind][(i + slice) % 2];
const slipScene = (theme: RaceTheme, i: number, slice: number) =>
  theme === 'horse' ? horseScene('slip', i, slice) : CAR_SLIPS[(i + slice) % 2];
const AFTER_MS = 250;

function eventLine(
  theme: RaceTheme,
  kind: RaceEventKind,
  name: string,
  other: string | null,
  i: number,
  slice: number,
): string {
  if (theme === 'horse') return horseScene(kind, i, slice).line(name, other);
  if (kind === 'slip') return CAR_SLIPS[(i + slice) % 2].line(name);
  // 레이싱: 사고 = 전복(옆 차와 부딪혀 났으면 충돌), 휘청 = 타이어 펑크, 부스트 = 부스터.
  if (kind === 'crash' && other) return `쾅! ${name} 차가 ${other} 차와 부딪혀 뒤집혔어요!`;
  return kind === 'crash'
    ? `${name} 차가 뒤집혔어요!`
    : kind === 'boost'
      ? `${name} 부스터 점화!`
      : kind === 'bump'
        ? `${name} 차가 받혀서 휘청해요!`
        : `${name} 타이어가 터졌어요!`;
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
  const [laps, setLapsState] = useState(() => readLaps(theme));
  const setLaps = (next: number) => {
    setLapsState(next);
    try {
      localStorage.setItem(lapsKey(theme), String(next));
    } catch {
      // 시크릿 창에서는 저장이 막힌다. 이번 방문 동안만 바뀐다.
    }
  };
  // 돌리는 순간의 바퀴 수로 경기를 만든다(칩은 경주 중 잠긴다).
  const race = useMemo(
    () =>
      winnerIndex === null || count === 0
        ? null
        : buildRace(count, winnerIndex, seededRandom(run * 13 + 5), raceOptions(laps)),
    [count, winnerIndex, run, laps],
  );
  // 출발 자리(차선) — 주자 i 는 slots[i] 번째 자리에 선다. "자리 섞기" 로 바뀌고 보이기만 바뀐다.
  const [lanePos, setLanePos] = useState<number[]>([]);
  const slots = lanePos.length === count ? lanePos : candidates.map((_, i) => i);
  const [shuffling, setShuffling] = useState(false);
  useEffect(() => {
    if (!shuffling) return;
    const tm = window.setTimeout(() => setShuffling(false), 700);
    return () => window.clearTimeout(tm);
  }, [shuffling]);
  const shuffleSlots = () => {
    const next = [...slots];
    for (let k = next.length - 1; k > 0; k -= 1) {
      const j = Math.floor(Math.random() * (k + 1));
      [next[k], next[j]] = [next[j], next[k]];
    }
    // 그대로 나오면 한 칸 돌린다 — 눌렀는데 안 바뀌면 고장 난 것 같다.
    if (next.length > 1 && next.every((v, k) => v === slots[k])) next.push(next.shift()!);
    setLanePos(next);
    setShuffling(true);
  };
  const [view, setView] = useState<View>({ run: -1, count: -1, t: 0 });
  // 순위표에서 고른 주자 — 카메라가 당겨 따라간다. 판이 바뀌어도 그대로 둔다(같은 가게를 응원).
  const [focus, setFocus] = useState<number | null>(null);
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
    const msPerT = raceMs(laps) / winT;
    const timers: number[] = [];
    let raf = 0;
    COUNTDOWN.forEach((_, i) =>
      timers.push(window.setTimeout(() => setView({ run, count: i, t: 0 }), i * COUNT_STEP_MS)),
    );
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
    timers.push(window.setTimeout(onSpinEnd, startAt + raceMs(laps) + AFTER_MS));
    return () => {
      timers.forEach((x) => window.clearTimeout(x));
      cancelAnimationFrame(raf);
    };
  }, [spinning, race, winnerIndex, run, onSpinEnd, laps]);

  if (count === 0) return <div className="prace prace--empty" />;

  const px = expanded ? 4 : count > 10 ? 2 : 3;
  const frame = Math.floor(t * 24) % 2;
  const dist = candidates.map((_, i) => (race && (live || settled) ? progress(race.paces[i], t) : 0));
  const rankOf = new Map<number, number>();
  if (race) race.order.forEach((i, r) => race.finish[i] <= t + 1e-9 && rankOf.set(i, r + 1));
  const leader = dist.indexOf(Math.max(...dist));
  // 지금 사건 중인 주자(한 구간 동안 연출).
  const active = candidates.map((_, i) =>
    race && live ? (race.events[i].find((e) => t >= e.slice * SLICE && t < (e.slice + 1) * SLICE)?.kind ?? null) : null,
  );
  // 경마는 사건 중인 말 머리 위에 장면 말풍선.
  const bubbles = candidates.map((_, i) => {
    if (theme !== 'horse' || !race || !live) return null;
    const e = race.events[i].find((x) => t >= x.slice * SLICE && t < (x.slice + 1) * SLICE);
    return e ? horseScene(e.kind, i, e.slice).icon : null;
  });
  // 관중이 던진 것 — 사건 구간 시작에 날아와 주자 바로 앞에 떨어지고, 몇 구간 바닥에 남는다.
  const hazards =
    race && live
      ? race.events.flatMap((evs, i) =>
          evs
            .filter((e) => e.kind === 'slip' && t >= e.slice * SLICE && t < (e.slice + HAZARD_SLICES) * SLICE)
            .map((e) => ({
              key: `${i}-${e.slice}`,
              runner: i,
              d: progress(race.paces[i], (e.slice + LAND) * SLICE),
              icon: slipScene(theme, i, e.slice).icon,
            })),
        )
      : [];
  // 지금 일어나는 사건(가장 최근 것 하나를 알림 줄에).
  let latest: { i: number; kind: RaceEventKind; at: number; hit?: number } | null = null;
  if (race && live) {
    race.events.forEach((evs, i) => {
      for (const e of evs) {
        const at = e.slice * SLICE;
        // 일어난 뒤 한 구간 반 동안만 알린다. 그 뒤엔 선두 소식으로 돌아간다.
        // 충돌은 사고 낸 쪽(crash)으로 한 번만 알린다.
        if (e.kind === 'bump' || at > t || t >= at + SLICE * 1.5) continue;
        if (!latest || at > latest.at) latest = { i, kind: e.kind, at, hit: e.hit };
      }
    });
  }
  const news = latest as { i: number; kind: RaceEventKind; at: number; hit?: number } | null;

  const counting = live && view.count >= 0;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const line = counting
    ? '곧 출발해요'
    : (rankOf.get(winnerIndex ?? -1) ?? 0) === 1 && winner
      ? `${shortName(winner.name, 10)} 1등으로 들어왔어요!`
      : news
        ? eventLine(
            theme,
            news.kind,
            shortName(candidates[news.i].name, 8),
            news.hit === undefined ? null : shortName(candidates[news.hit].name, 8),
            news.i,
            Math.round(news.at / SLICE),
          )
        : live
          ? `${laps > 1 && dist[leader] >= (laps - 1) / laps ? '마지막 바퀴! ' : ''}선두 ${shortName(candidates[leader].name, 8)}`
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
        <div className="prace__opts">
          <div className="prace__laps" role="group" aria-label="바퀴 수">
            {LAP_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                className="pinball__chip"
                aria-pressed={laps === n}
                disabled={spinning}
                onClick={() => setLaps(n)}
              >
                {n}바퀴
              </button>
            ))}
          </div>
          <button type="button" className="pinball__chip" onClick={shuffleSlots} disabled={spinning || count < 2}>
            <span aria-hidden="true">🔀 </span>자리 섞기
          </button>
        </div>
        <RaceCircuit
          theme={theme}
          candidates={candidates}
          dist={dist}
          rankOf={rankOf}
          active={active}
          bubbles={bubbles}
          px={expanded ? 4 : count > 8 ? 2 : 3}
          frame={frame}
          focus={focus !== null && focus < count ? focus : null}
          onFocus={setFocus}
          round={run}
          laps={laps}
          slots={slots}
          shuffling={shuffling}
          hazards={hazards}
        />
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
