/**
 * 사다리타기 — 사용자가 출발점을 고르고, 가로줄을 직접 긋는다.
 *
 * 바닥 칸은 가려 둔다. 경로가 바닥에 닿는 순간 한꺼번에 열린다.
 *
 * 당첨은 사다리가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * 여기서는 경로가 닿은 칸에 그 당첨을 놓고 나머지 칸을 섞어 연다
 * (lib/ladder.ts revealSlots). 바닥이 끝까지 가려져 있으므로 미리 섞어 숨겨
 * 둔 것과 확률이 같다. 출발점이나 가로줄을 어떻게 고르든 당첨 확률은 그대로다.
 */
import { useEffect, useMemo, useState } from 'react';
import { buildLadder, ladderPace, ladderPath, revealSlots, toggleRung, walkLadder, type Rung } from '../../lib/ladder';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const ROWS = 9;
const VIEW_W = 320;
const VIEW_H = 260;
const PAD_X = 18;
/** 위쪽은 출발 번호 단추 자리라 넉넉히 둔다. */
const PAD_TOP = 34;
const PAD_BOTTOM = 14;
/** 이 수를 넘는 후보 수부터 라벨을 세로쓰기로 바꾼다. */
export const TALL_LABELS_FROM = 6;

interface Progress {
  run: number;
  t: number;
}

export function Ladder({ candidates, winnerIndex, spinning, run, onSpinEnd, onRequestSpin }: GameProps) {
  const count = candidates.length;
  const columns = Math.max(count, 1);

  // 판. 처음엔 무작위로 깔고, 사용자가 누르는 대로 놓고 뗀다. 후보 구성이
  // 바뀌면 App 이 key 로 새로 마운트하므로 여기서 count 를 따라갈 일은 없다.
  const [rungs, setRungs] = useState<Rung[]>(() => buildLadder(columns, ROWS).rungs);
  const [start, setStart] = useState<number | null>(null);
  // 진행도는 판 번호와 같이 들고 있다. 새 판이 시작된 첫 렌더에 지난 판의
  // "다 그렸음(1)" 이 남아 있으면 가린 칸이 한 프레임 열려 버린다.
  const [progress, setProgress] = useState<Progress>({ run: -1, t: 0 });
  // 결과가 나온 뒤 판을 고치면 그 결과는 더 이상 이 판의 것이 아니다.
  const [editedAtRun, setEditedAtRun] = useState<number | null>(null);
  const [hover, setHover] = useState<Rung | null>(null);

  const ladder = useMemo(() => ({ columns, rows: ROWS, rungs }), [columns, rungs]);
  const drawn = progress.run === run ? progress.t : 0;
  const stale = winnerIndex !== null && editedAtRun === run;

  // 출발점을 안 고르고 실행 버튼을 누른 판은 판 번호로 하나 고른다.
  const effectiveStart =
    start ?? (winnerIndex === null ? null : Math.floor(seededRandom(run)() * columns));
  const dest = effectiveStart === null ? null : walkLadder(ladder, effectiveStart);
  const path = effectiveStart === null || winnerIndex === null || stale ? [] : ladderPath(ladder, effectiveStart);
  const slots =
    dest === null || winnerIndex === null ? null : revealSlots(count, dest, winnerIndex, seededRandom(run + 1));
  const revealed = slots !== null && !stale && drawn >= 1;

  const colX = (col: number) =>
    count <= 1 ? VIEW_W / 2 : PAD_X + (col * (VIEW_W - PAD_X * 2)) / (count - 1);
  const rowY = (row: number) => PAD_TOP + (row * (VIEW_H - PAD_TOP - PAD_BOTTOM)) / ROWS;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const reduced = prefersReducedMotion();
    const finish = () => {
      setProgress({ run, t: 1 });
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
      setProgress({ run, t: ladderPace(t) });
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="ladder ladder--empty" />;

  // 열이 7개를 넘으면 한 열이 320px 기준 40px 아래라 가로 라벨이 전부
  // "샘플…" 로 잘린다(11곳에서 실측). 그때는 세로로 쓴다.
  const tall = count > TALL_LABELS_FROM;

  /** 출발 번호를 누르면 그 줄에서 바로 내려간다. */
  const pickStart = (i: number) => {
    if (spinning) return;
    setStart(i);
    onRequestSpin?.();
  };

  /** 누른 자리를 판 칸(row, col)으로 바꾼다. 판 밖이면 null. */
  const hitCell = (e: React.MouseEvent<SVGSVGElement>): Rung | null => {
    if (count < 2) return null;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * VIEW_W;
    const y = ((e.clientY - box.top) / box.height) * VIEW_H;
    const gap = (VIEW_W - PAD_X * 2) / (count - 1);
    const col = Math.floor((x - PAD_X) / gap);
    const row = Math.round((y - PAD_TOP) / ((VIEW_H - PAD_TOP - PAD_BOTTOM) / ROWS) - 0.5);
    if (row < 0 || row >= ROWS || col < 0 || col >= count - 1) return null;
    return { row, col };
  };

  /** 판을 누른 자리에 가로줄을 놓거나 뗀다. */
  const onBoardClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (spinning) return;
    const cell = hitCell(e);
    if (!cell) return;
    setRungs((r) => toggleRung(r, cell.row, cell.col, columns));
    if (winnerIndex !== null) setEditedAtRun(run);
  };

  // 마우스를 올린 자리에 생길(또는 지워질) 가로줄을 점선으로 미리 보여 준다.
  // 옆 가로줄과 붙어서 놓을 수 없는 자리는 아무것도 안 그린다.
  const onBoardMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const cell = spinning ? null : hitCell(e);
    setHover((h) => (h?.row === cell?.row && h?.col === cell?.col ? h : cell));
  };
  const ghost =
    hover && !spinning && toggleRung(rungs, hover.row, hover.col, columns).length !== rungs.length ? hover : null;
  const ghostRemoves = ghost !== null && rungs.some((r) => r.row === ghost.row && r.col === ghost.col);

  const reshuffle = () => {
    if (spinning) return;
    setRungs(buildLadder(columns, ROWS).rungs);
    if (winnerIndex !== null) setEditedAtRun(run);
  };

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
  const showPath = drawn > 0 && !stale;

  return (
    <div className="ladder">
      <div className="ladder__bar">
        <p className="muted small">번호를 누르면 출발해요. 판을 누르면 가로줄이 생겨요.</p>
        <button type="button" className="ladder__shuffle" onClick={reshuffle} disabled={spinning}>
          새 사다리
        </button>
      </div>

      <div className="ladder__board">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          role="img"
          aria-label={`사다리 ${count}줄, 가로줄 ${rungs.length}개`}
          onClick={onBoardClick}
          onMouseMove={onBoardMove}
          onMouseLeave={() => setHover(null)}
          className={spinning ? 'ladder__svg' : 'ladder__svg ladder__svg--editable'}
        >
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
          {rungs.map((r) => (
            <line
              key={`${r.row}-${r.col}`}
              x1={colX(r.col)}
              y1={rowY(r.row + 0.5)}
              x2={colX(r.col + 1)}
              y2={rowY(r.row + 0.5)}
              className="ladder__rung"
            />
          ))}
          {ghost && (
            <line
              x1={colX(ghost.col)}
              y1={rowY(ghost.row + 0.5)}
              x2={colX(ghost.col + 1)}
              y2={rowY(ghost.row + 0.5)}
              className={ghostRemoves ? 'ladder__ghost ladder__ghost--remove' : 'ladder__ghost'}
            />
          )}
          {/* 지나온 경로 */}
          {showPath && drawnPts.length > 1 && <polyline points={drawnPoints} className="ladder__path" />}
          {showPath && head && <circle cx={head.x} cy={head.y} r={5} className="ladder__head" />}
        </svg>

        {/* 출발 번호. 세로줄 꼭대기에 붙인다. */}
        {candidates.map((place, i) => (
          <button
            key={place.id}
            type="button"
            className={effectiveStart === i && winnerIndex !== null && !stale ? 'ladder__start ladder__start--on' : 'ladder__start'}
            style={{ left: `${(colX(i) / VIEW_W) * 100}%` }}
            onClick={() => pickStart(i)}
            disabled={spinning}
            aria-label={`${i + 1}번 줄에서 출발`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/*
        * 바닥 칸. 경로가 닿을 때까지 "?" 로 덮어 둔다. 줄과 같은 colX 로
        * 자리를 잡아야 당첨 강조가 옆 줄 밑에 뜬 것처럼 보이지 않는다.
        */}
      <div className={tall ? 'ladder__labels ladder__labels--tall' : 'ladder__labels'}>
        {candidates.map((_, slot) => {
          const place = revealed && slots ? candidates[slots[slot]] : null;
          const win = revealed && slot === dest;
          const cls = ['ladder__label', place ? 'ladder__label--open' : 'ladder__label--hidden', win ? 'ladder__label--win' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <span
              key={slot}
              className={cls}
              style={
                tall || !place
                  ? { left: `${(colX(slot) / VIEW_W) * 100}%` }
                  : { left: `${(colX(slot) / VIEW_W) * 100}%`, width: `${100 / count}%` }
              }
              title={place?.name}
              aria-label={place ? undefined : `${slot + 1}번 칸, 가려져 있어요`}
            >
              {place ? (tall ? shortName(place.name, 8) : place.name) : '?'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
