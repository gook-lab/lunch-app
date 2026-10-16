/**
 * 지평선 나무 줄 — 계절마다 잎이 바뀐다(벚꽃·짙은 초록·단풍·눈 덮인 침엽수).
 * 무대 하늘과 땅 사이에 깔아 두면 같은 경기장이 계절을 탄다. 연출 전용.
 */
import type { AmbienceSeason } from '../../../lib/ambience';
import './scene.css';

const TREES = [
  { x: 4, h: 30, w: 16 },
  { x: 15, h: 24, w: 13 },
  { x: 27, h: 34, w: 18 },
  { x: 40, h: 22, w: 12 },
  { x: 52, h: 30, w: 16 },
  { x: 64, h: 26, w: 14 },
  { x: 76, h: 33, w: 17 },
  { x: 88, h: 23, w: 12 },
  { x: 97, h: 29, w: 15 },
];

export function Horizon({ season, className }: { season: AmbienceSeason; className?: string }) {
  return (
    <svg className={['scene-hz', `scene-hz--${season}`, className].filter(Boolean).join(' ')} viewBox="0 0 400 40" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {TREES.map((t, i) => {
        const cx = t.x * 4;
        const base = 40;
        const top = base - t.h;
        const conifer = season === 'winter' && i % 2 === 0;
        return (
          <g key={i}>
            <rect x={cx - 1.2} y={base - 8} width="2.4" height="8" className="scene-hz__trunk" />
            {conifer ? (
              <>
                <path d={`M${cx} ${top} L${cx + t.w / 2} ${base - 7} L${cx - t.w / 2} ${base - 7} Z`} className="scene-hz__pine" />
                <path d={`M${cx} ${top} L${cx + t.w / 5} ${top + t.h * 0.3} L${cx - t.w / 5} ${top + t.h * 0.3} Z`} className="scene-hz__cap" />
              </>
            ) : (
              <>
                <ellipse cx={cx} cy={top + t.h * 0.38} rx={t.w / 2} ry={t.h * 0.4} className={`scene-hz__leaf scene-hz__leaf--${i % 3}`} />
                {season === 'winter' && <ellipse cx={cx} cy={top + t.h * 0.18} rx={t.w / 2.6} ry={t.h * 0.16} className="scene-hz__cap" />}
                {season === 'spring' &&
                  [0, 1, 2, 3].map((k) => (
                    <circle key={k} cx={cx + ((k * 7) % 11) - 5} cy={top + t.h * (0.2 + ((k * 3) % 5) * 0.11)} r="1.6" className="scene-hz__bloom" />
                  ))}
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
