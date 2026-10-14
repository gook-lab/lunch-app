/**
 * 슬롯.
 *
 * 이름들이 세로로 빠르게 흐르다가 당첨 칸에서 멈춘다. 가장 짧은 연출이라
 * "빨리 정하고 싶다" 는 날에 쓴다.
 *
 * 여기서도 결과는 winnerIndex 가 정한다 — 멈추는 위치를 계산할 뿐이다.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { slotReelCopies, slotStops } from '../../lib/spin';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { followTicks, readTranslateY } from '../../lib/sfx';

const ITEM_H = 56;
/** 크게 보기에서 한 줄 높이. 창은 늘 세 줄이라 창 높이도 같이 바뀐다. */
const ITEM_H_BIG = 84;
/**
 * 데스크톱(960px~)은 다섯 줄을 72px 로 보여 준다. 56px 세 줄은 600×420 판의 절반이 비었고,
 * 80px 세 줄로 키워도 "너무 작다" 였다(10/9 사용자). 줄이 많아야 릴이 도는 게 보인다.
 */
const ITEM_H_WIDE = 72;
const ROWS_WIDE = 5;
const LOOPS = 6;

const WIDE = '(min-width: 960px)';
const isWide = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches === true;
/** 창 폭이 960px 을 넘나들면(회전·창 크기) 다시 그린다. */
const subscribeWide = (cb: () => void) => {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(WIDE) : undefined;
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};

export function Slot({ candidates, winnerIndex, spinning, onSpinEnd, expanded = false }: GameProps) {
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const big = wide && !expanded;
  const itemH = expanded ? ITEM_H_BIG : big ? ITEM_H_WIDE : ITEM_H;
  const rows = big ? ROWS_WIDE : 3;
  /** 가운데 줄 번호. 위로 이만큼 줄이 더 보인다. */
  const center = (rows - 1) / 2;
  const count = candidates.length;
  /** 가운데 칸에 보이는, 이어 붙인 목록에서의 인덱스. */
  const [idx, setIdx] = useState(0);
  const idxRef = useRef(0);
  const reelRef = useRef<HTMLDivElement>(null);
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
    let stopTicks = () => {};
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setAnimating(true);
        put(target);
        // 칸이 창 가운데를 지날 때마다 딸깍. 릴의 실제 위치를 따라가 점점 느려진다.
        const step = reelRef.current?.firstElementChild?.getBoundingClientRect().height || ITEM_H;
        stopTicks = followTicks(reelRef.current, readTranslateY, step, SPIN_MS.slot);
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
      stopTicks();
    };
  }, [spinning, winnerIndex, count, onSpinEnd]);

  if (count === 0) return <div className="slot slot--empty" />;

  // 반복 목록. 되감기 덕분에 최대 인덱스는 (LOOPS + 2) * count 를 넘지 않는다.
  // 맨 위에 한 벌을 더 붙인다(pad). 다섯 줄 창은 가운데 위로 두 줄이 보여, 되감은
  // 자리(0~count-1)에서 위가 비지 않게 한다.
  const pad = count;
  const reel = Array.from({ length: slotReelCopies(LOOPS) + 1 }, () => candidates).flat();
  const landed = !animating && !spinning ? idx + pad : -1;

  return (
    <div className={big ? 'slot slot--wide' : 'slot'} role="img" aria-label={`고를 가게 ${count}곳`}>
      <div className="slot__window" style={{ height: itemH * rows }}>
        <div
          ref={reelRef}
          aria-hidden="true"
          className="slot__reel"
          style={{
            transform: `translateY(${(center - idx - pad) * itemH}px)`,
            transitionDuration: animating ? `${SPIN_MS.slot}ms` : '0ms',
          }}
        >
          {reel.map((place, i) => (
            <div
              key={`${place.id}-${i}`}
              className={i === landed ? 'slot__item slot__item--win' : 'slot__item'}
              style={{ height: itemH }}
            >
              <span>{place.name}</span>
              <span className="slot__meta">도보 {place.walkMin}분</span>
            </div>
          ))}
        </div>
      </div>
      <div className="slot__frame" aria-hidden="true" style={{ top: center * itemH, height: itemH }} />
    </div>
  );
}
