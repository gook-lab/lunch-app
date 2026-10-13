/**
 * 꽃가루 — 결과 모달이 처음 뜰 때 한 번 터진다. "결과 보기" 로 다시 열 땐 안 터진다.
 * 색은 MODUL 강조색 램프에서 고른다. 1.6초 뒤 스스로 걷힌다.
 */
import { useEffect, useMemo, useState } from 'react';
import { seededRandom } from '../lib/random';

const COLORS = [
  'var(--color-accent)',
  'var(--color-accent-300)',
  'var(--color-accent-2)',
  'var(--color-accent-2-300)',
  'var(--color-neutral-900)',
  'var(--color-neutral-300)',
];
const COUNT = 42;
const LIFE_MS = 1600;

export function Confetti({ seed }: { seed: number }) {
  const [live, setLive] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setLive(false), LIFE_MS);
    return () => window.clearTimeout(t);
  }, []);
  const bits = useMemo(() => {
    const r = seededRandom(seed * 7 + 3);
    return Array.from({ length: COUNT }, (_, i) => ({
      color: COLORS[i % COLORS.length],
      // 가운데 위에서 양옆으로 퍼졌다가 떨어진다.
      dx: Math.round((r() - 0.5) * 360),
      up: Math.round(80 + r() * 140),
      rot: Math.round((r() - 0.5) * 1080),
      delay: Math.round(r() * 120),
      w: r() > 0.5 ? 8 : 5,
      round: r() > 0.7,
    }));
  }, [seed]);
  if (!live) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className={b.round ? 'confetti__bit confetti__bit--round' : 'confetti__bit'}
          style={
            {
              background: b.color,
              width: b.w,
              '--dx': `${b.dx}px`,
              '--up': `${-b.up}px`,
              '--rot': `${b.rot}deg`,
              animationDelay: `${b.delay}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
