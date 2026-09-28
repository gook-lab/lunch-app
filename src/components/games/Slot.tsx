/**
 * 슬롯.
 *
 * 이름들이 세로로 빠르게 흐르다가 당첨 칸에서 멈춘다. 가장 짧은 연출이라
 * "빨리 정하고 싶다" 는 날에 쓴다.
 *
 * 여기서도 결과는 winnerIndex 가 정한다 — 멈추는 위치를 계산할 뿐이다.
 */
import { useEffect, useRef, useState } from 'react';
import { slotReelCopies, slotStops } from '../../lib/spin';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';

const ITEM_H = 56;
const LOOPS = 6;

export function Slot({ candidates, winnerIndex, spinning, onSpinEnd }: GameProps) {
  const count = candidates.length;
  /** 가운데 칸에 보이는, 이어 붙인 목록에서의 인덱스. */
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const [animating, setAnimating] = useState(false);

  const put = (v: number) => {
    idxRef.current = v;
    setIdx(v);
  };

  // 후보가 바뀌면 릴을 처음으로 되돌린다.
  useEffect(() => {
    setAnimating(false);
    put(0);
  }, [count]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    if (prefersReducedMotion()) {
      setAnimating(false);
      put(winnerIndex);
      onSpinEnd();
      return;
    }

    // 되감을 위치와 멈출 위치는 lib/spin.ts 가 계산한다 (slotStops 참고 —
    // 절대값으로 잡으면 두 판째부터 릴이 서는 이유가 거기 적혀 있다).
    const { home, target } = slotStops(idxRef.current, winnerIndex, count, LOOPS);

    setAnimating(false);
    put(home);

    // 되감은 위치가 화면에 한 번 반영된 뒤에 애니메이션을 걸어야 한다.
    // 같은 프레임에 둘 다 바꾸면 브라우저가 되감기를 건너뛰고 이어서 돈다.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setAnimating(true);
        put(target);
      });
    });

    const timer = window.setTimeout(() => {
      setAnimating(false);
      onSpinEnd();
    }, SPIN_MS.slot);

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      window.clearTimeout(timer);
    };
  }, [spinning, winnerIndex, count, onSpinEnd]);

  if (count === 0) return <div className="slot slot--empty" />;

  // 반복 목록. 되감기 덕분에 최대 인덱스는 (LOOPS + 2) * count 를 넘지 않는다.
  const reel = Array.from({ length: slotReelCopies(LOOPS) }, () => candidates).flat();
  const landed = !animating && !spinning ? idx : -1;

  return (
    <div className="slot" role="img" aria-label={`후보 ${count}곳`}>
      <div className="slot__window">
        <div
          className="slot__reel"
          style={{
            transform: `translateY(${(1 - idx) * ITEM_H}px)`,
            transitionDuration: animating ? `${SPIN_MS.slot}ms` : '0ms',
          }}
        >
          {reel.map((place, i) => (
            <div
              key={`${place.id}-${i}`}
              className={i === landed ? 'slot__item slot__item--win' : 'slot__item'}
              style={{ height: ITEM_H }}
            >
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
