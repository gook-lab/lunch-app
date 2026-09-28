/**
 * 슬롯.
 *
 * 이름들이 세로로 빠르게 흐르다가 당첨 칸에서 멈춘다. 가장 짧은 연출이라
 * "빨리 정하고 싶다" 는 날에 쓴다.
 *
 * 여기서도 결과는 winnerIndex 가 정한다 — 멈추는 위치를 계산할 뿐이다.
 */
import { useEffect, useState } from 'react';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const ITEM_H = 56;
const LOOPS = 6;

export function Slot({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  const [offset, setOffset] = useState(-ITEM_H);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const reduced = prefersReducedMotion();

    // 목록을 LOOPS 번 반복해 붙여 두고, 마지막 바퀴의 당첨 칸에서 멈춘다.
    // 창은 세 칸이고 가운데 칸이 프레임이므로, 당첨 칸을 가운데로 보내려면
    // 한 칸만큼 덜 올려야 한다. 이걸 빼먹으면 당첨이 맨 위에 걸린다.
    const target = (reduced ? 0 : LOOPS * count) + winnerIndex;
    setAnimating(!reduced);
    setOffset((target - 1) * ITEM_H);

    const timer = window.setTimeout(() => {
      setAnimating(false);
      onSpinEnd();
    }, reduced ? 0 : SPIN_MS.slot);
    return () => window.clearTimeout(timer);
  }, [spinning, winnerIndex, count, onSpinEnd]);

  if (count === 0) return <div className="slot slot--empty" />;

  // 반복 목록. 멈춘 뒤에도 같은 칸이 보이도록 넉넉히 붙인다.
  const reel = Array.from({ length: LOOPS + 3 }, () => candidates).flat();

  return (
    <div className="slot" role="img" aria-label={`후보 ${count}곳`}>
      <div className="slot__window">
        <div
          className="slot__reel"
          style={{
            transform: `translateY(${-offset}px)`,
            transitionDuration: animating ? `${SPIN_MS.slot}ms` : '0ms',
          }}
        >
          {reel.map((place, i) => (
            <div key={`${place.id}-${i}`} className="slot__item" style={{ height: ITEM_H }}>
              <span>{place.name}</span>
              <span className="slot__meta">도보 {place.walkMin}분</span>
            </div>
          ))}
        </div>
      </div>
      <div className="slot__frame" aria-hidden="true" />
    </div>
  );
}
