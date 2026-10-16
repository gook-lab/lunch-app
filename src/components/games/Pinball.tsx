/**
 * 핀볼 — 이름 붙은 구슬들이 긴 판을 굴러 내려가고, 카메라가 선두를 따라간다.
 *
 * 당첨은 이미 정해져 있고(winnerIndex), 여기서는 경기를 한 번 돌려 1등 구슬과
 * 당첨 구슬의 이름표를 맞바꾼 경기를 재생한다(raceForWinner). 물리는 조작하지
 * 않는다 — lib/pinball.ts 참고.
 *
 * 흐름: 출발 게이트(구슬이 들썩이다 출발 자리로 섞여 들어간다) → 경기(카메라가 선두를
 * 따라 내려간다) → 막판 슬로모션(선두가 출구에 다가가면 0.45배) → 나머지 정리.
 *
 * 가게마다 공을 여러 개 넣을 수 있다(balls). 공 개수는 확률이다 — App 이 개수에
 * 비례해 당첨 가게를 뽑고, 여기서는 그 가게 구슬 하나가 1등 하는 경기를 보여 준다.
 * 판 테마(기본·우주·정글·카지노)는 코스와 그림만 바꾼다.
 *
 * 캔버스로 그린다. 구슬·막대가 매 프레임 움직이는데 DOM 으로 하면 노드가
 * 수십 개씩 갱신된다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { shortName } from '../../lib/name';
import {
  BOARD_H,
  COURSE_W,
  FINISH_Y,
  MAX_MARBLES,
  PINBALL_THEMES,
  buildCourse,
  raceForWinner,
  spinnerEnds,
  startSpot,
  type PinballTheme,
  type RaceResult,
} from '../../lib/pinball';
import { seededRandom } from '../../lib/random';
import { MAX_BALLS_EACH, marblesFor, winnerMarble } from '../../lib/weights';
import {
  FUNNEL_Y,
  PALETTES,
  SHADOW_DX,
  SHADOW_DY,
  drawBumper,
  drawOrbiter,
  drawPortal,
  drawPost,
  drawSpinner,
  drawTable,
  drawWall,
  inBand,
} from './pinballDraw';
import { prefersReducedMotion, type GameProps } from './types';
import { sfx } from '../../lib/sfx';
import { FRAME_MS, SLOW_RATE, frameAtMs, timingFor, type Timing } from '../../lib/pinballTiming';

/** 캔버스 = 코스 창 + 오른쪽 패널(미니맵, 순위판). */
const PANEL_W = 112;
const CANVAS_W = COURSE_W + PANEL_W;
/** 창 위아래로 더 그리는 여유(판 좌표). 창 밖에 있어도 그림자가 창 안으로 번지는 것까지 덮는다. */
const VIEW_PAD = 40;
/**
 * 화면 배율 상한. 핀볼은 그림자가 많은 캔버스를 매 프레임 통째로 다시 그려 픽셀 수가 곧 비용이다.
 * Pixel 7(2.625배)은 840×1155 를 그려 CPU 6배 흉내에서 프레임 10~22% 가 50ms 를 넘었고,
 * 2배(640×880)면 0.5% 였다(10/15). 2배 위로는 눈에 띄는 차이가 적어 여기서 자른다.
 */
const MAX_BASE_DPR = 2;
/** 화면에 보이는 코스 높이. 판(BOARD_H)은 이보다 길어서 카메라가 따라 내려간다. */
const VIEW_H = 440;
/**
 * 크게 보기에서는 코스를 가까이 당겨 보여 준다. 보이는 높이를 줄이면 캔버스가
 * 가로로 넓어져 같은 화면 높이에서 구슬이 커진다. 예전엔 480 으로 더 길게
 * 보여 줬는데, 높이에 맞추느라 폭이 320 → 413px 로만 커져 "크게 보기가 없다"
 * 는 말을 들었다(10/9).
 */
const VIEW_H_BIG = 340;
const MARBLE_R = 7;

const THEME_KEY = 'lunch-app:pinball-theme';
function readTheme(): PinballTheme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return PINBALL_THEMES.some((t) => t.id === saved) ? (saved as PinballTheme) : 'classic';
  } catch {
    return 'classic';
  }
}

/** 같은 가게 공이 여럿이면 순위판에서 몇 번째 공인지 붙인다. */
const NTH = ['①', '②', '③', '④', '⑤'];

/**
 * 재생 속도.
 *
 * 경기 본편은 실시간(60fps 한 프레임 = 시뮬레이션 한 스텝)이다. 예전에는
 * 0.9초짜리 경기를 4초로 늘려 0.22배 슬로모션으로 틀어 "초반 지연" 으로 보였다.
 *
 * 다만 선두가 출구에 다가가면 부드럽게 늦춘다. 출구는 구슬 하나 폭이라 여기서
 * 순위가 자주 뒤집힌다(실측 12~47%). 1등이 들어온 뒤 나머지는 부드럽게 빨라진다.
 * 곡선은 lib/pinballTiming.ts 에 있다.
 */
/**
 * 출발 게이트. 경기는 바로 만들어지지만 게이트가 열리는 걸 보여 준다. 앞부분은
 * 제자리에서 들썩이고, 뒷부분에 구슬이 실제 출발 자리로 섞여 들어간다(GATE_SHUFFLE_FROM~).
 */
const GATE_MS = 900;
const GATE_SHUFFLE_FROM = 300;
/** "자리 섞기" 단추로 섞을 때 구슬이 옮겨 가는 시간. */
const SHUFFLE_MS = 450;
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/** 잔상으로 그릴 지난 프레임 수와 간격. */
const TRAIL = 5;
const TRAIL_STEP = 2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 판 번호를 경기 시드(1 이상)로 접는다. 판마다 다른 경기가 나온다. */
const startSeedFor = (run: number) => 1 + (Math.abs(Math.floor(run)) % 100_000);

/** 구슬 색. 토큰이 아니라 구분용 팔레트라 여기서만 쓴다. */
function marbleHue(i: number): number {
  // 황금각으로 돌려서 이웃끼리 색이 겹치지 않게 한다.
  return (i * 137.508) % 360;
}
const marbleColor = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)})`;
const marbleGlow = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)} / 0.45)`;

/**
 * 프레임 f 에서 아직 안 들어온 구슬 중 가장 아래(선두)의 y.
 * 1등이 들어온 뒤(winnerFrame~)에는 당첨 구슬이 들어간 출구에 묶는다. 안 그러면
 * 끝 장면(HOLD) 동안 카메라가 2등을 따라 올라가 당첨 구슬이 화면에서 빠졌다.
 */
function leaderY(race: RaceResult, f: number): number {
  const fi = clamp(Math.floor(f), 0, race.frames.length - 1);
  const frame = race.frames[fi];
  if (fi >= race.winnerFrame) return frame[race.winner]?.y ?? BOARD_H;
  let best = 0;
  for (const m of frame) if (m.y < FINISH_Y && m.y > best) best = m.y;
  return best === 0 ? BOARD_H : best;
}

/**
 * 카메라 위치(보이는 창의 위쪽 y). 선두를 창의 60% 높이에 두되, 지난 몇
 * 프레임을 평균내서 선두가 바뀔 때 화면이 튀지 않게 한다. 끝 장면 위치는 테스트가 잰다.
 */
export function cameraY(race: RaceResult | null, framePos: number, viewH: number, follow: number[] | null = null): number {
  if (!race || framePos < 0) return 0;
  // 따라가는 가게의 구슬 중 아직 달리는 가장 앞 구슬을, 다 들어왔으면 다시 선두를.
  const followY = (f: number) => {
    if (follow === null) return null;
    const frame = race.frames[clamp(Math.floor(f), 0, race.frames.length - 1)];
    let best: number | null = null;
    for (const i of follow) {
      const m = frame[i];
      if (m && m.y < FINISH_Y && (best === null || m.y > best)) best = m.y;
    }
    return best;
  };
  let sum = 0;
  const N = 12;
  for (let k = 0; k < N; k += 1) {
    const f = framePos - k * 3;
    sum += followY(f) ?? leaderY(race, f);
  }
  return clamp(sum / N - viewH * (follow === null ? 0.6 : 0.5), 0, BOARD_H - viewH);
}

/** 카메라가 목표로 옮겨 가는 비율(그릴 때마다). 따라갈 공을 바꿔도 화면이 튀지 않는다. */
const CAMERA_EASE = 0.18;
/** 공을 누른 것으로 치는 거리. 구슬 반지름보다 넉넉하게 — 손가락은 굵다. */
const HIT_R = 16;
/** 따라가는 동안 나머지 구슬의 불투명도. */
const FOLLOW_DIM = 0.4;

/** 쇠구슬. 색으로 누구 구슬인지 구분하고, 하이라이트와 그림자로 입체감을 낸다. */
/** 양 끝이 둥근 알약 모양 경로. ctx.roundRect 는 사파리 16 미만에 없다. */
function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + r, y + h);
  ctx.arc(x + r, y + r, r, Math.PI / 2, (Math.PI * 3) / 2);
  ctx.closePath();
}

function drawMarble(ctx: CanvasRenderingContext2D, x: number, y: number, i: number) {
  ctx.save();
  ctx.fillStyle = 'oklch(0.06 0.02 280 / 0.5)';
  ctx.beginPath();
  ctx.ellipse(x + SHADOW_DX, y + SHADOW_DY, MARBLE_R, MARBLE_R * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();
  const body = ctx.createRadialGradient(x - 2.5, y - 2.5, 0.5, x, y, MARBLE_R);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.35, marbleColor(i));
  body.addColorStop(1, `oklch(0.45 0.15 ${marbleHue(i)})`);
  ctx.fillStyle = body;
  ctx.shadowColor = marbleGlow(i);
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(x, y, MARBLE_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

interface Play {
  run: number;
  /** 돌린 순간의 후보·공 구성. 끝난 판 위에서 칩으로 후보가 바뀌면 이 경기는 버린다. */
  key: string;
  race: RaceResult;
  timing: Timing;
}

interface PinballProps extends GameProps {
  /** 후보 순서대로 공 개수. 돌린 뒤엔 App 이 얼려 둔 값이 온다. */
  balls: number[];
  /** 공 개수 바꾸기(가게 id → 개수). 없으면 개수 손잡이를 안 보인다. */
  onBallCounts?: (update: (prev: Record<string, number>) => Record<string, number>) => void;
}

export function Pinball({
  candidates,
  winnerIndex,
  spinning,
  run,
  onSpinEnd,
  expanded = false,
  balls,
  onBallCounts,
}: PinballProps) {
  const viewH = expanded ? VIEW_H_BIG : VIEW_H;
  const count = candidates.length;
  const ballsKey = balls.slice(0, count).join(',');
  const playKey = `${candidates.map((p) => p.id).join(',')}|${ballsKey}`;
  /** 구슬마다 어느 가게인지. */
  const marbles = useMemo(() => marblesFor(ballsKey === '' ? [] : ballsKey.split(',').map(Number)), [ballsKey]);
  const total = marbles.length;
  /** 같은 가게 구슬 중 몇 번째인지(순위판 ①②). */
  const nth = useMemo(() => {
    const seen = new Map<number, number>();
    return marbles.map((p) => {
      const k = seen.get(p) ?? 0;
      seen.set(p, k + 1);
      return k;
    });
  }, [marbles]);
  const ballsOf = (place: number) => balls[place] ?? 1;

  const [theme, setThemeState] = useState<PinballTheme>(readTheme);
  const course = useMemo(() => buildCourse(theme), [theme]);
  const pickTheme = (next: PinballTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 시크릿 창에서는 저장이 막힌다. 이번 방문 동안만 바뀐다.
    }
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 이 판에서 찾은 경기. 판 번호와 같이 들고 있어 지난 판 경기가 새 판에 비치지 않는다. */
  const [play, setPlay] = useState<Play | null>(null);
  /** 재생 진행도(0~1). -1 이면 아직 게이트에 서 있다. */
  const [progress, setProgress] = useState<{ run: number; t: number }>({ run: -1, t: -1 });
  /** 게이트에서 기다린 시간. 구슬이 들썩이는 데 쓴다. */
  const [gateMs, setGateMs] = useState(0);
  /** 사용자가 고른 가게. 카메라가 그 가게 구슬을 따라간다. null 이면 선두. 판이 바뀌어도 유지한다. */
  const [followPick, setFollow] = useState<number | null>(null);
  const follow = followPick !== null && followPick < count ? followPick : null;
  const followMarbles = useMemo(
    () => (follow === null ? null : marbles.flatMap((p, m) => (p === follow ? [m] : []))),
    [follow, marbles],
  );
  /** 게이트에 선 순서. slots[k] = k 번 자리에 선 구슬. "자리 섞기" 로 바뀐다. */
  const [order, setOrder] = useState<number[]>([]);
  const slots = order.length === total ? order : marbles.map((_, m) => m);
  /** 섞는 중이면 섞기 전 위치와 시작 시각. 그동안 매 프레임 다시 그린다. */
  const [shuffling, setShuffling] = useState<{ from: { x: number; y: number }[]; at: number } | null>(null);
  const [, setTick] = useState(0);
  // 그리기가 남긴 값. 클릭이 어느 구슬을 눌렀는지 계산하는 데 쓴다.
  const drawnRef = useRef<{ cam: number; positions: { x: number; y: number }[] }>({ cam: 0, positions: [] });
  const camRef = useRef<{ run: number; y: number } | null>(null);
  const touchedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!shuffling) return;
    let raf = 0;
    const loop = (now: number) => {
      if (now - shuffling.at >= SHUFFLE_MS) {
        setShuffling(null);
        return;
      }
      setTick((n) => n + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shuffling]);

  // 판 하나: 게이트 → 경기 만들기 → 재생 → 끝.
  useEffect(() => {
    if (!spinning || winnerIndex === null || total === 0) return;
    let cancelled = false;
    let timer = 0;
    let endTimer = 0;
    let raf = 0;
    const reduced = prefersReducedMotion();
    const t0 = performance.now();

    // 시작 시드를 판마다 흔든다. 고정하면 (후보 수, 당첨) 마다 늘 같은 경기다.
    const seed = startSeedFor(run);

    const gate = (now: number) => {
      if (cancelled) return;
      setGateMs(now - t0);
      raf = requestAnimationFrame(gate);
    };

    const startPlayback = (found: Play) => {
      cancelAnimationFrame(raf);
      if (reduced) {
        setProgress({ run, t: 1 });
        onSpinEnd();
        return;
      }
      const started = performance.now();
      sfx('go'); // 게이트가 열린다
      const tick = (now: number) => {
        if (cancelled) return;
        // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다.
        const t = clamp((now - started) / found.timing.playMs, 0, 1);
        setProgress({ run, t });
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      endTimer = window.setTimeout(() => {
        setProgress({ run, t: 1 });
        onSpinEnd();
      }, found.timing.playMs);
    };

    // 당첨 가게의 구슬 하나가 1등 하는 경기(raceForWinner). 경기 한 번이라 바로 끝난다.
    // 공이 여럿이면 그중 어느 구슬이 이길지는 판 번호로 고른다 — 당첨 가게는 이미 정해졌다.
    const prepare = () => {
      if (cancelled) return;
      const target = winnerMarble(marbles, winnerIndex, seededRandom(seed + 7));
      const race = target < 0 ? null : raceForWinner(total, target, seed, theme);
      if (!race) {
        cancelAnimationFrame(raf);
        onSpinEnd();
        return;
      }
      const found = { run, key: playKey, race, timing: timingFor(race.frames.length, race.winnerFrame) };
      // 게이트에서 구슬이 실제 출발 자리로 섞여 들어가도록 경기를 먼저 건넨다.
      setPlay(found);
      const wait = reduced ? 0 : Math.max(0, GATE_MS - (performance.now() - t0));
      timer = window.setTimeout(() => startPlayback(found), wait);
    };

    if (!reduced) raf = requestAnimationFrame(gate);
    timer = window.setTimeout(prepare, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(endTimer);
      cancelAnimationFrame(raf);
    };
    // marbles·theme 는 돌린 순간 얼려 둔 값이다(App 이 balls 를 얼린다, 테마 칩은 연출 중 잠긴다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, total, run, onSpinEnd]);

  // 끝난 경기는 구슬 수가 그때 기준이다. 칩으로 후보가 줄면 구슬 위치가 남아 색 계산이
  // NaN 이 되고 앱 전체가 멈췄다(10/14). 구성이 바뀌면 경기를 버리고 출발선으로 돌아간다.
  const current = play && play.run === run && play.key === playKey ? play : null;
  const race = current?.race ?? null;
  const timing = current?.timing ?? null;
  const t = progress.run === run ? progress.t : -1;
  const atGate = spinning && t < 0;

  /**
   * 지금 그릴 프레임 위치(소수). 소수부로 다음 프레임과 섞어 그린다.
   * 본편, 막판 슬로모션, 1등 이후 정리 세 구간을 이어 붙인다.
   */
  const framePos = useMemo(() => {
    if (!race || !timing || t < 0) return -1;
    return frameAtMs(timing, t * timing.playMs);
  }, [race, timing, t]);

  const frameIndex = framePos < 0 ? -1 : Math.floor(framePos);
  const slowMo = race !== null && timing !== null && framePos >= timing.slowFrom && frameIndex < race.winnerFrame;

  /** 순위판이 읽는 값. 아직 안 돌렸으면 후보 순서 그대로. */
  const standing = useMemo(() => {
    if (!race || frameIndex < 0) return slots;
    return race.standings[frameIndex] ?? race.order;
  }, [race, frameIndex, slots]);

  const arrived = useMemo(() => {
    if (!race || frameIndex < 0) return 0;
    return race.frames[frameIndex].filter((m) => m.y >= FINISH_Y).length;
  }, [race, frameIndex]);

  /** 따라가는 가게 구슬이 들어왔으면 그중 가장 좋은 등수. 응원한 가게의 결과를 알려 준다. */
  const followRank = useMemo(() => {
    if (!race || frameIndex < 0 || !followMarbles) return null;
    const ranks = followMarbles
      .filter((m) => (race.frames[frameIndex][m]?.y ?? 0) >= FINISH_Y)
      .map((m) => race.order.indexOf(m) + 1);
    return ranks.length > 0 ? Math.min(...ranks) : null;
  }, [race, frameIndex, followMarbles]);

  /** 1등이 이미 들어왔는가. 순위판 1위를 그때부터 강조한다. */
  const leadIn = race !== null && frameIndex >= race.winnerFrame;

  /** 게이트에 선 자리(섞기 중이면 섞기 전 자리에서 옮겨 가는 중). */
  const restingAt = (now: number) => {
    const slotOf = new Array<number>(total);
    slots.forEach((m, k) => {
      slotOf[m] = k;
    });
    const spots = marbles.map((_, m) => startSpot(slotOf[m] ?? m, total));
    if (!shuffling) return spots;
    const p = ease(clamp((now - shuffling.at) / SHUFFLE_MS, 0, 1));
    return spots.map((sp, m) => {
      const f = shuffling.from[m] ?? sp;
      return { x: f.x + (sp.x - f.x) * p, y: f.y + (sp.y - f.y) * p - Math.sin(p * Math.PI) * 10 };
    });
  };

  // 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pal = PALETTES[theme];
    const now = performance.now();

    // 동작 줄이기면 맥박·깜빡임 없이 고정값으로 그린다.
    const reducedNow = prefersReducedMotion();
    // 크게 보기면 캔버스가 화면에서 두 배 넘게 늘어난다. 그만큼 해상도를 올려야 흐리지 않다.
    const shown = canvas.clientWidth || CANVAS_W;
    const dpr = Math.min(Math.min(window.devicePixelRatio || 1, MAX_BASE_DPR) * Math.max(1, shown / CANVAS_W), 4);
    // 크기가 같으면 다시 넣지 않는다. 넣을 때마다 캔버스가 통째로 다시 잡힌다.
    const w = Math.round(CANVAS_W * dpr);
    const h = Math.round(viewH * dpr);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS_W, viewH);

    // 지금 프레임의 구슬 위치. 소수 프레임은 앞뒤를 섞는다.
    const at = (pos: number) => {
      if (!race || pos < 0) return null;
      const end = race.frames.length - 1;
      const p = clamp(pos, 0, end);
      const a = race.frames[Math.floor(p)];
      const b = race.frames[Math.min(end, Math.floor(p) + 1)];
      const f = p - Math.floor(p);
      return a.map((m, i) => ({ x: m.x + (b[i].x - m.x) * f, y: m.y + (b[i].y - m.y) * f }));
    };
    const frame = at(framePos);
    const step = framePos >= 0 ? framePos : atGate ? gateMs / FRAME_MS : 0;
    const touching = (x: number, y: number, r: number) =>
      frame?.some((m) => Math.hypot(m.x - x, m.y - y) <= MARBLE_R + r + 2) ?? false;

    // 게이트: 제자리에서 들썩이다가, 경기가 준비되면 실제 출발 자리로 섞여 들어간다.
    const rest = restingAt(now);
    const resting = rest.map((spot, i) => {
      if (!atGate) return spot;
      const wob = Math.sin(gateMs / 70 + i * 1.7) * 1.6;
      const start = race?.frames[0]?.[i];
      const p = start ? ease(clamp((gateMs - GATE_SHUFFLE_FROM) / (GATE_MS - GATE_SHUFFLE_FROM), 0, 1)) : 0;
      const tx = start ? spot.x + (start.x - spot.x) * p : spot.x;
      const ty = start ? spot.y + (start.y - spot.y) * p : spot.y;
      return { x: tx + wob * (1 - p), y: ty + Math.abs(wob) * 0.5 * (1 - p) - Math.sin(p * Math.PI) * 8 };
    });
    const positions = frame ?? resting;
    // 목표 위치로 부드럽게 옮겨 간다. 새 판의 첫 프레임은 바로 맞춘다.
    const target = frame ? cameraY(race, framePos, viewH, followMarbles) : 0;
    const prev = camRef.current;
    // 부드럽게 옮기는 건 재생 중일 때만. 끝난 뒤엔 다시 그릴 일이 없어 중간에 멈춘다.
    const playing = frame !== null && t < 1;
    const cam = playing && prev && prev.run === run ? prev.y + (target - prev.y) * CAMERA_EASE : target;
    camRef.current = { run, y: cam };
    drawnRef.current = { cam, positions };

    // 코스 창
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, COURSE_W, viewH);
    ctx.clip();
    ctx.translate(0, -cam);

    // 창 밖은 그리지 않는다(pinballDraw ViewBand). 여유 40 은 가장 큰 그림자 번짐(22)과 범퍼 반지름을 덮는다.
    const view = { top: cam - VIEW_PAD, bottom: cam + viewH + VIEW_PAD };
    drawTable(ctx, theme, course, now, reducedNow, view);
    course.portals.forEach((pt, k) => {
      if (inBand(view, pt.from.y - pt.r - 4, pt.from.y + pt.r + 4) || inBand(view, pt.to.y - 9, pt.to.y + 9))
        drawPortal(ctx, pt, k, now, reducedNow);
    });
    for (const wl of course.walls)
      if (inBand(view, Math.min(wl.y1, wl.y2), Math.max(wl.y1, wl.y2))) drawWall(ctx, wl, frame, theme);
    for (const sp of course.spinners)
      if (inBand(view, sp.y - sp.half, sp.y + sp.half)) drawSpinner(ctx, spinnerEnds(sp, step), sp.x, sp.y, theme);
    for (const o of course.orbiters)
      if (inBand(view, o.y - o.R - o.r, o.y + o.R + o.r)) drawOrbiter(ctx, o, step, theme, touching);
    // 구슬이 새로 닿은 범퍼·핀만 소리를 낸다(닿아 있는 동안 매 프레임 울리지 않게).
    const touchedNow = new Set<number>();
    course.pegs.forEach((peg, k) => {
      const hit = touching(peg.x, peg.y, peg.r);
      if (hit) {
        touchedNow.add(k);
        if (playing && !touchedRef.current.has(k)) {
          if (peg.bumper) sfx('bump');
          else sfx('peg', clamp(peg.y / BOARD_H, 0, 1));
        }
      }
      // 소리는 창 밖이어도 낸다. 그리기만 건너뛴다.
      if (!inBand(view, peg.y - peg.r, peg.y + peg.r)) return;
      if (peg.bumper) drawBumper(ctx, peg.x, peg.y, peg.r, hit, theme);
      else drawPost(ctx, peg.x, peg.y, peg.r, hit, theme);
    });
    touchedRef.current = touchedNow;

    // 출발 게이트 — 경기가 준비되기 전까지 닫혀 있다. 맨 아래 출발 줄 바로 밑.
    if (!frame) {
      const gateY = startSpot(Math.max(0, total - 1), Math.max(1, total)).y + 12;
      ctx.save();
      ctx.strokeStyle = atGate ? 'oklch(0.75 0.2 30)' : 'oklch(0.6 0.02 260)';
      ctx.shadowColor = 'oklch(0.75 0.2 30)';
      ctx.shadowBlur = atGate ? 10 : 0;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(4, gateY);
      ctx.lineTo(COURSE_W - 4, gateY);
      ctx.stroke();
      ctx.restore();
    }

    // 구슬 잔상. 속도감이 여기서 나온다 — 빠른 구슬은 꼬리가 길다.
    if (frame) {
      for (let k = TRAIL; k >= 1; k -= 1) {
        const past = at(framePos - k * TRAIL_STEP * (slowMo ? SLOW_RATE : 1));
        if (!past) continue;
        past.forEach((m, i) => {
          if (m.y >= FINISH_Y || !inBand(view, m.y)) return;
          ctx.beginPath();
          ctx.arc(m.x, m.y, MARBLE_R * (1 - k / (TRAIL + 2)), 0, Math.PI * 2);
          const dim = follow !== null && marbles[i] !== follow ? FOLLOW_DIM : 1;
          ctx.fillStyle = `oklch(0.78 0.19 ${marbleHue(marbles[i])} / ${0.28 * dim * (1 - k / (TRAIL + 1))})`;
          ctx.fill();
        });
      }
    }

    /*
     * 따라가는 가게가 있으면 나머지는 흐리게 깔고 그 가게 구슬은 또렷하게 맨 위에.
     * 그중 가장 앞서 달리는 구슬에 스포트라이트와 이름표를 단다.
     * 점선 고리 하나로는 구슬 여럿 사이에서 잘 안 보였다(10/9 사용자).
     */
    let lead: number | null = null;
    if (followMarbles) {
      for (const m of followMarbles) {
        const pm = positions[m];
        if (!pm || (frame && pm.y >= FINISH_Y)) continue;
        if (lead === null || pm.y > positions[lead].y) lead = m;
      }
    }
    const followed = lead !== null;
    const dimOthers = follow !== null ? FOLLOW_DIM : 1;
    positions.forEach((m, i) => {
      if (marbles[i] === follow || !inBand(view, m.y)) return;
      ctx.save();
      ctx.globalAlpha = dimOthers;
      drawMarble(ctx, m.x, m.y, marbles[i]);
      ctx.restore();
    });
    if (followMarbles)
      for (const i of followMarbles)
        if (i !== lead && positions[i]) drawMarble(ctx, positions[i].x, positions[i].y, marbles[i]);
    if (lead !== null && follow !== null) {
      const m = positions[lead];
      const pulse = reducedNow ? 0.5 : 0.5 + 0.5 * Math.sin(now / 180);
      ctx.save();
      // 스포트라이트
      const halo = ctx.createRadialGradient(m.x, m.y, MARBLE_R, m.x, m.y, MARBLE_R + 22);
      halo.addColorStop(0, `oklch(0.95 0.08 ${marbleHue(follow)} / ${0.55 + 0.25 * pulse})`);
      halo.addColorStop(1, `oklch(0.95 0.08 ${marbleHue(follow)} / 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(m.x, m.y, MARBLE_R + 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      drawMarble(ctx, m.x, m.y, follow);
      ctx.save();
      // 고리 두 겹 — 바깥 흰색, 안쪽 구슬 색. 맥박 치며 커졌다 작아진다.
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'oklch(0.99 0 0)';
      ctx.beginPath();
      ctx.arc(m.x, m.y, MARBLE_R + 5 + pulse * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = marbleColor(follow);
      ctx.beginPath();
      ctx.arc(m.x, m.y, MARBLE_R + 2.5, 0, Math.PI * 2);
      ctx.stroke();
      // 머리 위 이름표와 화살표. 통통 튄다.
      const tagY = m.y - MARBLE_R - 16 - pulse * 3;
      const label = shortName(candidates[follow]?.name ?? '', 8);
      ctx.font = '800 11px system-ui, sans-serif';
      const tw = ctx.measureText(label).width + 12;
      const tx = clamp(m.x, tw / 2 + 2, COURSE_W - tw / 2 - 2);
      ctx.fillStyle = marbleColor(follow);
      ctx.beginPath();
      pillPath(ctx, tx - tw / 2, tagY - 15, tw, 16);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(m.x - 5, tagY + 1);
      ctx.lineTo(m.x + 5, tagY + 1);
      ctx.lineTo(m.x, tagY + 7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'oklch(0.15 0.03 280)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, tx, tagY - 7);
      ctx.restore();
    }

    // 이름표는 구슬을 다 그린 뒤에 얹는다. 먼저 그리면 뒤 구슬이 글자를 덮는다.
    // 구슬이 많으면(출발 줄이 여러 줄) 게이트에선 이름을 빼고 색으로만 구분한다 — 글자가 겹친다.
    const crowdedGate = !frame && total > 20;
    positions.forEach((m, i) => {
      const place = candidates[marbles[i]];
      if (!place || crowdedGate) return;
      if (frame && m.y >= FINISH_Y) return;
      if (i === lead) return;
      ctx.save();
      ctx.globalAlpha = follow !== null && marbles[i] !== follow ? FOLLOW_DIM : 1;
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'oklch(0.14 0.03 280 / 0.85)';
      ctx.strokeText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
      ctx.fillStyle = marbleColor(marbles[i]);
      ctx.fillText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
      ctx.restore();
    });
    ctx.restore();

    // 화면 위 따라가기 배지 — 지금 몇 등인지 실시간으로.
    if (follow !== null && candidates[follow]) {
      const rank = standing.findIndex((m) => marbles[m] === follow) + 1;
      const done = frame !== null && !followed;
      const text = `📍 ${shortName(candidates[follow].name, 8)} ${frame ? (done ? `${rank}등 도착` : `${rank}등`) : '응원 중'}`;
      ctx.save();
      ctx.font = '800 12px system-ui, sans-serif';
      const bw = ctx.measureText(text).width + 16;
      ctx.fillStyle = 'oklch(0.14 0.03 280 / 0.85)';
      ctx.strokeStyle = marbleColor(follow);
      ctx.lineWidth = 2;
      ctx.beginPath();
      pillPath(ctx, 6, viewH - 30, bw, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = marbleColor(follow);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 14, viewH - 19);
      ctx.restore();
    } else if (!frame && count > 1 && !atGate && total <= 20) {
      // 고를 수 있다는 걸 알려 준다. 게이트 앞에서만. 출발 줄이 여러 줄이면 첫 장애물과 겹쳐 뺀다.
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `oklch(0.92 0.05 285 / ${reducedNow ? 0.9 : 0.65 + 0.35 * Math.sin(now / 300)})`;
      ctx.fillText(
        '👆 공을 눌러 내 공을 골라 보세요',
        COURSE_W / 2,
        startSpot(Math.max(0, total - 1), Math.max(1, total)).y + 34,
      );
      ctx.restore();
    }

    // 막판 슬로모션 — 붉은 테두리가 맥박 치고 "결승 직전"
    if (slowMo) {
      const pulse = 0.35 + 0.25 * Math.sin(now / 120);
      ctx.save();
      ctx.strokeStyle = `oklch(0.65 0.24 25 / ${pulse})`;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, COURSE_W - 6, viewH - 6);
      ctx.fillStyle = 'oklch(0.95 0.05 25)';
      ctx.shadowColor = 'oklch(0.65 0.24 25)';
      ctx.shadowBlur = 12;
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('결승 직전', COURSE_W / 2, 12);
      ctx.restore();
    }

    // 오른쪽 패널
    ctx.fillStyle = pal.panel;
    ctx.fillRect(COURSE_W, 0, PANEL_W, viewH);
    ctx.strokeStyle = 'oklch(0.45 0.02 260)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(COURSE_W + 0.5, 0);
    ctx.lineTo(COURSE_W + 0.5, viewH);
    ctx.stroke();

    // 미니맵 — 판 전체와 지금 보이는 창, 구슬 위치
    const mapX = COURSE_W + 6;
    const mapW = 14;
    const mapTop = 8;
    const mapH = viewH - 16;
    const sx = mapW / COURSE_W;
    const sy = mapH / BOARD_H;
    ctx.fillStyle = pal.minimap;
    ctx.fillRect(mapX, mapTop, mapW, mapH);
    ctx.fillStyle = 'oklch(0.4 0.12 25 / 0.6)';
    ctx.fillRect(mapX, mapTop + FUNNEL_Y * sy, mapW, (FINISH_Y - FUNNEL_Y) * sy);
    ctx.strokeStyle = 'oklch(0.85 0.02 260 / 0.8)';
    ctx.strokeRect(mapX - 0.5, mapTop + cam * sy, mapW + 1, viewH * sy);
    positions.forEach((m, i) => {
      ctx.fillStyle = marbleColor(marbles[i]);
      ctx.fillRect(mapX + m.x * sx - 1, mapTop + m.y * sy - 1, 2.5, 2.5);
    });
    if (lead !== null && follow !== null && positions[lead]) {
      const m = positions[lead];
      ctx.save();
      ctx.fillStyle = marbleColor(follow);
      ctx.strokeStyle = 'oklch(0.99 0 0)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mapX + m.x * sx, mapTop + m.y * sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 순위판
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'oklch(0.6 0.02 260)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillText(atGate ? '출발 준비' : `${arrived} / ${total}`, CANVAS_W - 6, 14);

    standing.forEach((marble, rank) => {
      const placeIdx = marbles[marble];
      const place = candidates[placeIdx];
      if (!place) return;
      const y = 34 + rank * 15;
      if (y > viewH - 8) return;
      const champion = leadIn && rank === 0;
      ctx.save();
      if (placeIdx === follow) {
        ctx.fillStyle = `oklch(0.78 0.19 ${marbleHue(placeIdx)} / 0.22)`;
        ctx.fillRect(COURSE_W + 24, y - 7, PANEL_W - 26, 14);
      }
      if (champion || (slowMo && rank < 2)) {
        ctx.shadowColor = marbleGlow(placeIdx);
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = marbleColor(placeIdx);
      ctx.font = `${rank === 0 ? '700' : '500'} 10px system-ui, sans-serif`;
      const mark = placeIdx === follow ? '◉ ' : '';
      const which = ballsOf(placeIdx) > 1 ? (NTH[nth[marble]] ?? '') : '';
      ctx.fillText(`${mark}${shortName(place.name)}${which} ${champion ? '✓' : `#${rank + 1}`}`, CANVAS_W - 6, y);
      ctx.restore();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /*
   * 공을 누르면 그 공의 가게를 따라간다. 같은 가게를 다시 누르면 선두로 돌아간다.
   * 오른쪽 순위판의 이름을 눌러도 된다(작은 구슬을 손가락으로 맞히기 어렵다).
   */
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const k = CANVAS_W / rect.width;
    const x = (e.clientX - rect.left) * k;
    const y = (e.clientY - rect.top) * k;
    let hit: number | null = null;
    if (x < COURSE_W) {
      const { cam, positions } = drawnRef.current;
      let best = HIT_R;
      positions.forEach((m, i) => {
        const d = Math.hypot(m.x - x, m.y - (y + cam));
        if (d <= best) {
          best = d;
          hit = i;
        }
      });
    } else {
      const rank = Math.round((y - 34) / 15);
      if (rank >= 0 && rank < standing.length && Math.abs(y - (34 + rank * 15)) <= 7) hit = standing[rank];
    }
    if (hit === null) return;
    const place = marbles[hit];
    setFollow(place === follow ? null : place);
  };

  /** 게이트 자리를 섞는다. 보이기만 바뀐다 — 출발할 때 실제 출발 자리로 한 번 더 섞인다. */
  const shuffleSlots = () => {
    const from = drawnRef.current.positions.slice();
    const next = slots.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setShuffling(prefersReducedMotion() ? null : { from, at: performance.now() });
  };

  /**
   * 공 개수를 바꾼 결과를 한 문장으로 읽어 준다. 예전엔 줄마다 aria-live 가 있어 "모두 3개" 한 번에
   * 일곱 줄이 한꺼번에 읽혔다(10/15 리뷰). 목록 밖 한 곳에 마지막 바뀐 것만 남긴다.
   */
  const [ballNote, setBallNote] = useState('');
  const setBalls = (i: number, n: number) => {
    const next = Math.max(1, Math.min(MAX_BALLS_EACH, n));
    const nextTotal = total - ballsOf(i) + next;
    setBallNote(`${candidates[i].name} 공 ${next}개, ${Math.round((next / Math.max(1, nextTotal)) * 100)}%`);
    onBallCounts?.((prev) => ({ ...prev, [candidates[i].id]: next }));
  };
  const setAll = (n: number) => {
    setBallNote(`모든 가게 공 ${n}개`);
    onBallCounts?.(() => Object.fromEntries(candidates.map((p) => [p.id, n])));
  };

  if (count === 0) return <div className="pinball pinball--empty" />;

  return (
    <div
      className={[
        'pinball',
        expanded ? 'pinball--big' : '',
        spinning ? 'pinball--spinning' : '',
        // 판이 시작된 뒤(끝나도 결과를 보는 동안)는 확률표가 필요 없다. 판을 가운데로.
        spinning || winnerIndex !== null ? 'pinball--live' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="pinball__bar">
        <div className="pinball__themes" role="group" aria-label="판 테마">
          {PINBALL_THEMES.map((th) => (
            <button
              key={th.id}
              type="button"
              className="pinball__chip"
              aria-pressed={theme === th.id}
              disabled={spinning}
              onClick={() => pickTheme(th.id)}
            >
              <span aria-hidden="true">{th.icon} </span>
              {th.label}
            </button>
          ))}
        </div>
        <button type="button" className="pinball__chip" onClick={shuffleSlots} disabled={spinning || total < 2}>
          <span aria-hidden="true">🔀 </span>자리 섞기
        </button>
      </div>
      <div className="pinball__play">
        {/* 확률은 판 옆에 늘 보인다. 공 개수 설정은 접혀 있어 확률이 안 보였다(10/13 사용자).
            누르면 그 공을 따라간다 — 캔버스·카메라 고르기와 같은 상태다. */}
        <ul className="pinball__odds" aria-label="가게별 당첨 확률">
          {candidates.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className="pinball__odd"
                aria-pressed={follow === i}
                title={`${p.name} 공을 따라가기`}
                onClick={() => setFollow(follow === i ? null : i)}
              >
                <span className="pinball__dot" style={{ background: marbleColor(i) }} aria-hidden="true" />
                <span className="pinball__oddName">{shortName(p.name, 5)}</span>
                <span className="pinball__oddPct">{Math.round((ballsOf(i) / Math.max(1, total)) * 100)}%</span>
              </button>
            </li>
          ))}
        </ul>
        <canvas
          ref={canvasRef}
          style={{ aspectRatio: `${CANVAS_W} / ${viewH}` }}
          role="img"
          aria-label={`${PINBALL_THEMES.find((th) => th.id === theme)?.label ?? ''} 판, 구슬 ${total}개 핀볼${
            follow === null ? '' : `, ${candidates[follow].name} 구슬을 따라가는 중`
          }`}
          onClick={onCanvasClick}
        />
      </div>
      {/* 키보드·화면낭독기로도 고를 수 있게. 캔버스 클릭과 같은 상태를 쓴다. */}
      <label className="pinball__follow">
        <span>카메라</span>
        <select
          value={follow === null ? '' : String(follow)}
          onChange={(e) => setFollow(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">선두 따라가기</option>
          {candidates.map((p, i) => (
            <option key={p.id} value={i}>
              {p.name} 따라가기
            </option>
          ))}
        </select>
        {follow !== null && followRank !== null ? (
          <span className="pinball__tip pinball__tip--done" role="status">
            {followRank === 1 ? '🎉 ' : '📍 '}
            {shortName(candidates[follow].name, 10)} {followRank}등으로 들어왔어요
          </span>
        ) : follow !== null && followMarbles && race && t >= 1 ? (
          // 1등이 들어오면 바로 끝낸다(빨리감기 없음). 따라가던 공이 아직 판 위면 그때 자리를 알려 준다.
          <span className="pinball__tip pinball__tip--done" role="status">
            📍 {shortName(candidates[follow].name, 10)}{' '}
            {Math.min(...followMarbles.map((m) => standing.indexOf(m) + 1).filter((r) => r > 0))}위에서 끝났어요
          </span>
        ) : (
          <span className="pinball__tip" aria-hidden="true">
            공을 누르면 그 가게 공을 따라가요
          </span>
        )}
      </label>
      {onBallCounts && (
        // 처음부터 펼쳐 둔다 — 시작 전에 공 개수를 고르는 게 이 판의 재미라 접혀 있으면 지나쳤다(10/13 사용자).
        <details className="pinball__balls" open>
          <summary>
            가게별 공과 당첨 확률 <span className="pinball__total">공 {total}개</span>
          </summary>
          <p className="muted small">
            공이 많은 가게일수록 잘 걸려요. 이번 방문 동안만 쓰고, 다른 게임은 늘 똑같은 확률이에요.
          </p>
          <div className="pinball__all" role="group" aria-label="모든 가게 같은 개수로">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className="pinball__chip"
                aria-pressed={balls.slice(0, count).every((b) => b === n)}
                disabled={spinning || n * count > MAX_MARBLES}
                onClick={() => setAll(n)}
              >
                모두 {n}개
              </button>
            ))}
          </div>
          <ul className="pinball__ballList">
            {candidates.map((p, i) => {
              const n = ballsOf(i);
              return (
                <li key={p.id}>
                  <span className="pinball__dot" style={{ background: marbleColor(i) }} aria-hidden="true" />
                  <span className="pinball__ballName">{p.name}</span>
                  <span className="pinball__pct">{Math.round((n / Math.max(1, total)) * 100)}%</span>
                  <span className="pinball__stepper">
                    <button
                      type="button"
                      aria-label={`${p.name} 공 하나 빼기`}
                      disabled={spinning || n <= 1}
                      onClick={() => setBalls(i, n - 1)}
                    >
                      −
                    </button>
                    <span>
                      {n}
                      <span className="sr-only">개</span>
                    </span>
                    <button
                      type="button"
                      aria-label={`${p.name} 공 하나 더`}
                      disabled={spinning || n >= MAX_BALLS_EACH || total >= MAX_MARBLES}
                      onClick={() => setBalls(i, n + 1)}
                    >
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {onBallCounts && (
        <p className="sr-only" role="status">
          {ballNote}
        </p>
      )}
    </div>
  );
}
