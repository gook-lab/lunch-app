/**
 * 구슬 레이스.
 *
 * 당첨은 이미 정해져 있고(winnerIndex), 여기서는 그 구슬이 1등으로 들어오는
 * 시드를 찾아 그 경기를 재생한다. 물리는 조작하지 않는다 — lib/race.ts 참고.
 *
 * 구슬에는 번호만 붙이고 이름은 아래 범례에 둔다. 320px 폭에 "샘플 분식집 1"
 * 같은 이름을 구슬마다 얹으면 글자가 겹쳐 아무것도 못 읽는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BOARD_H,
  BOARD_W,
  FINISH_Y,
  buildPegs,
  seedForWinner,
  simulateRace,
  type RaceResult,
} from '../../lib/race';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const MARBLE_R = 8;
const PEG_R = 3;
const PEGS = buildPegs();

/** 구슬 색. 토큰이 아니라 구분용 팔레트라 여기서만 쓴다. */
const COLORS = ['#ec3013', '#1b6ef3', '#17a34a', '#c026d3', '#ea8a0b', '#0891b2', '#7c3aed', '#be123c'];

export function Race({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const reduced = prefersReducedMotion();
    setFinished(false);

    if (reduced) {
      setProgress(1);
      setFinished(true);
      onSpinEnd();
      return;
    }

    setProgress(0);
    const started = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / SPIN_MS.race);
      setProgress(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    const timer = window.setTimeout(() => {
      setProgress(1);
      setFinished(true);
      onSpinEnd();
    }, SPIN_MS.race);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [spinning, race, onSpinEnd]);

  // 그리기
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = BOARD_W * dpr;
    canvas.height = BOARD_H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const style = getComputedStyle(canvas);
    const pegColor = style.getPropertyValue('--race-peg').trim() || '#bbb';
    const lineColor = style.getPropertyValue('--race-line').trim() || '#888';
    const textColor = style.getPropertyValue('--race-text').trim() || '#fff';

    ctx.clearRect(0, 0, BOARD_W, BOARD_H);

    // 결승선
    ctx.strokeStyle = lineColor;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, FINISH_Y);
    ctx.lineTo(BOARD_W, FINISH_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 핀
    ctx.fillStyle = pegColor;
    for (const peg of PEGS) {
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, PEG_R, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!race) return;

    // 당첨 구슬이 들어오는 프레임에서 재생을 끝낸다. 나머지 구슬은
    // 아직 판 위에 있는 게 맞다 — 1등이 정해지는 순간이 이 연출의 전부다.
    const last = Math.max(1, race.winnerFrame);
    const index = Math.min(race.frames.length - 1, Math.floor(progress * last));
    const frame = race.frames[index];
    if (!frame) return;

    frame.forEach((m, i) => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, MARBLE_R, 0, Math.PI * 2);
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();

      ctx.fillStyle = textColor;
      ctx.font = '600 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), m.x, m.y + 0.5);
    });
  }, [race, progress]);

  if (count === 0) return <div className="race race--empty" />;

  // 1등만 표시한다. 나머지는 재생이 끝난 시점에 아직 달리는 중이라
  // 순위를 적으면 화면에 보이는 것과 어긋난다.
  const champion = finished ? race?.winner ?? null : null;

  return (
    <div className="race">
      <canvas
        ref={canvasRef}
        style={{ width: BOARD_W, height: BOARD_H }}
        role="img"
        aria-label={`구슬 ${count}개 레이스`}
      />
      <ol className="race__legend">
        {candidates.map((place, i) => (
          <li key={place.id} className={champion === i ? 'race__legend--win' : undefined}>
            <span className="race__dot" style={{ background: COLORS[i % COLORS.length] }}>
              {i + 1}
            </span>
            <span className="race__name">{place.name}</span>
            {champion === i && <span className="race__rank">1등</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}
