/**
 * 핀볼 — 공이 핀 삼각형을 타고 당첨 칸으로 떨어진다.
 *
 * 경로는 lib/pinball.ts 가 역산한다. 여기서는 그 경로를 따라 공을 움직이고,
 * 부딪힌 핀을 빛내고, 범퍼를 번쩍이고, HIT 를 센다. 결과 계산은 없다.
 *
 * 구슬 레이스와 나란히 두는 이유: 레이스는 물리를 실제로 돌리고(느리고 무겁다),
 * 핀볼은 경로를 역산한다(가볍고 즉각적이다). 손맛이 다른 연출이다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryHue } from '../../lib/category';
import {
  BOARD_W,
  buildPinballRun,
  type PinballRun,
} from '../../lib/pinball';
import { PINBALL_SEG_MS, prefersReducedMotion, type GameProps } from './types';

/** 범퍼가 켜졌을 때 / 꺼졌을 때. 게임 영역만 색을 쓴다. */
const BUMPER_HUES = [200, 320] as const;

interface Bumper {
  x: number;
  y: number;
  /** HIT 수의 홀짝 중 어느 쪽에서 켜지는가. */
  side: 0 | 1;
  hue: number;
}

export function Pinball({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const [ballPos, setBallPos] = useState<{ x: number; y: number } | null>(null);
  const [litPeg, setLitPeg] = useState(-1);
  const [hits, setHits] = useState(0);
  const [litBin, setLitBin] = useState(-1);
  const frame = useRef(0);
  const timer = useRef(0);

  const run: PinballRun | null = useMemo(
    () => (winnerIndex === null ? null : buildPinballRun(count, winnerIndex)),
    [count, winnerIndex],
  );

  const bumpers: Bumper[] = useMemo(() => {
    if (!run) return [];
    const { pegTop, rows, rowH } = run.geometry;
    const y = pegTop + rows * rowH * 0.42;
    return [
      { x: 34, y, side: 0, hue: BUMPER_HUES[0] },
      { x: BOARD_W - 34, y, side: 1, hue: BUMPER_HUES[1] },
      { x: 22, y: y + 46, side: 1, hue: BUMPER_HUES[1] },
      { x: BOARD_W - 22, y: y + 46, side: 0, hue: BUMPER_HUES[0] },
    ];
  }, [run]);

  useEffect(() => {
    if (!spinning || !run) return;

    const points = run.points;
    const segments = points.length - 1;
    setLitBin(-1);
    setHits(0);
    setLitPeg(-1);

    if (prefersReducedMotion() || segments <= 0) {
      setBallPos(points[points.length - 1]);
      setLitBin(run.rights.filter(Boolean).length);
      onSpinEnd();
      return;
    }

    const total = PINBALL_SEG_MS * segments;
    const started = performance.now();
    let lastSegment = -1;

    const tick = (now: number) => {
      /*
       * 아래를 0 으로 안 가두면 애니메이션이 통째로 죽는다.
       *
       * rAF 가 넘겨주는 now 는 그 프레임이 시작된 시각이라, 바로 앞에서 잰
       * performance.now() 보다 이전일 수 있다. 그러면 t 가 음수가 되고
       * i 가 -1 이 되어 points[-1] 이 undefined 다. rAF 안에서 난 예외는
       * 화면에 아무 표시도 남기지 않으므로, 공은 setTimeout 이 놓는
       * 마지막 위치로 순간이동하고 연출만 조용히 사라진다.
       */
      const t = Math.min(1, Math.max(0, (now - started) / total));
      const f = t * segments;
      const i = Math.min(segments - 1, Math.max(0, Math.floor(f)));
      const u = f - i;
      const a = points[i];
      const b = points[i + 1];

      // y 는 u² 로 떨어지고(중력 느낌), sin 으로 살짝 튄다.
      setBallPos({
        x: a.x + (b.x - a.x) * u,
        y: a.y + (b.y - a.y) * (u * u) - Math.sin(Math.PI * u) * 7,
      });
      setLitPeg(u < 0.45 ? a.peg : -1);

      if (i !== lastSegment && a.peg >= 0) {
        lastSegment = i;
        setHits((n) => n + 1);
      }

      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);

    timer.current = window.setTimeout(() => {
      setBallPos(points[points.length - 1]);
      setLitPeg(-1);
      // 당첨 칸을 먼저 칠하고 나서 알린다. 순서를 바꾸면 재렌더의 정리가
      // rAF 를 끊어 칸이 강조되지 않은 채로 끝난다 (사다리에서 겪었다).
      setLitBin(run.rights.filter(Boolean).length);
      onSpinEnd();
    }, total);

    return () => {
      cancelAnimationFrame(frame.current);
      window.clearTimeout(timer.current);
    };
  }, [spinning, run, onSpinEnd]);

  if (count === 0 || !run) {
    return <div className="pinball pinball--empty" />;
  }

  const { geometry, pegs } = run;

  return (
    <div className="pinball">
      <span className="pinball__hits">HIT {hits}</span>
      <svg viewBox={`0 0 ${BOARD_W} ${geometry.svgH}`} className="pinball__board" aria-hidden="true">
        {bumpers.map((b, i) => {
          const on = spinning && hits > 0 && hits % 2 === b.side;
          return (
            <g key={i}>
              <circle
                cx={b.x}
                cy={b.y}
                r={19}
                fill="none"
                stroke={`oklch(0.9 0.15 ${b.hue})`}
                strokeWidth={2}
                opacity={on ? 0.9 : 0.25}
              />
              <circle
                cx={b.x}
                cy={b.y}
                r={on ? 15 : 13}
                fill={`oklch(${on ? 0.85 : 0.5} ${on ? 0.2 : 0.14} ${b.hue})`}
              />
            </g>
          );
        })}

        {pegs.map((peg, i) => (
          <circle
            key={i}
            cx={peg.x}
            cy={peg.y}
            r={i === litPeg ? 5 : 3}
            className={i === litPeg ? 'pinball__peg pinball__peg--lit' : 'pinball__peg'}
          />
        ))}
        {litPeg >= 0 && pegs[litPeg] && (
          <circle
            cx={pegs[litPeg].x}
            cy={pegs[litPeg].y}
            r={11}
            className="pinball__ring"
            fill="none"
          />
        )}

        {Array.from({ length: Math.max(count - 1, 0) }, (_, i) => (
          <line
            key={i}
            x1={(i + 1) * geometry.binW}
            y1={geometry.binsTop}
            x2={(i + 1) * geometry.binW}
            y2={geometry.svgH}
            className="pinball__wall"
          />
        ))}

        {ballPos && (
          <>
            <circle cx={ballPos.x} cy={ballPos.y} r={11} className="pinball__glow" />
            <circle cx={ballPos.x} cy={ballPos.y} r={6} className="pinball__ball" />
          </>
        )}
      </svg>

      <ol
        className="pinball__bins"
        style={{ gridTemplateColumns: `repeat(${Math.max(count, 1)}, 1fr)` }}
      >
        {candidates.map((place, i) => (
          <li
            key={place.id}
            className={litBin === i ? 'pinball__bin pinball__bin--win' : 'pinball__bin'}
            style={{ '--cat-hue': categoryHue(place.category) } as React.CSSProperties}
          >
            {/* 칸 하나가 64px 남짓이고 세로쓰기다. 접두를 떼야 이름이 남는다. */}
            <span>{place.name.replace(/^샘플 /, '')}</span>
          </li>
        ))}
      </ol>
      <span className="pinball__sr" aria-live="polite">
        {litBin >= 0 && candidates[litBin] ? `${candidates[litBin].name} 당첨` : ''}
      </span>
    </div>
  );
}
