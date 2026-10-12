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

  // 돔 안 캡슐: 후보 카테고리 색을 판 번호로 섞어 흩어 놓는다. 이름은 없다.
  const capsules = useMemo(() => {
    const r = seededRandom(run + 11);
    const hues = candidates.slice(0, MAX_CAPSULES).map((p) => categoryHue(p.category));
    for (let i = hues.length - 1; i > 0; i -= 1) {
      const j = Math.floor(r() * (i + 1));
      [hues[i], hues[j]] = [hues[j], hues[i]];
    }
    // 해바라기 배치(황금각) — 돔 안에 고르게 퍼진다.
    return hues.map((hue, i) => {
      const t = (i + 0.5) / hues.length;
      const rad = Math.sqrt(t) * 36;
      const a = i * 2.39996;
      return { hue, x: 50 + Math.cos(a) * rad, y: 52 + Math.sin(a) * rad * 0.9, tilt: Math.round((r() - 0.5) * 80) };
    });
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
          {capsules.map((c, i) => (
            <span
              key={i}
              className="gacha__capsule"
              style={
                {
                  '--cat-hue': c.hue,
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  rotate: `${c.tilt}deg`,
                  '--i': i,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        <div className="gacha__body">
          <span className="gacha__handle" />
          <span className="gacha__chute">
            {winner && phase !== 'idle' && phase !== 'shake' && (
              <span
                className="gacha__capsule gacha__capsule--out"
                style={{ '--cat-hue': categoryHue(winner.category) } as React.CSSProperties}
              />
            )}
          </span>
        </div>
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
