/**
 * 카드 뒤집기 — 엎어 둔 카드 중 하나를 고르면 뒤집힌다.
 *
 * 당첨은 카드가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * 여기서는 고른 카드에 그 당첨을 놓고 나머지 카드를 섞어 연다
 * (lib/ladder.ts revealSlots — 사다리와 같은 논리). 카드는 열릴 때까지 전부
 * 가려져 있으므로, 미리 섞어 엎어 둔 것과 확률이 같다. 어느 카드를 고르든
 * 당첨 확률은 그대로다.
 *
 * 순서: 섞기(흔들림) → 고른 카드가 뒤집힘 → 나머지가 차례로 뒤집힘.
 */
import { categoryLabel } from '../../lib/category';
import { useEffect, useState } from 'react';
import { revealSlots } from '../../lib/ladder';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { sfxLater } from '../../lib/sfx';

type Phase = 'idle' | 'shuffle' | 'lift' | 'picked' | 'all';

interface Shown {
  run: number;
  phase: Phase;
}

/**
 * 단계가 바뀌는 시각(연출 길이 대비). 마지막 단계가 끝나면 onSpinEnd.
 * 섞기 → 고른 카드가 들썩이며 뜸 들이기(lift) → 고른 카드 뒤집기 → 나머지.
 * 예전엔 0.7초 만에 고른 카드가 바로 열려 결과가 너무 일찍 나왔다(10/9 손맛 리뷰 6점).
 */
const LIFT_AT = 0.25;
const PICKED_AT = 0.5;
const ALL_AT = 0.75;

export function Cards({
  candidates,
  winnerIndex,
  spinning,
  run,
  onSpinEnd,
  onRequestSpin,
  expanded = false,
}: GameProps) {
  const count = candidates.length;
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown>({ run: -1, phase: 'idle' });

  // 실행 단추로 시작해 카드를 안 골랐으면 판 번호로 한 장 고른다.
  const effectivePick = picked ?? (winnerIndex === null ? null : Math.floor(seededRandom(run)() * Math.max(count, 1)));
  const slots =
    effectivePick === null || winnerIndex === null
      ? null
      : revealSlots(count, effectivePick, winnerIndex, seededRandom(run + 1));
  const phase: Phase = shown.run === run ? shown.phase : winnerIndex === null ? 'idle' : 'shuffle';

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion()) {
      setShown({ run, phase: 'all' });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    setShown({ run, phase: 'shuffle' });
    const timers = [
      window.setTimeout(() => setShown({ run, phase: 'lift' }), SPIN_MS.cards * LIFT_AT),
      window.setTimeout(() => setShown({ run, phase: 'picked' }), SPIN_MS.cards * PICKED_AT),
      window.setTimeout(() => setShown({ run, phase: 'all' }), SPIN_MS.cards * ALL_AT),
      window.setTimeout(onSpinEnd, SPIN_MS.cards),
    ];
    // 섞기 → 고른 카드 들기 → 뒤집기 → 나머지 뒤집기.
    const stopSfx = sfxLater([
      [0, 'shuffle'],
      [SPIN_MS.cards * LIFT_AT, 'tap'],
      [SPIN_MS.cards * PICKED_AT, 'flip'],
      [SPIN_MS.cards * ALL_AT, 'flip'],
      [SPIN_MS.cards * ALL_AT + 90, 'flip'],
    ]);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="cards cards--empty" />;

  const pick = (i: number) => {
    if (spinning) return;
    setPicked(i);
    onRequestSpin?.();
  };

  const isOpen = (i: number) => slots !== null && (phase === 'all' || (phase === 'picked' && i === effectivePick));

  return (
    <div className={expanded ? 'cards cards--big' : 'cards'}>
      <p className="muted small cards__hint">
        {winnerIndex === null || phase === 'idle'
          ? `카드 ${count}장 중 한 장을 골라 주세요. 고른 카드부터 뒤집혀요.`
          : phase === 'all'
            ? '모든 카드를 뒤집었어요.'
            : phase === 'picked'
              ? '고른 카드를 뒤집었어요. 나머지도 뒤집어 볼게요.'
              : phase === 'lift'
                ? '고른 카드를 뒤집을게요…'
                : '카드를 섞고 있어요…'}
      </p>
      <ul
        className={
          phase === 'shuffle'
            ? 'cards__grid cards__grid--shuffle'
            : phase === 'all' && slots !== null
              ? 'cards__grid cards__grid--done'
              : 'cards__grid'
        }
      >
        {candidates.map((_, i) => {
          const open = isOpen(i);
          const place = open && slots ? candidates[slots[i]] : null;
          const mine = i === effectivePick && winnerIndex !== null;
          const win = open && slots !== null && slots[i] === winnerIndex;
          const lift = mine && phase === 'lift';
          const cls = [
            'cards__card',
            open ? 'cards__card--open' : '',
            mine ? 'cards__card--mine' : '',
            lift ? 'cards__card--lift' : '',
            win ? 'cards__card--win' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={i} style={{ '--i': i } as React.CSSProperties}>
              <button
                type="button"
                className={cls}
                onClick={() => pick(i)}
                disabled={spinning}
                aria-label={place ? `${i + 1}번 카드: ${place.name}` : `${i + 1}번 카드 고르기`}
              >
                <span className="cards__face cards__face--back" aria-hidden="true">
                  <span className="cards__num">{i + 1}</span>
                </span>
                <span className="cards__face cards__face--front" aria-hidden="true">
                  {place && (
                    <>
                      <strong>{shortName(place.name, 10)}</strong>
                      <span>
                        {categoryLabel(place)} · {place.walkMin}분
                      </span>
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
