/**
 * 뽑기 기계 — 손잡이를 돌리면 돔 안 캡슐이 흔들리다 하나가 떨어지고, 열면 가게가 나온다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 돔 안 캡슐에는 이름이 없고 서로 구별되지 않으므로
 * 어느 캡슐이 떨어지든 공정하다 — 떨어진 캡슐을 열어 보면 당첨 가게다. 캡슐 색은 후보들의
 * 카테고리 색을 섞어 둔 것이고, 떨어지는 캡슐은 당첨 가게 카테고리 색이다.
 *
 * 순서: 흔들기(2.2초, 손잡이 한 바퀴) → 출구로 떨어짐 → 0.5초 뒤 열림 → 끝.
 */
import { useEffect, useMemo, useState } from 'react';
import { categoryHue, categoryIcon } from '../../lib/category';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

type Phase = 'idle' | 'shake' | 'drop' | 'open';

const SHAKE_MS = 2200;
const OPEN_AT = SHAKE_MS + 500;
/** 돔에 그리는 캡슐 수 상한. 넘으면 "…외 N개" 로 적는다. */
export const MAX_CAPSULES = 20;

export function Gacha({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [shown, setShown] = useState<{ run: number; phase: Phase }>({ run: -1, phase: 'idle' });
  const phase: Phase = shown.run === run ? shown.phase : winnerIndex !== null && !spinning ? 'open' : 'idle';

  // 돔 안 캡슐: 후보 카테고리 색을 판 번호로 섞어 바닥부터 쌓는다. 이름은 없다.
  // 아래 줄일수록 앞(크고 밝게), 위 줄일수록 뒤 — 쌓인 더미가 입체로 보인다.
  const capsules = useMemo(() => {
    const r = seededRandom(run + 11);
    const hues = candidates.slice(0, MAX_CAPSULES).map((p) => categoryHue(p.category));
    for (let i = hues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [hues[i], hues[j]] = [hues[j], hues[i]];
    }
    const out: { hue: number; x: number; y: number; tilt: number; depth: number; dx: number; dy: number }[] = [];
    const size = 0.16;
    for (let row = 0, y = 0.8; out.length < hues.length; row += 1, y -= 0.115) {
      // 돔 안쪽 원(반지름 0.44)이 이 높이에서 갖는 폭만큼 한 줄에 놓는다.
      const half = Math.sqrt(Math.max(0, 0.44 ** 2 - (y - 0.5) ** 2));
      const fit = Math.max(1, Math.floor((half * 2) / size));
      const take = Math.min(fit, hues.length - out.length);
      const start = 0.5 - ((take - 1) * size) / 2 + (row % 2 ? size / 4 : -size / 4);
      for (let k = 0; k < take; k += 1) {
        out.push({
          hue: hues[out.length],
          x: (start + k * size + (r() - 0.5) * 0.02) * 100,
          y: (y + (r() - 0.5) * 0.02) * 100,
          tilt: Math.round((r() - 0.5) * 120),
          depth: row,
          dx: Math.round((r() - 0.5) * 160),
          dy: -Math.round(90 + r() * 220),
        });
      }
    }
    return out;
  }, [candidates, run]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion()) {
      setShown({ run, phase: 'open' });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    setShown({ run, phase: 'shake' });
    const timers = [
      window.setTimeout(() => setShown({ run, phase: 'drop' }), SHAKE_MS),
      window.setTimeout(() => setShown({ run, phase: 'open' }), OPEN_AT),
      window.setTimeout(onSpinEnd, SPIN_MS.gacha),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="gacha gacha--empty" />;

  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const hint =
    phase === 'idle'
      ? `캡슐 ${count}개가 들어 있어요. 손잡이를 돌리면 하나가 나와요.`
      : phase === 'shake'
        ? '캡슐을 섞고 있어요…'
        : phase === 'drop'
          ? '캡슐이 나왔어요. 열어 볼게요…'
          : winner
            ? `${winner.name} 캡슐이 나왔어요.`
            : '';

  return (
    <div className={['gacha', expanded ? 'gacha--big' : '', `gacha--${phase}`].filter(Boolean).join(' ')}>
      <p className="muted small gacha__hint" aria-live="polite">{hint}</p>
      <div className="gacha__machine" aria-hidden="true">
        <div className="gacha__dome">
          {/* 하나가 나오면 돔에서도 하나(맨 위)가 빠진다. */}
          {capsules.slice(0, phase === 'drop' || phase === 'open' ? capsules.length - 1 : capsules.length).map((c, i) => (
            <span
              key={i}
              className="gacha__capsule"
              style={
                {
                  '--cat-hue': c.hue,
                  '--tilt': `${c.tilt}deg`,
                  '--dx': `${c.dx}%`,
                  '--dy': `${c.dy}%`,
                  '--i': i,
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  zIndex: 10 - c.depth,
                  scale: `${1 - c.depth * 0.04}`,
                  filter: `brightness(${1 - c.depth * 0.05})`,
                } as React.CSSProperties
              }
            />
          ))}
          <span className="gacha__glare" />
        </div>
        <div className="gacha__body">
          <span className="gacha__slot" />
          <span className="gacha__handle" />
          <span className="gacha__chute">
            {winner && phase !== 'idle' && phase !== 'shake' && (
              <span
                className="gacha__out"
                style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}
              >
                <span className="gacha__half gacha__half--top" />
                <span className="gacha__half gacha__half--bottom" />
              </span>
            )}
          </span>
        </div>
        <span className="gacha__base" />
      </div>
      {count > MAX_CAPSULES && <p className="muted small gacha__more">…외 {count - MAX_CAPSULES}개</p>}
      {winner && phase === 'open' && (
        <p className="gacha__prize" style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}>
          <span className="gacha__prizeIcon" aria-hidden="true">{categoryIcon(winner.category)}</span>
          <strong>{shortName(winner.name, 12)}</strong>
          <span className="gacha__prizeMeta">
            {winner.category} · 도보 {winner.walkMin}분
          </span>
        </p>
      )}
    </div>
  );
}
