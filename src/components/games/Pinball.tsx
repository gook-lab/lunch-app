/**
 * 핀볼 — 이름 붙은 구슬들이 긴 판을 굴러 내려가고, 카메라가 선두를 따라간다.
 *
 * 당첨은 이미 정해져 있고(winnerIndex), 여기서는 경기를 한 번 돌려 1등 구슬과
 * 당첨 구슬의 이름표를 맞바꾼 경기를 재생한다(raceForWinner). 물리는 조작하지
 * 않는다 — lib/pinball.ts 참고.
 *
 * 흐름: 출발 게이트(구슬이 들썩인다) → 경기(카메라가 선두를
 * 따라 내려간다) → 막판 슬로모션(선두가 출구에 다가가면 0.45배) → 나머지 정리.
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
  buildCourse,
  raceForWinner,
  spinnerEnds,
  type RaceResult,
  type Wall,
} from '../../lib/pinball';
import { prefersReducedMotion, type GameProps } from './types';
import { FRAME_MS, SLOW_RATE, frameAtMs, timingFor, type Timing } from '../../lib/pinballTiming';

/** 캔버스 = 코스 창 + 오른쪽 패널(미니맵, 순위판). */
const PANEL_W = 112;
const CANVAS_W = COURSE_W + PANEL_W;
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
const COURSE = buildCourse();

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
/** 출발 게이트 최소 대기. 경기는 바로 만들어지지만 게이트가 열리는 걸 보여 준다. */
const GATE_MS = 450;
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

/** 출발 자리. 게이트 위에 한 줄로 선다. */
function restingSpot(i: number, count: number) {
  return { x: (COURSE_W / (count + 1)) * (i + 1), y: 18 };
}

/** 프레임 f 에서 아직 안 들어온 구슬 중 가장 아래(선두)의 y. */
function leaderY(race: RaceResult, f: number): number {
  const frame = race.frames[clamp(Math.floor(f), 0, race.frames.length - 1)];
  let best = 0;
  for (const m of frame) if (m.y < FINISH_Y && m.y > best) best = m.y;
  return best === 0 ? BOARD_H : best;
}

/**
 * 카메라 위치(보이는 창의 위쪽 y). 선두를 창의 60% 높이에 두되, 지난 몇
 * 프레임을 평균내서 선두가 바뀔 때 화면이 튀지 않게 한다.
 */
function cameraY(race: RaceResult | null, framePos: number, viewH: number, follow: number | null = null): number {
  if (!race || framePos < 0) return 0;
  // 따라가는 구슬이 아직 달리는 중이면 그 구슬을, 들어왔으면 다시 선두를.
  const followY = (f: number) => {
    if (follow === null) return null;
    const frame = race.frames[clamp(Math.floor(f), 0, race.frames.length - 1)];
    const m = frame[follow];
    return m && m.y < FINISH_Y ? m.y : null;
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

/*
 * 탑다운 판 그리기. 물리와 무관한 모양만 여기 있다.
 * 빛은 왼쪽 위에서 온다고 보고 그림자를 오른쪽 아래로 떨어뜨린다.
 */
const SHADOW_DX = 2;
const SHADOW_DY = 3;
/** 깔때기가 시작되는 높이. 여기서부터 바닥을 붉게 물들인다. */
const FUNNEL_Y = 1638;

function drawTable(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, 0, BOARD_H);
  g.addColorStop(0, 'oklch(0.2 0.06 285)');
  g.addColorStop(0.45, 'oklch(0.3 0.09 285)');
  g.addColorStop(0.75, 'oklch(0.26 0.09 300)');
  g.addColorStop(1, 'oklch(0.24 0.1 20)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, COURSE_W, BOARD_H);

  // 깔때기 — 아래를 가리키는 경고 화살표
  ctx.save();
  ctx.fillStyle = 'oklch(0.65 0.2 30 / 0.22)';
  for (const y of [1646, 1678]) {
    ctx.beginPath();
    ctx.moveTo(COURSE_W / 2 - 22, y);
    ctx.lineTo(COURSE_W / 2, y + 14);
    ctx.lineTo(COURSE_W / 2 + 22, y);
    ctx.lineTo(COURSE_W / 2 + 22, y + 6);
    ctx.lineTo(COURSE_W / 2, y + 20);
    ctx.lineTo(COURSE_W / 2 - 22, y + 6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 구간 번호 — 판이 길어도 어디쯤인지 읽히게
  ctx.save();
  ctx.fillStyle = 'oklch(0.85 0.03 285 / 0.18)';
  ctx.font = '700 22px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [label, y] of [
    ['1', 150], ['2', 262], ['3', 370], ['4', 560], ['5', 710], ['6', 830], ['7', 932],
    ['8', 1075], ['9', 1222], ['10', 1310], ['11', 1458], ['12', 1562],
  ] as const) {
    ctx.fillText(label, COURSE_W / 2, y);
  }
  ctx.restore();

  // 바깥 테두리 레일
  ctx.save();
  ctx.strokeStyle = 'oklch(0.7 0.02 260)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(1.5, 0);
  ctx.lineTo(1.5, FUNNEL_Y);
  ctx.moveTo(COURSE_W - 1.5, 0);
  ctx.lineTo(COURSE_W - 1.5, FUNNEL_Y);
  ctx.stroke();
  ctx.restore();

  // 배수구 — 결승선 아래
  ctx.save();
  ctx.fillStyle = 'oklch(0.12 0.02 280)';
  ctx.fillRect(0, FINISH_Y, COURSE_W, BOARD_H - FINISH_Y);
  ctx.strokeStyle = 'oklch(0.75 0.17 145)';
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, FINISH_Y);
  ctx.lineTo(COURSE_W, FINISH_Y);
  ctx.stroke();
  ctx.restore();
}

function drawWall(ctx: CanvasRenderingContext2D, w: Wall, frame: { x: number; y: number }[] | null) {
  ctx.save();
  ctx.lineCap = 'round';
  if (w.kind === 'sling') {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len = Math.hypot(dx, dy) || 1;
    const hit =
      frame?.some((m) => {
        const t = clamp(((m.x - w.x1) * dx + (m.y - w.y1) * dy) / (len * len), 0, 1);
        return Math.hypot(m.x - (w.x1 + t * dx), m.y - (w.y1 + t * dy)) <= MARBLE_R + 5;
      }) ?? false;
    ctx.strokeStyle = hit ? '#ffffff' : 'oklch(0.72 0.2 25)';
    ctx.shadowColor = hit ? '#ffffff' : 'oklch(0.72 0.2 25)';
    ctx.shadowBlur = hit ? 16 : 6;
    ctx.lineWidth = 5;
  } else if (w.kind === 'post') {
    ctx.strokeStyle = 'oklch(0.82 0.13 195)';
    ctx.shadowColor = 'oklch(0.82 0.13 195)';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 4;
  } else {
    // 금속 레일 — 그림자, 몸통, 하이라이트
    ctx.strokeStyle = 'oklch(0.1 0.02 280 / 0.6)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(w.x1 + SHADOW_DX, w.y1 + SHADOW_DY);
    ctx.lineTo(w.x2 + SHADOW_DX, w.y2 + SHADOW_DY);
    ctx.stroke();
    ctx.strokeStyle = 'oklch(0.72 0.02 260)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
    ctx.stroke();
    ctx.strokeStyle = 'oklch(0.95 0.01 260)';
    ctx.lineWidth = 1.5;
  }
  ctx.beginPath();
  ctx.moveTo(w.x1, w.y1);
  ctx.lineTo(w.x2, w.y2);
  ctx.stroke();
  ctx.restore();
}

function drawSpinner(ctx: CanvasRenderingContext2D, seg: { x1: number; y1: number; x2: number; y2: number }, cx: number, cy: number) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'oklch(0.1 0.02 280 / 0.55)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(seg.x1 + SHADOW_DX, seg.y1 + SHADOW_DY);
  ctx.lineTo(seg.x2 + SHADOW_DX, seg.y2 + SHADOW_DY);
  ctx.stroke();
  ctx.strokeStyle = 'oklch(0.85 0.17 90)';
  ctx.shadowColor = 'oklch(0.85 0.17 90)';
  ctx.shadowBlur = 10;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(seg.x1, seg.y1);
  ctx.lineTo(seg.x2, seg.y2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'oklch(0.3 0.05 90)';
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBumper(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hit: boolean) {
  ctx.save();
  ctx.fillStyle = 'oklch(0.08 0.02 280 / 0.55)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX, y + SHADOW_DY, r + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = hit ? '#ffffff' : 'oklch(0.7 0.25 350)';
  ctx.shadowBlur = hit ? 22 : 8;
  ctx.fillStyle = hit ? '#ffffff' : 'oklch(0.62 0.24 350)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  const cap = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r * 0.75);
  cap.addColorStop(0, hit ? '#ffffff' : 'oklch(0.97 0.03 90)');
  cap.addColorStop(1, hit ? 'oklch(0.9 0.1 90)' : 'oklch(0.75 0.15 80)');
  ctx.fillStyle = cap;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPost(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hit: boolean) {
  ctx.save();
  ctx.fillStyle = 'oklch(0.08 0.02 280 / 0.5)';
  ctx.beginPath();
  ctx.arc(x + SHADOW_DX * 0.7, y + SHADOW_DY * 0.7, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = hit ? '#ffffff' : 'oklch(0.82 0.15 195)';
  ctx.shadowBlur = hit ? 16 : 5;
  ctx.fillStyle = hit ? '#ffffff' : 'oklch(0.82 0.13 195)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

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
  race: RaceResult;
  timing: Timing;
}

export function Pinball({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const viewH = expanded ? VIEW_H_BIG : VIEW_H;
  const count = candidates.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** 이 판에서 찾은 경기. 판 번호와 같이 들고 있어 지난 판 경기가 새 판에 비치지 않는다. */
  const [play, setPlay] = useState<Play | null>(null);
  /** 재생 진행도(0~1). -1 이면 아직 게이트에 서 있다. */
  const [progress, setProgress] = useState<{ run: number; t: number }>({ run: -1, t: -1 });
  /** 게이트에서 기다린 시간. 구슬이 들썩이는 데 쓴다. */
  const [gateMs, setGateMs] = useState(0);
  /** 사용자가 고른 구슬. 카메라가 이 구슬을 따라간다. null 이면 선두. 판이 바뀌어도 유지한다. */
  const [followPick, setFollow] = useState<number | null>(null);
  const follow = followPick !== null && followPick < count ? followPick : null;
  // 그리기가 남긴 값. 클릭이 어느 구슬을 눌렀는지 계산하는 데 쓴다.
  const drawnRef = useRef<{ cam: number; positions: { x: number; y: number }[] }>({ cam: 0, positions: [] });
  const camRef = useRef<{ run: number; y: number } | null>(null);

  // 판 하나: 게이트 → 경기 만들기 → 재생 → 끝.
  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
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
      setPlay(found);
      if (reduced) {
        setProgress({ run, t: 1 });
        onSpinEnd();
        return;
      }
      const started = performance.now();
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

    // 당첨 구슬이 1등 하는 경기 하나(raceForWinner). 경기 한 번이라 바로 끝난다.
    const prepare = () => {
      if (cancelled) return;
      const race = raceForWinner(count, winnerIndex, seed);
      if (!race) {
        cancelAnimationFrame(raf);
        onSpinEnd();
        return;
      }
      const found = { run, race, timing: timingFor(race.frames.length, race.winnerFrame) };
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
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  const current = play && play.run === run ? play : null;
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
    if (!race || frameIndex < 0) return candidates.map((_, i) => i);
    return race.standings[frameIndex] ?? race.order;
  }, [race, frameIndex, candidates]);

  const arrived = useMemo(() => {
    if (!race || frameIndex < 0) return 0;
    return race.frames[frameIndex].filter((m) => m.y >= FINISH_Y).length;
  }, [race, frameIndex]);

  /** 따라가는 구슬이 들어왔으면 몇 등인지. 응원한 구슬의 결과를 알려 준다. */
  const followRank = useMemo(() => {
    if (!race || frameIndex < 0 || follow === null) return null;
    const m = race.frames[frameIndex][follow];
    if (!m || m.y < FINISH_Y) return null;
    return race.order.indexOf(follow) + 1;
  }, [race, frameIndex, follow]);

  /** 1등이 이미 들어왔는가. 순위판 1위를 그때부터 강조한다. */
  const leadIn = race !== null && frameIndex >= race.winnerFrame;

  // 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 동작 줄이기면 맥박·깜빡임 없이 고정값으로 그린다.
    const reducedNow = prefersReducedMotion();
    // 크게 보기면 캔버스가 화면에서 두 배 넘게 늘어난다. 그만큼 해상도를 올려야 흐리지 않다.
    const shown = canvas.clientWidth || CANVAS_W;
    const dpr = Math.min((window.devicePixelRatio || 1) * Math.max(1, shown / CANVAS_W), 4);
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

    // 게이트에서는 구슬이 제자리에서 들썩인다.
    const resting = candidates.map((_, i) => {
      const spot = restingSpot(i, count);
      if (!atGate) return spot;
      const wob = Math.sin(gateMs / 70 + i * 1.7) * 1.6;
      return { x: spot.x + wob, y: spot.y + Math.abs(wob) * 0.5 };
    });
    const positions = frame ?? resting;
    // 목표 위치로 부드럽게 옮겨 간다. 새 판의 첫 프레임은 바로 맞춘다.
    const target = frame ? cameraY(race, framePos, viewH, follow) : 0;
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

    drawTable(ctx);
    for (const w of COURSE.walls) drawWall(ctx, w, frame);
    for (const sp of COURSE.spinners) drawSpinner(ctx, spinnerEnds(sp, step), sp.x, sp.y);
    for (const peg of COURSE.pegs) {
      const hit = touching(peg.x, peg.y, peg.r);
      if (peg.bumper) drawBumper(ctx, peg.x, peg.y, peg.r, hit);
      else drawPost(ctx, peg.x, peg.y, peg.r, hit);
    }

    // 출발 게이트 — 경기가 준비되기 전까지 닫혀 있다
    if (!frame) {
      ctx.save();
      ctx.strokeStyle = atGate ? 'oklch(0.75 0.2 30)' : 'oklch(0.6 0.02 260)';
      ctx.shadowColor = 'oklch(0.75 0.2 30)';
      ctx.shadowBlur = atGate ? 10 : 0;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(4, 30);
      ctx.lineTo(COURSE_W - 4, 30);
      ctx.stroke();
      ctx.restore();
    }

    // 구슬 잔상. 속도감이 여기서 나온다 — 빠른 구슬은 꼬리가 길다.
    if (frame) {
      for (let k = TRAIL; k >= 1; k -= 1) {
        const past = at(framePos - k * TRAIL_STEP * (slowMo ? SLOW_RATE : 1));
        if (!past) continue;
        past.forEach((m, i) => {
          if (m.y >= FINISH_Y) return;
          ctx.beginPath();
          ctx.arc(m.x, m.y, MARBLE_R * (1 - k / (TRAIL + 2)), 0, Math.PI * 2);
          const dim = follow !== null && i !== follow ? FOLLOW_DIM : 1;
          ctx.fillStyle = `oklch(0.78 0.19 ${marbleHue(i)} / ${0.28 * dim * (1 - k / (TRAIL + 1))})`;
          ctx.fill();
        });
      }
    }

    /*
     * 따라가는 구슬이 있으면 나머지는 흐리게 깔고 그 구슬만 또렷하게 맨 위에.
     * 점선 고리 하나로는 구슬 여럿 사이에서 잘 안 보였다(10/9 사용자).
     */
    const followed = follow !== null && positions[follow] && !(frame && positions[follow].y >= FINISH_Y);
    const dimOthers = followed ? FOLLOW_DIM : 1;
    positions.forEach((m, i) => {
      if (followed && i === follow) return;
      ctx.save();
      ctx.globalAlpha = dimOthers;
      drawMarble(ctx, m.x, m.y, i);
      ctx.restore();
    });
    if (followed && follow !== null) {
      const m = positions[follow];
      const pulse = reducedNow ? 0.5 : 0.5 + 0.5 * Math.sin(performance.now() / 180);
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
      const w = ctx.measureText(label).width + 12;
      const tx = clamp(m.x, w / 2 + 2, COURSE_W - w / 2 - 2);
      ctx.fillStyle = marbleColor(follow);
      ctx.beginPath();
      pillPath(ctx, tx - w / 2, tagY - 15, w, 16);
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
    positions.forEach((m, i) => {
      const place = candidates[i];
      if (!place) return;
      if (frame && m.y >= FINISH_Y) return;
      if (followed && i === follow) return;
      ctx.save();
      ctx.globalAlpha = dimOthers;
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'oklch(0.14 0.03 280 / 0.85)';
      ctx.strokeText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
      ctx.fillStyle = marbleColor(i);
      ctx.fillText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
      ctx.restore();
    });
    ctx.restore();

    // 화면 위 따라가기 배지 — 지금 몇 등인지 실시간으로.
    if (follow !== null && candidates[follow]) {
      const rank = standing.indexOf(follow) + 1;
      const done = frame !== null && positions[follow] && positions[follow].y >= FINISH_Y;
      const text = `📍 ${shortName(candidates[follow].name, 8)} ${frame ? (done ? `${rank}등 도착` : `${rank}등`) : '응원 중'}`;
      ctx.save();
      ctx.font = '800 12px system-ui, sans-serif';
      const w = ctx.measureText(text).width + 16;
      ctx.fillStyle = 'oklch(0.14 0.03 280 / 0.85)';
      ctx.strokeStyle = marbleColor(follow);
      ctx.lineWidth = 2;
      ctx.beginPath();
      pillPath(ctx, 6, viewH - 30, w, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = marbleColor(follow);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 14, viewH - 19);
      ctx.restore();
    } else if (!frame && count > 1) {
      // 고를 수 있다는 걸 알려 준다. 게이트 앞에서만.
      ctx.save();
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `oklch(0.92 0.05 285 / ${reducedNow ? 0.9 : 0.65 + 0.35 * Math.sin(performance.now() / 300)})`;
      ctx.fillText('👆 공을 눌러 내 공을 골라 보세요', COURSE_W / 2, 52);
      ctx.restore();
    }

    // 막판 슬로모션 — 붉은 테두리가 맥박 치고 "결승 직전"
    if (slowMo) {
      const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 120);
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
    ctx.fillStyle = 'oklch(0.13 0.02 280)';
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
    ctx.fillStyle = 'oklch(0.22 0.05 285)';
    ctx.fillRect(mapX, mapTop, mapW, mapH);
    ctx.fillStyle = 'oklch(0.4 0.12 25 / 0.6)';
    ctx.fillRect(mapX, mapTop + FUNNEL_Y * sy, mapW, (FINISH_Y - FUNNEL_Y) * sy);
    ctx.strokeStyle = 'oklch(0.85 0.02 260 / 0.8)';
    ctx.strokeRect(mapX - 0.5, mapTop + cam * sy, mapW + 1, viewH * sy);
    positions.forEach((m, i) => {
      ctx.fillStyle = marbleColor(i);
      ctx.fillRect(mapX + m.x * sx - 1, mapTop + m.y * sy - 1, 2.5, 2.5);
    });
    if (follow !== null && positions[follow]) {
      const m = positions[follow];
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
    ctx.fillText(atGate ? '출발 준비' : `${arrived} / ${count}`, CANVAS_W - 6, 14);

    standing.forEach((marble, rank) => {
      const place = candidates[marble];
      if (!place) return;
      const y = 34 + rank * 15;
      if (y > viewH - 8) return;
      const champion = leadIn && rank === 0;
      ctx.save();
      if (marble === follow) {
        ctx.fillStyle = `oklch(0.78 0.19 ${marbleHue(marble)} / 0.22)`;
        ctx.fillRect(COURSE_W + 24, y - 7, PANEL_W - 26, 14);
      }
      if (champion || (slowMo && rank < 2)) {
        ctx.shadowColor = marbleGlow(marble);
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = marbleColor(marble);
      ctx.font = `${rank === 0 ? '700' : '500'} 10px system-ui, sans-serif`;
      const mark = marble === follow ? '◉ ' : '';
      ctx.fillText(`${mark}${shortName(place.name)} ${champion ? '✓' : `#${rank + 1}`}`, CANVAS_W - 6, y);
      ctx.restore();
    });
  }, [race, framePos, standing, arrived, leadIn, slowMo, atGate, gateMs, candidates, count, viewH, follow, run, t]);

  /*
   * 공을 누르면 그 공을 따라간다. 같은 공을 다시 누르면 선두로 돌아간다.
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
    setFollow(hit === follow ? null : hit);
  };

  if (count === 0) return <div className="pinball pinball--empty" />;

  return (
    <div className={expanded ? 'pinball pinball--big' : 'pinball'}>
      <canvas
        ref={canvasRef}
        style={{ aspectRatio: `${CANVAS_W} / ${viewH}` }}
        role="img"
        aria-label={
          follow === null
            ? `구슬 ${count}개 핀볼`
            : `구슬 ${count}개 핀볼, ${candidates[follow].name} 구슬을 따라가는 중`
        }
        onClick={onCanvasClick}
      />
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
        ) : (
          <span className="pinball__tip" aria-hidden="true">
            공을 누르면 그 공을 따라가요
          </span>
        )}
      </label>
    </div>
  );
}
