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

/**
 * 재생은 2단이다.
 *
 * 1등이 결승선을 넘는 데까지가 LEAD_MS, 나머지가 다 들어오는 데까지가 TAIL_MS.
 * 한동안 1등이 들어오는 순간에 끊었는데, 그러면 순위판이 "1 / 5" 에서 멈추고
 * 나머지 구슬은 코스 한복판에 굳은 채로 끝난다. 경기가 안 끝난 것으로 보인다.
 *
 * 그렇다고 같은 속도로 끝까지 가면 후보 12곳에서 전체가 1등 도착의 3.3배다
 * (실측: 1등 57프레임 / 전원 완주 189프레임). 뒤는 빠르게 정리한다.
 */
const LEAD_MS = 4000;
const TAIL_MS = 1500;
const PLAY_MS = LEAD_MS + TAIL_MS;

/** 시드 탐색 한 번에 훑을 개수. 실측으로 무작위 시작 200회 중 실패 0회. */
const MAX_SEEDS = 600;

const randomStart = () => 1 + Math.floor(Math.random() * 100_000);

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

  // 판 번호. winnerIndex 만으로는 부족하다 — 같은 곳이 연달아 당첨되면
  // 값이 안 바뀌어 경기가 그대로 남는다.
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (spinning) setRun((r) => r + 1);
  }, [spinning]);

  // 돌릴 때마다 당첨 구슬이 이기는 경기를 찾는다.
  const race: RaceResult | null = useMemo(() => {
    if (winnerIndex === null || count === 0) return null;
    // 시작 시드를 판마다 흔든다. 기본값(1)으로 두면 seedForWinner 가 같은
    // (후보 수, 당첨) 에 늘 같은 시드를 돌려준다 — 후보 5곳이면 시드가
    // 항상 2, 1, 5, 4, 3 이라 평생 경기 5가지만 보게 된다.
    const seed = seedForWinner(count, winnerIndex, MAX_SEEDS, randomStart());
    if (seed === null) return null;
    return simulateRace(count, seed);
  }, [count, winnerIndex, run]);

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

  /**
   * 지금 그릴 프레임 번호.
   *
   * 경과 시간이 LEAD_MS 를 넘기 전까지는 1등이 들어오는 프레임까지를 훑고,
   * 그 뒤로는 남은 구슬이 다 들어올 때까지를 빠르게 훑는다.
   */
  const frameIndex = useMemo(() => {
    if (!race) return -1;
    const lead = Math.max(1, race.winnerFrame);
    const end = race.frames.length - 1;
    const split = LEAD_MS / PLAY_MS;

    if (progress <= split) {
      return Math.min(end, Math.floor((progress / split) * lead));
    }
    const after = (progress - split) / (1 - split);
    return Math.min(end, Math.floor(lead + after * (end - lead)));
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
      // 들어온 구슬은 결승선에 뭉쳐서 이름표가 서로 덮인다. 순위판이 이미
      // 이름을 들고 있으니 코스 위에서는 뗀다.
      if (frame && m.y >= FINISH_Y) return;
      ctx.fillStyle = marbleColor(i);
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(shortName(place.name), m.x, m.y + MARBLE_R + 2);
    });
  }, [race, frameIndex, standing, arrived, leadIn, candidates, count]);

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
