/**
 * 플링코 — 공 하나가 삼각형 핀을 맞으며 내려가 아래 칸에 들어간다(밝은 판).
 *
 * 당첨은 App 이 정했다(winnerIndex). 경로는 lib/plinko.ts 가 거꾸로 만든다 — 오른쪽으로
 * 꺾인 횟수가 도착 칸이다. 공은 핀마다 작게 튀고, 맞은 핀은 강조색으로 커진다.
 * 핀볼(구슬 레이스)과 다르다: 공은 하나, 판은 화면 한 장.
 */
import { useEffect, useMemo, useState } from 'react';
import { categoryHue } from '../../lib/category';
import { shortName } from '../../lib/name';
import { pinHits, plinkoPath } from '../../lib/plinko';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';

/** 핀 한 줄을 지나는 시간. 후보 20곳이면 19줄 × 170ms ≈ 3.2초. */
export const PLINKO_STEP_MS = 170;
const SETTLE_MS = 350;
/** 그림 단위. 칸 폭 S, 줄 간격 H, 위 여백 TOP. */
const S = 24;
const H = 22;
const TOP = 10;
const BOUNCE = 6;

export function plinkoDuration(count: number): number {
  return Math.max(1, count) * PLINKO_STEP_MS + SETTLE_MS;
}

export function Plinko({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const rows = Math.max(0, count - 1);
  const W = Math.max(1, count) * S;
  const boardH = TOP + rows * H + S;
  const path = useMemo(
    () => (winnerIndex === null ? [] : plinkoPath(winnerIndex, count, seededRandom(run))),
    [winnerIndex, count, run],
  );
  const hits = useMemo(() => pinHits(path), [path]);
  const [prog, setProg] = useState<{ run: number; t: number }>({ run: -1, t: -1 });
  const t = prog.run === run ? prog.t : winnerIndex !== null && !spinning ? 1 : -1;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion()) {
      setProg({ run, t: 1 });
      const tm = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(tm);
    }
    const total = plinkoDuration(count);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / total);
      setProg({ run, t: p });
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const end = window.setTimeout(() => {
      setProg({ run, t: 1 });
      onSpinEnd();
    }, total);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(end);
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="plinko plinko--empty" />;

  const cx = W / 2;
  const pinX = (r: number, j: number) => cx + (j - r / 2) * S;
  const pinY = (r: number) => TOP + r * H;
  // 공이 거치는 점: 맨 위 → 줄마다 맞는 핀 → 도착 칸.
  const points = [{ x: cx, y: -4 }, ...hits.map((j, r) => ({ x: pinX(r, j), y: pinY(r) - 5 })), {
    x: (winnerIndex ?? 0) * S + S / 2,
    y: boardH - S / 2,
  }];
  // 지금 몇 번째 구간인지. 구간 수 = 줄 수 + 1, 마지막 SETTLE 는 칸 안에서 멈춰 있다.
  const moving = Math.max(0, Math.min(1, (t * plinkoDuration(count)) / (count * PLINKO_STEP_MS)));
  const seg = Math.min(points.length - 2, Math.floor(moving * (points.length - 1)));
  const f = moving * (points.length - 1) - seg;
  const a = points[Math.max(0, seg)];
  const b = points[Math.max(0, seg) + 1] ?? a;
  const ball = t < 0 ? { x: cx, y: -S } : { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * BOUNCE };
  const hitUpTo = t < 0 ? -1 : seg - 1;
  const landed = t >= 1 && winnerIndex !== null;

  return (
    <div className={expanded ? 'plinko plinko--big' : 'plinko'}>
      <p className="muted small plinko__hint" aria-live="polite">
        {t < 0
          ? `공을 떨어뜨리면 핀을 따라 내려가 ${count}개 칸 중 하나에 들어가요.`
          : landed
            ? `${candidates[winnerIndex].name} 칸에 들어갔어요.`
            : '공이 내려가고 있어요…'}
      </p>
      <svg className="plinko__board" viewBox={`0 -8 ${W} ${boardH + 8}`} aria-hidden="true">
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: r + 1 }, (_, j) => {
            const hit = r <= hitUpTo && hits[r] === j;
            const now = hit && r === hitUpTo;
            return (
              <circle
                key={`${r}-${j}`}
                className={now ? 'plinko__pin plinko__pin--now' : hit ? 'plinko__pin plinko__pin--hit' : 'plinko__pin'}
                cx={pinX(r, j)}
                cy={pinY(r)}
                r={now ? 4.5 : 3}
              />
            );
          }),
        )}
        {Array.from({ length: count + 1 }, (_, k) => (
          <line key={k} className="plinko__wall" x1={k * S} x2={k * S} y1={boardH - S} y2={boardH} />
        ))}
        {(t >= 0 || landed) && <circle className="plinko__ball" cx={ball.x} cy={ball.y} r={6} />}
      </svg>
      <ol className="plinko__slots" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {candidates.map((p, i) => (
          <li
            key={p.id}
            className={landed && i === winnerIndex ? 'plinko__slot plinko__slot--win' : 'plinko__slot'}
            style={{ '--cat-hue': categoryHue(p.category) } as React.CSSProperties}
            title={p.name}
          >
            {shortName(p.name, count > 10 ? 4 : 6)}
          </li>
        ))}
      </ol>
    </div>
  );
}
