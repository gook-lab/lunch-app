/**
 * 사다리타기 — 사용자가 출발점을 고르고, 가로줄을 직접 긋는다.
 *
 * 줄마다 꼬마 주자가 서 있다가 한꺼번에 내려간다. 고른 줄의 주자(내 주자)를 카메라가 따라가고,
 * 내 주자는 갈림길에서 두리번거리거나 없는 가로줄 쪽으로 "어? 이쪽이야?" 기웃했다 돌아온다.
 * 다른 주자들은 제 길로 먼저(혹은 나란히) 내려가 바닥에서 기다린다. 내 주자가 닿으면 바닥 칸에
 * 커튼이 내려오고, 두구두구 뒤 걷히며 칸이 한꺼번에 열린다. 일정은 판 번호 시드로 lib/ladder.ts 가 정한다.
 *
 * 당첨은 사다리가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * 여기서는 경로가 닿은 칸에 그 당첨을 놓고 나머지 칸을 섞어 연다
 * (lib/ladder.ts revealSlots). 바닥이 끝까지 가려져 있으므로 미리 섞어 숨겨
 * 둔 것과 확률이 같다. 출발점이나 가로줄을 어떻게 고르든 당첨 확률은 그대로다.
 * 두리번·가짜 길·먼저 가는 주자는 연출일 뿐 내 주자의 길(ladderPath)을 바꾸지 않는다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLadder,
  ladderPath,
  ladderPlan,
  revealSlots,
  rivalAt,
  runnerAt,
  toggleRung,
  walkLadder,
  type LadderPlan,
  type Rung,
} from '../../lib/ladder';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { ladderDiceSfxLater, sfx, type LadderDiceSfxName, type SfxName } from '../../lib/sfx';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SceneWeather } from './scene/SceneWeather';
import { ambienceClasses } from './scene/outfit';
import './Ladder.css';
import './Ladder.ambience.css';

const ROWS = 9;
const VIEW_W = 320;
const VIEW_H = 260;
const PAD_X = 18;
/** 위쪽은 출발 번호 단추 자리라 넉넉히 둔다. */
const PAD_TOP = 34;
const PAD_BOTTOM = 14;
/** 이 수를 넘는 후보 수부터 라벨을 세로쓰기로 바꾼다. */
export const TALL_LABELS_FROM = 6;
/** 끝난 판을 그릴 때 쓰는 시각 — 일정의 어떤 시각보다 뒤. */
const DONE_MS = Number.MAX_SAFE_INTEGER;

interface Cam {
  /** 카메라가 비추는 곳(카메라 상자 비 0~1)과 배율. */
  fx: number;
  fy: number;
  z: number;
}

interface Progress {
  run: number;
  ms: number;
  cam: Cam;
}

const NO_CAM: Cam = { fx: 0.5, fy: 0.5, z: 1 };
const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (x: number) => {
  const t = clampNum(x, 0, 1);
  return t * t * (3 - 2 * t);
};

type Pt = { x: number; y: number };

/** 꺾은선 위 길이 비 p 지점과 그 구간의 방향. */
function pointAt(pts: Pt[], p: number): Pt & { dx: number } {
  if (pts.length === 0) return { x: 0, y: 0, dx: 0 };
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  let left = clampNum(p, 0, 1) * total;
  for (let i = 0; i < lens.length; i += 1) {
    if (left <= lens[i] || i === lens.length - 1) {
      const t = lens[i] === 0 ? 0 : Math.min(1, left / lens[i]);
      return {
        x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
        y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
        dx: Math.sign(pts[i + 1].x - pts[i].x),
      };
    }
    left -= lens[i];
  }
  return { ...pts[pts.length - 1], dx: 0 };
}

/** 꺾은선의 앞 p 만큼(지나온 길). */
function trail(pts: Pt[], p: number): Pt[] {
  if (pts.length === 0) return [];
  const lens = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
  const total = lens.reduce((a, b) => a + b, 0);
  let left = clampNum(p, 0, 1) * total;
  const out = [pts[0]];
  for (let i = 0; i < lens.length && left > 0; i += 1) {
    if (left >= lens[i]) {
      out.push(pts[i + 1]);
      left -= lens[i];
    } else {
      const t = lens[i] === 0 ? 0 : left / lens[i];
      out.push({ x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t });
      left = 0;
    }
  }
  return out;
}

/** 가짜 길에서 옆으로 기웃한 정도(0~1). 나갔다가 잠깐 멈칫, 다시 돌아온다. */
function fakeLean(u: number): number {
  if (u < 0.3) return smooth(u / 0.3);
  if (u < 0.58) return 1;
  return 1 - smooth((u - 0.58) / 0.3);
}

export function Ladder({ candidates, winnerIndex, spinning, run, onSpinEnd, onRequestSpin }: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const columns = Math.max(count, 1);

  // 판. 처음엔 무작위로 깔고, 사용자가 누르는 대로 놓고 뗀다. 후보 구성이
  // 바뀌면 App 이 key 로 새로 마운트하므로 여기서 count 를 따라갈 일은 없다.
  const [rungs, setRungs] = useState<Rung[]>(() => buildLadder(columns, ROWS).rungs);
  const [start, setStart] = useState<number | null>(null);
  // 진행 시각은 판 번호와 같이 들고 있다. 새 판이 시작된 첫 렌더에 지난 판의
  // "끝났음" 이 남아 있으면 가린 칸이 한 프레임 열려 버린다.
  const [progress, setProgress] = useState<Progress>({ run: -1, ms: 0, cam: NO_CAM });
  // 결과가 나온 뒤 판을 고치면 그 결과는 더 이상 이 판의 것이 아니다.
  const [editedAtRun, setEditedAtRun] = useState<number | null>(null);
  const [hover, setHover] = useState<Rung | null>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const ladder = useMemo(() => ({ columns, rows: ROWS, rungs }), [columns, rungs]);
  const live = progress.run === run;
  const ms = live ? progress.ms : 0;
  const stale = winnerIndex !== null && editedAtRun === run;

  // 출발점을 안 고르고 실행 버튼을 누른 판은 판 번호로 하나 고른다.
  const effectiveStart = start ?? (winnerIndex === null ? null : Math.floor(seededRandom(run)() * columns));
  const dest = effectiveStart === null ? null : walkLadder(ladder, effectiveStart);
  const slots =
    dest === null || winnerIndex === null ? null : revealSlots(count, dest, winnerIndex, seededRandom(run + 1));

  const colGap = count <= 1 ? 0 : (VIEW_W - PAD_X * 2) / (count - 1);
  const rowGap = (VIEW_H - PAD_TOP - PAD_BOTTOM) / ROWS;
  const colX = (col: number) => (count <= 1 ? VIEW_W / 2 : PAD_X + col * colGap);
  const rowY = (row: number) => PAD_TOP + row * rowGap;

  // 한 판의 일정. 판 번호 시드라 몇 번 계산해도 같다.
  const plan: LadderPlan | null = useMemo(
    () =>
      effectiveStart === null || winnerIndex === null || stale || count < 2
        ? null
        : ladderPlan(ladder, effectiveStart, { colGap, rowGap }, SPIN_MS.ladder, seededRandom(run * 7 + 3)),
    [ladder, effectiveStart, winnerIndex, stale, count, colGap, rowGap, run],
  );

  // 줄마다 경로(그림 좌표). 내 주자·다른 주자 모두 이걸 따라 내려간다.
  const paths = useMemo(
    () =>
      Array.from({ length: count }, (_, c) =>
        ladderPath(ladder, c).map((p) => ({ x: count <= 1 ? VIEW_W / 2 : PAD_X + p.col * colGap, y: PAD_TOP + p.row * rowGap })),
      ),
    [ladder, count, colGap, rowGap],
  );

  // 내 주자 자리 — 카메라가 매 프레임 쓴다.
  const myPoint = (pl: LadderPlan, s: number, t: number): Pt => {
    const { p, beat, u } = runnerAt(pl, t);
    const pt = pointAt(paths[s] ?? [], p);
    // 기웃하는 폭은 줄 간격의 0.42, 줄이 넓어도(2곳) 26px 까지 — 더 가면 허공에 떠 보였다.
    const lean = beat?.kind === 'fake' ? beat.dir * fakeLean(u) * Math.min(colGap * 0.42, 26) : 0;
    return { x: pt.x + lean, y: pt.y };
  };
  const myPointRef = useRef(myPoint);
  myPointRef.current = myPoint;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const finish = () => {
      setProgress({ run, ms: DONE_MS, cam: NO_CAM });
      onSpinEnd();
    };
    // 움직임 줄이기 · 한 곳뿐이면 바로 끝 장면.
    if (prefersReducedMotion() || !plan || effectiveStart === null) {
      setProgress({ run, ms: DONE_MS, cam: NO_CAM });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    setProgress({ run, ms: 0, cam: NO_CAM });
    const timer = window.setTimeout(finish, plan.endMs);

    const sounds: [number, LadderDiceSfxName | SfxName][] = [
      [plan.goMs, 'go'],
      [plan.arriveMs, 'thunk'],
      [plan.arriveMs + 40, 'swish'],
      [plan.curtainMs - 100, 'drumroll'],
      [plan.liftMs, 'swish'],
      [plan.liftMs + 60, 'chime'],
    ];
    for (const b of plan.beats) {
      if (b.kind === 'look') sounds.push([b.startMs, 'hmm']);
      else sounds.push([b.startMs + b.ms * 0.18, 'huh'], [b.startMs + b.ms * 0.6, 'nope']);
    }
    for (const r of plan.rivals) sounds.push([r.finishMs, 'plop']);
    const stopSfx = ladderDiceSfxLater(sounds);

    const started = performance.now();
    let frame = 0;
    let cam = NO_CAM;
    let lastCorner = 0;
    // 줄이 적으면 조금만 — 2곳에서 1.6배면 세로줄이 화면 밖으로 나가 판이 안 읽혔다.
    const zoomTo = count <= 3 ? 1 : count <= 8 ? 1.5 : 1.85;
    const beatZoom = count <= 3 ? 0.12 : 0.25;
    const tick = (now: number) => {
      // now 는 프레임 시작 시각이라 started 보다 이전일 수 있다(Pinball.tsx 에서 실제로 터졌다).
      const t = Math.min(plan.endMs, Math.max(0, now - started));
      const cameraEl = cameraRef.current;
      const boardEl = boardRef.current;
      let target = NO_CAM;
      if (cameraEl && boardEl && cameraEl.offsetHeight > 0) {
        const pt = myPointRef.current(plan, effectiveStart, t);
        const beat = runnerAt(plan, t).beat;
        const zin = smooth(t / (plan.goMs + 500));
        const zout = smooth((t - (plan.arriveMs - 300)) / 600);
        const z = 1 + (zoomTo - 1 + (beat ? beatZoom : 0)) * zin * (1 - zout);
        target = {
          fx: (pt.x / VIEW_W) * (boardEl.offsetWidth / cameraEl.offsetWidth),
          fy: (boardEl.offsetTop + (pt.y / VIEW_H) * boardEl.offsetHeight) / cameraEl.offsetHeight,
          z,
        };
      }
      const k = cam === NO_CAM ? 1 : 0.16;
      cam = { fx: cam.fx + (target.fx - cam.fx) * k, fy: cam.fy + (target.fy - cam.fy) * k, z: cam.z + (target.z - cam.z) * k };
      // 달리는 동안 톡톡 발소리.
      const corner = Math.floor(runnerAt(plan, t).p * 12);
      if (corner > lastCorner && t > plan.goMs && t < plan.arriveMs) sfx('step');
      lastCorner = corner;
      setProgress({ run, ms: t, cam });
      if (t < plan.endMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      stopSfx();
    };
    // paths 는 plan 과 같은 판에서 나온다 — plan 이 바뀔 때만 다시 시작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

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
    const col = Math.floor((x - PAD_X) / colGap);
    const row = Math.round((y - PAD_TOP) / rowGap - 0.5);
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

  // ── 이번 판 장면 ──
  // 판이 돌았는가(내 주자 경로를 그린다). 한 곳뿐이거나 움직임 줄이기면 plan 없이 끝 장면만.
  const playing = live && winnerIndex !== null && !stale && effectiveStart !== null;
  const done = playing && ms >= (plan?.liftMs ?? 0);
  const revealed = slots !== null && done;
  const now = runnerAt(plan ?? FALLBACK_PLAN, plan ? ms : DONE_MS);
  const myP = playing ? now.p : 0;
  const beat = playing ? now.beat : null;
  const myPath = playing && effectiveStart !== null ? (paths[effectiveStart] ?? []) : [];
  const head = playing && effectiveStart !== null ? (plan ? myPoint(plan, effectiveStart, ms) : pointAt(myPath, 1)) : null;
  const headDir = playing ? pointAt(myPath, myP).dx : 0;
  const trailPts = trail(myPath, myP);
  const arrived = playing && myP >= 1;

  const rMine = Math.min(7.5, Math.max(4.5, colGap * 0.36 || 7.5));
  const rRival = Math.min(5.5, Math.max(3.2, colGap * 0.26 || 5.5));

  const name = (i: number) => shortName(candidates[i].name, 10);
  const status = (() => {
    if (!playing || effectiveStart === null) return `주자 ${count}명이 출발선에 섰어요`;
    const me = `${effectiveStart + 1}번`;
    if (done && slots && dest !== null) return `당첨! ${me} 주자가 ${name(slots[dest])}에 닿았어요`;
    if (!plan) return `${me} 주자가 내려가요`;
    if (ms >= plan.curtainMs) return '두구두구…';
    if (ms >= plan.arriveMs) return '도착! 커튼이 내려와요';
    if (ms < plan.goMs) return ms < plan.goMs * 0.55 ? '준비…' : '출발!';
    if (beat?.kind === 'look') return '어느 쪽으로 갈까…';
    if (beat?.kind === 'fake') return now.u < 0.58 ? '어? 이쪽이야?' : '아니네, 이쪽이에요!';
    const lead = plan.leader === null ? null : plan.rivals.find((r) => r.start === plan.leader);
    if (lead && ms >= lead.finishMs && ms < lead.finishMs + 900) return `${lead.start + 1}번 주자가 벌써 내려갔어요!`;
    const neck = plan.neck === null ? null : plan.rivals.find((r) => r.start === plan.neck);
    if (neck && ms >= neck.finishMs - 800 && ms < plan.arriveMs) return `${neck.start + 1}번 주자와 나란히 들어와요!`;
    if (myP >= 0.8) return '거의 다 왔어요…';
    return `${me} 주자가 내려가요`;
  })();

  // 카메라. 상자 밖이 비지 않게 가장자리에서 멈춘다.
  const cam = playing && plan ? progress.cam : NO_CAM;
  const camStyle: React.CSSProperties | undefined =
    cam.z > 1.001
      ? {
          transform: `translate(${(clampNum(0.5 - cam.z * cam.fx, 1 - cam.z, 0) * 100).toFixed(2)}%, ${(clampNum(0.5 - cam.z * cam.fy, 1 - cam.z, 0) * 100).toFixed(2)}%) scale(${cam.z.toFixed(3)})`,
        }
      : undefined;

  const curtain =
    playing && plan && ms >= plan.arriveMs && ms < plan.liftMs + 700 ? (ms >= plan.liftMs ? 'up' : 'down') : null;

  /**
   * 열린 이름표(가로 쓰기)의 자리. 폭이 칸 하나(100/count %)라 첫·끝 칸을 줄 위에
   * 가운데 맞추면 반 폭이 판 밖으로 나간다. 후보 2곳이면 끝 칸이 오른쪽으로 27px
   * 넘쳐 390px 페이지가 가로로 밀렸다(리뷰 재현). 가운데를 판 안으로 당기고,
   * 글자는 줄 쪽으로 붙여 어느 줄의 칸인지 읽히게 한다.
   */
  const openLabelStyle = (slot: number): React.CSSProperties => {
    const w = 100 / count;
    const at = (colX(slot) / VIEW_W) * 100;
    const left = clampNum(at, w / 2, 100 - w / 2);
    const textAlign = left > at ? 'left' : left < at ? 'right' : 'center';
    return { left: `${left}%`, width: `${w}%`, textAlign };
  };

  return (
    <div className={['ladder', 'scene-outfit', ambienceClasses(ambience), playing && !done ? 'ladder--running' : '', done ? 'ladder--done' : ''].filter(Boolean).join(' ')}>
      <div className="ladder__bar">
        <p className="muted small">번호를 누르면 출발해요. 판을 누르면 가로줄을 넣거나 뺄 수 있어요.</p>
        <button type="button" className="ladder__shuffle" onClick={reshuffle} disabled={spinning}>
          새 사다리
        </button>
      </div>

      <div className="ladder__stage">
        <span className="ladder__yard" aria-hidden="true">
          <SceneWeather weather={ambience.weather} band={[0, 30]} />
        </span>
        <div className="ladder__camera" ref={cameraRef} style={camStyle}>
          <div className="ladder__board" ref={boardRef} style={{ '--cols': count } as React.CSSProperties}>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              role="img"
              aria-label={`사다리 ${count}줄, 가로줄 ${rungs.length}개`}
              onClick={onBoardClick}
              onMouseMove={onBoardMove}
              onMouseLeave={() => setHover(null)}
              className={spinning ? 'ladder__svg' : 'ladder__svg ladder__svg--editable'}
            >
              {/* 당첨 칸 위로 내려오는 빛 */}
              {done && dest !== null && (
                <rect
                  x={colX(dest) - Math.min(18, colGap * 0.45)}
                  y={rowY(ROWS - 3)}
                  width={Math.min(36, colGap * 0.9)}
                  height={rowY(ROWS) - rowY(ROWS - 3) + PAD_BOTTOM}
                  className="ladder__beam"
                />
              )}
              {/* 세로줄 */}
              {candidates.map((place, i) => (
                <line key={place.id} x1={colX(i)} y1={rowY(0)} x2={colX(i)} y2={rowY(ROWS)} className="ladder__rail" />
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
              {/* "어? 이쪽이야?" — 없는 가로줄이 깜빡인다 */}
              {beat?.kind === 'fake' && now.u < 0.72 && (
                <line
                  x1={colX(beat.col)}
                  y1={rowY(beat.row + 0.5)}
                  x2={colX(beat.col + 1)}
                  y2={rowY(beat.row + 0.5)}
                  className={now.u < 0.58 ? 'ladder__fake' : 'ladder__fake ladder__fake--gone'}
                />
              )}
              {/* 지나온 경로 */}
              {trailPts.length > 1 && <polyline points={trailPts.map((p) => `${p.x},${p.y}`).join(' ')} className="ladder__path" />}

              {/* 다른 주자들 */}
              {plan &&
                playing &&
                plan.rivals.map((r) => {
                  const p = rivalAt(plan, r, ms);
                  const pts = paths[r.start] ?? [];
                  const pt = pointAt(pts, p);
                  const dist = p * VIEW_H;
                  return (
                    <Runner
                      key={r.start}
                      x={pt.x}
                      y={pt.y}
                      r={rRival}
                      dir={pt.dx}
                      step={p < 1 && ms > plan.goMs ? Math.floor(dist / 6) % 2 : -1}
                      cls={['ladder__runner', r.start === plan.leader || r.start === plan.neck ? 'ladder__runner--hot' : '', p >= 1 ? 'ladder__runner--wait' : '']
                        .filter(Boolean)
                        .join(' ')}
                    />
                  );
                })}
              {/* 출발 전 — 주자들이 출발선에 선다 */}
              {!playing &&
                count >= 2 &&
                candidates.map((p, i) => (
                  <Runner key={p.id} x={colX(i)} y={rowY(0)} r={rRival} dir={0} step={-1} cls="ladder__runner ladder__runner--idle" />
                ))}
              {/* 내 주자 */}
              {head && (
                <g>
                  <Runner
                    x={head.x}
                    y={head.y}
                    r={rMine}
                    dir={beat?.kind === 'look' ? (now.u < 0.5 ? -1 : 1) : beat?.kind === 'fake' ? beat.dir : headDir}
                    step={plan && ms > plan.goMs && !arrived && !beat ? Math.floor((myP * VIEW_H * 2.4) / 6) % 2 : -1}
                    cls={['ladder__runner', 'ladder__runner--me', done ? 'ladder__runner--win' : '', ms < (plan?.goMs ?? 0) ? 'ladder__runner--ready' : '']
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {beat && (
                    <text x={head.x} y={head.y - rMine - 5} className="ladder__bubble">
                      {beat.kind === 'look' ? '?' : now.u < 0.58 ? '!' : '…'}
                    </text>
                  )}
                </g>
              )}
            </svg>

            {/* 출발 번호. 세로줄 꼭대기에 붙인다. */}
            {candidates.map((place, i) => (
              <button
                key={place.id}
                type="button"
                className={
                  effectiveStart === i && winnerIndex !== null && !stale
                    ? 'ladder__start ladder__start--on'
                    : 'ladder__start'
                }
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
           * 내 주자가 닿으면 커튼이 내려와 덮고, 두구두구 뒤 걷히며 한꺼번에 열린다.
           */}
          <div className={tall ? 'ladder__labels ladder__labels--tall' : 'ladder__labels'}>
            {candidates.map((_, slot) => {
              const place = revealed && slots ? candidates[slots[slot]] : null;
              const win = revealed && slot === dest;
              const cls = [
                'ladder__label',
                place ? 'ladder__label--open' : 'ladder__label--hidden',
                win ? 'ladder__label--win' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <span
                  key={slot}
                  className={cls}
                  style={tall || !place ? { left: `${(colX(slot) / VIEW_W) * 100}%` } : openLabelStyle(slot)}
                  title={place?.name}
                  aria-label={place ? undefined : `${slot + 1}번 칸, 가려져 있어요`}
                >
                  {place ? (tall ? shortName(place.name, 8) : place.name) : '?'}
                </span>
              );
            })}
            {curtain && (
              <span className={`ladder__curtain ladder__curtain--${curtain}`} aria-hidden="true">
                <span className="ladder__curtain-text">두구두구</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="ladder__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** 일정이 없을 때(한 곳뿐 · 움직임 줄이기) runnerAt 에 넘기는 빈 일정 — 끝 시각이면 도착(1)이다. */
const FALLBACK_PLAN: LadderPlan = {
  goMs: 0,
  arriveMs: 1,
  curtainMs: 1,
  liftMs: 0,
  endMs: 1,
  moveMs: 1,
  beats: [],
  rivals: [],
  leader: null,
  neck: null,
};

/** 꼬마 주자 — 동그란 몸에 눈 둘, 달릴 때 다리가 번갈아 나간다. dir 은 보는 쪽(-1·0·1). */
function Runner({ x, y, r, dir, step, cls }: { x: number; y: number; r: number; dir: number; step: number; cls: string }) {
  const eye = r * 0.3;
  const look = dir * r * 0.22;
  const legA = step === 0 ? -0.45 : step === 1 ? 0.15 : -0.25;
  const legB = step === 0 ? 0.15 : step === 1 ? -0.45 : 0.25;
  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`} className={cls} aria-hidden="true">
      <g className="ladder__runner-body">
        <line x1={-r * 0.35} y1={r * 0.6} x2={-r * 0.35 + legA * r} y2={r * 1.25} className="ladder__runner-leg" />
        <line x1={r * 0.35} y1={r * 0.6} x2={r * 0.35 + legB * r} y2={r * 1.25} className="ladder__runner-leg" />
        <circle r={r} className="ladder__runner-ball" />
        <circle cx={-r * 0.34 + look} cy={-r * 0.12} r={eye} className="ladder__runner-eye" />
        <circle cx={r * 0.34 + look} cy={-r * 0.12} r={eye} className="ladder__runner-eye" />
        <circle cx={-r * 0.34 + look * 1.5} cy={-r * 0.1} r={eye * 0.5} className="ladder__runner-pupil" />
        <circle cx={r * 0.34 + look * 1.5} cy={-r * 0.1} r={eye * 0.5} className="ladder__runner-pupil" />
        {/* 계절 덧옷 — 반지름 10 기준으로 그려 r 에 맞춰 줄인다. */}
        <g transform={`scale(${(r / 10).toFixed(3)})`}>
          <path d="M-8 5.5 Q0 9.5 8 5.5 L8.4 8.6 Q0 13 -8.4 8.6 Z" className="acc acc-scarf" />
          <path d="M-9.6 -3.4 Q-9.6 -10.4 0 -10.4 Q9.6 -10.4 9.6 -3.4 Q0 -6.4 -9.6 -3.4 Z" className="acc acc-beanie" />
          <circle cy="-10.6" r="2.4" className="acc acc-pom" />
          <path d="M-11 2 Q-12 -12 0 -12 Q12 -12 11 2 Q9 -8 0 -8 Q-9 -8 -11 2 Z" className="acc acc-hood" />
          <ellipse cy="-6.8" rx="13" ry="2.4" className="acc acc-brim" />
          <path d="M-6.5 -6.8 Q-6 -13.5 0 -13.5 Q6 -13.5 6.5 -6.8 Z" className="acc acc-crown" />
          <g className="acc acc-flower">
            <circle cx="-7.4" cy="-7.6" r="2.2" />
            <circle cx="-4.6" cy="-9.4" r="2.2" />
            <circle cx="-4.9" cy="-5.8" r="2.2" />
            <circle cx="-5.6" cy="-7.6" r="1.3" className="acc-flower__eye" />
          </g>
        </g>
      </g>
    </g>
  );
}
