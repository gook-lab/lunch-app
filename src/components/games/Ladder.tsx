/**
 * 사다리타기.
 *
 * 사다리가 결과를 정하지 않는다. 당첨 칸은 이미 정해져 있고, 여기서는
 * 그 칸에 도착하는 출발점을 역으로 찾아 그 경로를 그린다 (lib/ladder.ts).
 * 경로는 순열이라 목표로 가는 출발점은 항상 정확히 하나다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { buildLadder, ladderPath, startForTarget } from '../../lib/ladder';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const ROWS = 9;
const VIEW_W = 320;
const VIEW_H = 260;
const PAD_X = 18;
const PAD_Y = 26;

export function Ladder({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const [drawn, setDrawn] = useState(0);
  const pathRef = useRef<SVGPolylineElement>(null);

  // 판 번호. winnerIndex 만으로는 부족하다 — 같은 곳이 연달아 당첨되면
  // 값이 안 바뀌어 사다리가 그대로 남고, 방금 본 경로가 똑같이 한 번 더
  // 재생된다. "아까랑 똑같은데" 가 된다.
  const [run, setRun] = useState(0);
  useEffect(() => {
    if (spinning) setRun((r) => r + 1);
  }, [spinning]);

  const ladder = useMemo(
    () => buildLadder(Math.max(count, 1), ROWS),
    // 돌릴 때마다 새 사다리를 만든다. run 이 올라가는 순간이 그때다.
    // spinning 을 직접 넣으면 멈추는 순간(true -> false) 에도 다시 만들어져
    // 사용자가 보고 있던 경로와 최종 경로가 달라진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [count, run],
  );

  const start = winnerIndex === null ? null : startForTarget(ladder, winnerIndex);
  const path = start === null ? [] : ladderPath(ladder, start);

  const colX = (col: number) =>
    count <= 1 ? VIEW_W / 2 : PAD_X + (col * (VIEW_W - PAD_X * 2)) / (count - 1);
  const rowY = (row: number) => PAD_Y + (row * (VIEW_H - PAD_Y * 2)) / ROWS;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const reduced = prefersReducedMotion();
    setDrawn(reduced ? 1 : 0);

    const finish = () => {
      setDrawn(1);
      onSpinEnd();
    };
    const timer = window.setTimeout(finish, reduced ? 0 : SPIN_MS.ladder);
    if (reduced) return () => window.clearTimeout(timer);

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다. 음수 진행도를
      // 그대로 흘리면 인덱스가 -1 이 된다 (Pinball.tsx 에서 실제로 터졌다).
      const t = Math.min(1, Math.max(0, (now - started) / SPIN_MS.ladder));
      setDrawn(t);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [spinning, winnerIndex, count, onSpinEnd]);

  if (count === 0) return <div className="ladder ladder--empty" />;

  // 경로를 화면 좌표로 바꾸고, 지나온 만큼만 잘라서 그린다.
  // 점 개수가 아니라 실제 길이로 나눠야 내려가는 속도가 일정해 보인다.
  const pts = path.map((p) => ({ x: colX(p.col), y: rowY(p.row) }));
  const segLen = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  const totalLen = segLen.reduce((a, b) => a + b, 0);

  const drawnPts: { x: number; y: number }[] = pts.length > 0 ? [pts[0]] : [];
  let remaining = drawn * totalLen;
  for (let i = 0; i < segLen.length; i += 1) {
    if (remaining <= 0) break;
    const len = segLen[i];
    if (remaining >= len) {
      drawnPts.push(pts[i + 1]);
      remaining -= len;
    } else {
      const t = len === 0 ? 0 : remaining / len;
      drawnPts.push({
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
      });
      remaining = 0;
    }
  }

  const drawnPoints = drawnPts.map((p) => `${p.x},${p.y}`).join(' ');
  const head = drawnPts[drawnPts.length - 1];

  return (
    <div className="ladder">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={`사다리 ${count}칸`}>
        {/* 세로줄 */}
        {candidates.map((place, i) => (
          <line
            key={place.id}
            x1={colX(i)}
            y1={rowY(0)}
            x2={colX(i)}
            y2={rowY(ROWS)}
            className="ladder__rail"
          />
        ))}
        {/* 가로줄 */}
        {ladder.rungs.map((r, i) => (
          <line
            key={i}
            x1={colX(r.col)}
            y1={rowY(r.row + 0.5)}
            x2={colX(r.col + 1)}
            y2={rowY(r.row + 0.5)}
            className="ladder__rung"
          />
        ))}
        {/* 지나온 경로 */}
        {drawn > 0 && drawnPts.length > 1 && (
          <polyline ref={pathRef} points={drawnPoints} className="ladder__path" />
        )}
        {drawn > 0 && head && <circle cx={head.x} cy={head.y} r={5} className="ladder__head" />}
      </svg>

      <div className="ladder__labels" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
        {candidates.map((place, i) => (
          <span
            key={place.id}
            className={
              winnerIndex === i && drawn >= 1 ? 'ladder__label ladder__label--win' : 'ladder__label'
            }
          >
            {place.name}
          </span>
        ))}
      </div>
    </div>
  );
}
