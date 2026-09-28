/**
 * 핀볼 — 이름 붙은 구슬들이 코스를 굴러 내려가고, 오른쪽에서 순위가 실시간으로 바뀐다.
 *
 * 당첨은 이미 정해져 있고(winnerIndex), 여기서는 그 구슬이 1등으로 들어오는
 * 시드를 찾아 그 경기를 재생한다. 물리는 조작하지 않는다 — lib/pinball.ts 참고.
 *
 * 캔버스로 그린다. 구슬·핀·벽이 매 프레임 움직이는데 이걸 DOM 으로 하면
 * 노드가 수십 개씩 갱신된다.
 */
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

/** 한 구간에 200ms 씩. 후보가 많으면 길어지는 게 아니라 코스 길이가 정한다. */
const PLAY_MS = 4200;

/** 구슬 색. 토큰이 아니라 구분용 팔레트라 여기서만 쓴다. 네온이라 밝게 잡는다. */
function marbleHue(i: number): number {
  // 황금각으로 돌려서 이웃끼리 색이 겹치지 않게 한다.
  return (i * 137.508) % 360;
}
const marbleColor = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)})`;
const marbleGlow = (i: number) => `oklch(0.78 0.19 ${marbleHue(i)} / 0.45)`;

/** "샘플 고기집 1" 처럼 긴 이름은 코스 위에서 겹친다. 접두를 떼고 줄인다. */
function shortName(name: string): string {
  const trimmed = name.replace(/^샘플\s+/, '');
  return trimmed.length > 6 ? `${trimmed.slice(0, 5)}…` : trimmed;
}

export function Pinball({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const timerRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [finished, setFinished] = useState(false);

  // 돌릴 때마다 당첨 구슬이 이기는 경기를 찾는다.
  const race: RaceResult | null = useMemo(() => {
    if (winnerIndex === null || count === 0) return null;
    const seed = seedForWinner(count, winnerIndex);
    if (seed === null) return null;
    return simulateRace(count, seed);
  }, [count, winnerIndex]);

  useEffect(() => {
    if (!spinning || !race) return;
    setFinished(false);

    if (prefersReducedMotion()) {
      setProgress(1);
      setFinished(true);
      onSpinEnd();
      return;
    }

    setProgress(0);
    const started = performance.now();

    const tick = (now: number) => {
      // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다. 음수 진행도를
      // 흘리면 인덱스가 -1 이 된다.
      const t = Math.min(1, Math.max(0, (now - started) / PLAY_MS));
      setProgress(t);
      if (t < 1) frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    timerRef.current = window.setTimeout(() => {
      setProgress(1);
      setFinished(true);
      onSpinEnd();
    }, PLAY_MS);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.clearTimeout(timerRef.current);
    };
  }, [spinning, race, onSpinEnd]);

  /** 지금 그릴 프레임 번호. 당첨 구슬이 들어오는 순간에서 끝난다. */
  const frameIndex = useMemo(() => {
    if (!race) return -1;
    const last = Math.max(1, race.winnerFrame);
    return Math.min(race.frames.length - 1, Math.floor(progress * last));
  }, [race, progress]);

  /** 순위판이 읽는 값. 아직 안 돌렸으면 후보 순서 그대로. */
  const standing = useMemo(() => {
    if (!race || frameIndex < 0) return candidates.map((_, i) => i);
    return race.standings[frameIndex] ?? race.order;
  }, [race, frameIndex, candidates]);

  const arrived = useMemo(() => {
    if (!race || frameIndex < 0) return 0;
    return race.frames[frameIndex].filter((m) => m.y >= FINISH_Y).length;
  }, [race, frameIndex]);

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

    // 핀 — 청록 네온
    ctx.save();
    ctx.fillStyle = 'oklch(0.82 0.15 195)';
    ctx.shadowColor = 'oklch(0.82 0.15 195)';
    ctx.shadowBlur = 8;
    for (const peg of COURSE.pegs) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, peg.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

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
      ctx.fillStyle = marbleColor(marble);
      ctx.font = `${rank === 0 ? '700' : '500'} 10px system-ui, sans-serif`;
      ctx.fillText(`${shortName(place.name)} #${rank + 1}`, CANVAS_W - 8, y);
    });

    // 구슬
    const frame = race && frameIndex >= 0 ? race.frames[frameIndex] : null;
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
      ctx.fillStyle = marbleColor(i);
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
    });
  }, [race, frameIndex, standing, arrived, candidates, count]);

  if (count === 0) return <div className="pinball pinball--empty" />;

  const champion = finished ? (race?.winner ?? null) : null;

  return (
    <div className="pinball">
      <canvas
        ref={canvasRef}
        style={{ width: CANVAS_W, height: BOARD_H }}
        role="img"
        aria-label={`구슬 ${count}개 핀볼`}
      />
      <span className="pinball__sr" aria-live="polite">
        {champion !== null && candidates[champion] ? `${candidates[champion].name} 당첨` : ''}
      </span>
    </div>
  );
}
