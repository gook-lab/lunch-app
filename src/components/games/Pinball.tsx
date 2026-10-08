/**
 * 핀볼 — 이름 붙은 구슬들이 코스를 굴러 내려가고, 오른쪽에서 순위가 실시간으로 바뀐다.
 *
 * 당첨은 이미 정해져 있고(winnerIndex), 여기서는 그 구슬이 1등으로 들어오는
 * 시드를 찾아 그 경기를 재생한다. 물리는 조작하지 않는다 — lib/pinball.ts 참고.
 *
 * 캔버스로 그린다. 구슬·핀·벽이 매 프레임 움직이는데 이걸 DOM 으로 하면
 * 노드가 수십 개씩 갱신된다.
 */
import { shortName } from '../../lib/name';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_H,
  COURSE_W,
  FINISH_Y,
  buildCourse,
  seedForWinner,
  simulateRace,
  type RaceResult,
} from '../../lib/pinball';
import { prefersReducedMotion, type GameProps } from './types';

/** 캔버스 = 코스 + 오른쪽 순위판. */
const PANEL_W = 112;
const CANVAS_W = COURSE_W + PANEL_W;
const MARBLE_R = 7;
const COURSE = buildCourse();

/**
 * 재생은 2단이다.
 *
 * 1등이 결승선을 넘는 데까지가 lead, 나머지가 다 들어오는 데까지가 tail.
 * 1등이 들어오는 순간에 끊으면 순위판이 "1 / 5" 에서 멈추고 나머지 구슬이
 * 코스 한복판에 굳어 경기가 안 끝난 것으로 보인다.
 *
 * lead 는 실시간(60fps 한 프레임 = 시뮬레이션 한 스텝)에 맞춘다. 예전에는
 * lead 를 4초로 고정해 0.9초짜리 경기를 0.22배 슬로모션으로 틀었고, 출발
 * 직후 0.7초 동안 구슬이 제자리에 떠 있는 것처럼 보였다. 경기가 아주 짧거나
 * 길면 범위 안으로 당긴다. tail 은 뒤 정리라 빠르게 감는다.
 */
const FRAME_MS = 1000 / 60;
const LEAD_MIN_MS = 2200;
const LEAD_MAX_MS = 4200;
const TAIL_MIN_MS = 700;
const TAIL_MAX_MS = 1600;
/** 잔상으로 그릴 지난 프레임 수와 간격. */
const TRAIL = 5;
const TRAIL_STEP = 2;

interface Timing {
  leadMs: number;
  playMs: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function timingFor(race: RaceResult): Timing {
  const lead = Math.max(1, race.winnerFrame);
  const rest = Math.max(0, race.frames.length - 1 - lead);
  const leadMs = clamp(lead * FRAME_MS, LEAD_MIN_MS, LEAD_MAX_MS);
  const tailMs = clamp(rest * FRAME_MS * 0.35, TAIL_MIN_MS, TAIL_MAX_MS);
  return { leadMs, playMs: leadMs + tailMs };
}

/** 시드 탐색 한 번에 훑을 개수. 실측으로 무작위 시작 200회 중 실패 0회. */
const MAX_SEEDS = 600;

/** 판 번호를 seedForWinner 의 시작 시드(1 이상)로 접는다. */
const startSeedFor = (run: number) => 1 + (Math.abs(Math.floor(run)) % 100_000);

/** 구슬 색. 토큰이 아니라 구분용 팔레트라 여기서만 쓴다. 네온이라 밝게 잡는다. */
function marbleHue(i: number): number {
  // 황금각으로 돌려서 이웃끼리 색이 겹치지 않게 한다.
  return (i * 137.508) % 360;
}
const marbleColor = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)})`;
const marbleGlow = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)} / 0.45)`;

export function Pinball({ candidates, winnerIndex, spinning, run, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timerRef = useRef(0);
  const [progress, setProgress] = useState(0);

  // 돌릴 때마다 당첨 구슬이 이기는 경기를 찾는다.
  const race: RaceResult | null = useMemo(() => {
    if (winnerIndex === null || count === 0) return null;
    // 시작 시드를 판마다 흔든다. 기본값(1)으로 두면 seedForWinner 가 같은
    // (후보 수, 당첨) 에 늘 같은 시드를 돌려준다 — 후보 5곳이면 시드가
    // 항상 2, 1, 5, 4, 3 이라 평생 경기 5가지만 보게 된다. run 은 App 이
    // 판마다 난수를 섞어 만든 번호라 그대로 시작점으로 쓴다.
    const seed = seedForWinner(count, winnerIndex, MAX_SEEDS, startSeedFor(run));
    if (seed === null) return null;
    return simulateRace(count, seed);
  }, [count, winnerIndex, run]);

  const timing = useMemo(() => (race ? timingFor(race) : null), [race]);

  useEffect(() => {
    if (!spinning || !race || !timing) return;

    if (prefersReducedMotion()) {
      setProgress(1);
      onSpinEnd();
      return;
    }

    setProgress(0);
    const started = performance.now();

    const tick = (now: number) => {
      // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다. 음수 진행도를
      // 흘리면 인덱스가 -1 이 된다.
      const t = Math.min(1, Math.max(0, (now - started) / timing.playMs));
      setProgress(t);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    timerRef.current = window.setTimeout(() => {
      setProgress(1);
      onSpinEnd();
    }, timing.playMs);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(timerRef.current);
    };
  }, [spinning, race, timing, onSpinEnd]);

  /**
   * 지금 그릴 프레임 위치(소수). 정수부가 프레임 번호이고, 소수부로 다음
   * 프레임과 섞어 그린다 — 재생 속도와 시뮬레이션 스텝이 딱 맞지 않아도
   * 구슬이 뚝뚝 끊기지 않는다.
   *
   * lead 동안은 1등이 들어오는 프레임까지, 그 뒤로는 끝까지를 훑는다.
   */
  const framePos = useMemo(() => {
    if (!race || !timing) return -1;
    const lead = Math.max(1, race.winnerFrame);
    const end = race.frames.length - 1;
    const split = timing.leadMs / timing.playMs;

    if (progress <= split) return Math.min(end, (progress / split) * lead);
    const after = (progress - split) / (1 - split);
    return Math.min(end, lead + after * (end - lead));
  }, [race, timing, progress]);

  const frameIndex = framePos < 0 ? -1 : Math.floor(framePos);

  /** 순위판이 읽는 값. 아직 안 돌렸으면 후보 순서 그대로. */
  const standing = useMemo(() => {
    if (!race || frameIndex < 0) return candidates.map((_, i) => i);
    return race.standings[frameIndex] ?? race.order;
  }, [race, frameIndex, candidates]);

  const arrived = useMemo(() => {
    if (!race || frameIndex < 0) return 0;
    return race.frames[frameIndex].filter((m) => m.y >= FINISH_Y).length;
  }, [race, frameIndex]);

  /** 1등이 이미 들어왔는가. 순위판 1위를 그때부터 강조한다. */
  const leadIn = race !== null && frameIndex >= race.winnerFrame;

  // 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = CANVAS_W * dpr;
    canvas.height = BOARD_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#08070c';
    ctx.fillRect(0, 0, CANVAS_W, BOARD_H);

    // 코스와 순위판 경계
    ctx.strokeStyle = 'oklch(0.45 0.02 260)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(COURSE_W + 0.5, 0);
    ctx.lineTo(COURSE_W + 0.5, BOARD_H);
    ctx.stroke();

    // 지그재그 벽 — 흰 네온
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.shadowColor = 'oklch(0.9 0.12 200)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (const w of COURSE.walls) {
      ctx.beginPath();
      ctx.moveTo(w.x1, w.y1);
      ctx.lineTo(w.x2, w.y2);
      ctx.stroke();
    }
    ctx.restore();

    // 지금 프레임의 구슬 위치. 소수 프레임은 앞뒤를 섞는다.
    const at = (pos: number) => {
      if (!race || pos < 0) return null;
      const end = race.frames.length - 1;
      const p = Math.min(end, Math.max(0, pos));
      const a = race.frames[Math.floor(p)];
      const b = race.frames[Math.min(end, Math.floor(p) + 1)];
      const f = p - Math.floor(p);
      return a.map((m, i) => ({ x: m.x + (b[i].x - m.x) * f, y: m.y + (b[i].y - m.y) * f }));
    };
    const frame = at(framePos);

    // 핀 — 청록 네온. 구슬이 닿아 있는 핀은 하얗게 번쩍인다.
    for (const peg of COURSE.pegs) {
      const hit =
        frame?.some((m) => Math.hypot(m.x - peg.x, m.y - peg.y) <= MARBLE_R + peg.r + 2) ?? false;
      const color = peg.bumper ? 'oklch(0.72 0.24 350)' : 'oklch(0.82 0.15 195)';
      ctx.save();
      ctx.shadowColor = hit ? '#ffffff' : color;
      ctx.shadowBlur = hit ? 18 : 8;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      if (peg.bumper) {
        // 범퍼는 고리 + 속심. 일반 핀과 한눈에 갈려야 "저기 맞으면 튄다" 가 읽힌다.
        ctx.fillStyle = hit ? '#ffffff' : 'oklch(0.3 0.1 350)';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = hit ? '#ffffff' : color;
        ctx.stroke();
      } else {
        ctx.fillStyle = hit ? '#ffffff' : color;
        ctx.fill();
      }
      ctx.restore();
    }

    // 결승선
    ctx.strokeStyle = 'oklch(0.7 0.18 145)';
    ctx.setLineDash([5, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, FINISH_Y);
    ctx.lineTo(COURSE_W, FINISH_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 순위판
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'oklch(0.6 0.02 260)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.fillText(`${arrived} / ${count}`, CANVAS_W - 8, 14);

    standing.forEach((marble, rank) => {
      const place = candidates[marble];
      if (!place) return;
      const y = 34 + rank * 15;
      if (y > BOARD_H - 8) return;
      const champion = leadIn && rank === 0;
      ctx.save();
      if (champion) {
        ctx.shadowColor = marbleGlow(marble);
        ctx.shadowBlur = 8;
      }
      ctx.fillStyle = marbleColor(marble);
      ctx.font = `${rank === 0 ? '700' : '500'} 10px system-ui, sans-serif`;
      ctx.fillText(
        `${shortName(place.name)} ${champion ? '\u2713' : `#${rank + 1}`}`,
        CANVAS_W - 8,
        y,
      );
      ctx.restore();
    });

    // 구슬 잔상. 속도감이 여기서 나온다 — 빠른 구슬은 꼬리가 길다.
    if (frame) {
      for (let k = TRAIL; k >= 1; k -= 1) {
        const past = at(framePos - k * TRAIL_STEP);
        if (!past) continue;
        past.forEach((m, i) => {
          if (m.y >= FINISH_Y) return;
          ctx.beginPath();
          ctx.arc(m.x, m.y, MARBLE_R * (1 - k / (TRAIL + 2)), 0, Math.PI * 2);
          ctx.fillStyle = `oklch(0.78 0.19 ${marbleHue(i)} / ${0.28 * (1 - k / (TRAIL + 1))})`;
          ctx.fill();
        });
      }
    }

    // 구슬
    const resting = candidates.map((_, i) => ({
      x: (COURSE_W / (count + 1)) * (i + 1),
      y: 16,
    }));
    const positions = frame ?? resting;

    positions.forEach((m, i) => {
      ctx.save();
      ctx.shadowColor = marbleGlow(i);
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(m.x, m.y, MARBLE_R, 0, Math.PI * 2);
      ctx.fillStyle = marbleColor(i);
      ctx.fill();
      ctx.restore();

      const place = candidates[i];
      if (!place) return;
      // 들어온 구슬은 결승선에 뭉쳐서 이름표가 서로 덮인다. 순위판이 이미
      // 이름을 들고 있으니 코스 위에서는 뗀다.
      if (frame && m.y >= FINISH_Y) return;
      ctx.fillStyle = marbleColor(i);
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
    });
  }, [race, framePos, standing, arrived, leadIn, candidates, count]);

  if (count === 0) return <div className="pinball pinball--empty" />;

  return (
    <div className="pinball">
      <canvas
        ref={canvasRef}
        style={{ width: CANVAS_W, height: BOARD_H }}
        role="img"
        aria-label={`구슬 ${count}개 핀볼`}
      />
    </div>
  );
}
