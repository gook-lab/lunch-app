/**
 * 짝 맞추기 — 두 장씩 뒤집어 짝을 맞춘 가게는 탈락, 끝까지 남은 짝이 오늘 점심.
 *
 * 당첨은 카드가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * 카드 앞면은 뒤집는 순간 정해진다(lib/memory.ts). 당첨 짝은 마지막까지 안
 * 뒤집힌 두 장이 된다. 어느 카드를 고르든, 얼마나 잘 기억하든 결과는 같다.
 *
 * 카드를 눌러 시작하면 직접 뒤집고, 실행 단추로 시작하면 알아서 뒤집는다.
 * 직접 하다가 "나머지 자동으로" 로 넘길 수 있다.
 */
import { useEffect, useRef, useState } from 'react';
import { categoryIcon } from '../../lib/category';
import {
  assignCard,
  autoFirst,
  autoSecond,
  isSettled,
  memoryPlaces,
  MEMORY_PAIRS,
  settle,
  type Faces,
} from '../../lib/memory';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfx } from '../../lib/sfx';

interface Board {
  run: number;
  places: number[];
  faces: Faces;
  /** 짝을 맞춰 탈락한 카드. */
  out: boolean[];
  /** 이번 턴에 뒤집힌 카드(최대 2장). */
  open: number[];
  auto: boolean;
  done: boolean;
  /** 방금 일어난 일. 화면낭독기에 읽힌다. */
  say: string;
}

/** 짝이면 잠깐 보여 주고 탈락, 아니면 조금 더 보여 주고 덮는다. */
const MATCH_MS = 650;
// 틀린 두 장을 보여 주는 시간. 950ms 는 판이 길어질수록 늘어져 800ms 로 줄였다 — 외울 틈은 남긴다(10/15).
const MISS_MS = 800;
/** 자동 진행에서 한 장 뒤집는 간격. */
const AUTO_MS = 420;
/** 마지막 장면(남은 짝이 열리는 순간)을 볼 틈. */
const DONE_MS = 1300;

/** 줄마다 같은 장수가 되게 열 수를 고른다. 2·4·6·8·10·12장 → 2·4·3·4·5·4열. */
function columns(cards: number): number {
  if (cards % 4 === 0) return 4;
  if (cards % 5 === 0) return 5;
  return cards === 2 ? 2 : 3;
}

export function Memory({
  candidates,
  winnerIndex,
  spinning,
  run,
  onSpinEnd,
  onRequestSpin,
  onActivity,
  expanded = false,
}: GameProps) {
  const count = candidates.length;
  const cardCount = Math.min(count, MEMORY_PAIRS) * 2;
  const [board, setBoard] = useState<Board | null>(null);
  const ref = useRef<Board | null>(null);
  const random = useRef<() => number>(Math.random);
  const firstPick = useRef<number | null>(null);

  const commit = (next: Board) => {
    ref.current = next;
    setBoard(next);
  };

  const finish = (b: Board) => {
    if (winnerIndex === null) return;
    commit({
      ...b,
      faces: settle(b.faces, winnerIndex),
      out: b.faces.map((_, i) => b.out[i] || (b.faces[i] !== null && b.faces[i] !== winnerIndex)),
      open: [],
      done: true,
      say: `끝까지 남은 짝은 ${candidates[winnerIndex]?.name ?? ''}이에요.`,
    });
  };

  const flip = (i: number) => {
    const b = ref.current;
    if (!b || b.done || winnerIndex === null || b.open.length >= 2 || b.out[i] || b.open.includes(i)) return;
    const faces =
      b.faces[i] === null
        ? b.faces.map((f, k) => (k === i ? assignCard(b.faces, b.places, winnerIndex, random.current) : f))
        : b.faces;
    const name = candidates[faces[i] as number]?.name ?? '';
    commit({ ...b, faces, open: [...b.open, i], say: `${i + 1}번 카드는 ${name}이에요.` });
    sfx('flip');
    onActivity?.();
  };

  // 새 판: 실행되면 판을 깔고, 카드를 눌러 시작했으면 그 카드부터 뒤집는다.
  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (ref.current?.run === run) return;
    const r = seededRandom(run);
    random.current = seededRandom(run + 1);
    const places = memoryPlaces(count, winnerIndex, r);
    const start = firstPick.current;
    firstPick.current = null;
    const b: Board = {
      run,
      places,
      faces: Array(places.length * 2).fill(null),
      out: Array(places.length * 2).fill(false),
      open: [],
      auto: start === null,
      done: false,
      say: '',
    };
    if (prefersReducedMotion() || isSettled(b.faces)) {
      finish(b);
      return;
    }
    commit(b);
    if (start !== null && start < b.faces.length) flip(start);
    // flip·finish 는 매 렌더 새로 만들어지지만 ref 로 최신 판을 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, winnerIndex, run, count]);

  // 두 장이 열리면 짝인지 보고, 판이 굳었으면 마무리한다.
  useEffect(() => {
    if (!board || board.done || board.open.length < 2) return;
    const [a, c] = board.open;
    const hit = board.faces[a] === board.faces[c];
    const t = window.setTimeout(
      () => {
        const b = ref.current;
        if (!b) return;
        const name = candidates[b.faces[a] as number]?.name ?? '';
        const out = hit ? b.out.map((o, i) => o || i === a || i === c) : b.out;
        sfx(hit ? 'match' : 'tap');
        const next = {
          ...b,
          out,
          open: [],
          say: hit ? `${name} 짝을 맞췄어요. 이번 판에서 빠져요.` : '짝이 아니에요. 다시 덮을게요.',
        };
        if (isSettled(next.faces)) finish(next);
        else commit(next);
      },
      hit ? MATCH_MS : MISS_MS,
    );
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  // 자동 진행: 한 장씩 뒤집는다.
  useEffect(() => {
    if (!board || board.done || !board.auto || board.open.length >= 2) return;
    const t = window.setTimeout(() => {
      const b = ref.current;
      if (!b) return;
      flip(
        b.open.length === 0
          ? autoFirst(b.faces, b.out, random.current)
          : autoSecond(b.faces, b.out, b.open[0], random.current),
      );
    }, AUTO_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board]);

  // 마무리 장면을 보여 주고 끝을 알린다.
  useEffect(() => {
    if (!spinning || !board?.done || board.run !== run) return;
    const t = window.setTimeout(onSpinEnd, prefersReducedMotion() ? 0 : DONE_MS);
    return () => window.clearTimeout(t);
  }, [spinning, board, run, onSpinEnd]);

  if (count === 0) return <div className="memory memory--empty" />;

  const live = board !== null && board.run === run && winnerIndex !== null;
  const cards = live ? board.faces.length : cardCount;

  const press = (i: number) => {
    if (!spinning) {
      firstPick.current = i;
      onRequestSpin?.();
      return;
    }
    if (board?.auto) return;
    flip(i);
  };

  const hint = !live
    ? `카드를 두 장씩 뒤집어 같은 가게를 찾아요. 찾은 가게는 빠지고, 마지막까지 남은 가게가 오늘 점심이에요.`
    : board.done
      ? '남은 짝이 오늘 점심이에요.'
      : board.auto
        ? '카드를 뒤집고 있어요…'
        : board.open.length === 1
          ? '한 장 더 골라 주세요.'
          : '카드 두 장을 골라 주세요.';

  return (
    <div className={expanded ? 'memory memory--big' : 'memory'}>
      <p className="muted small memory__hint">{hint}</p>
      {live && (
        <ul className="memory__left" aria-label="남아 있는 가게">
          {board.places.map((p) => {
            const gone = board.faces.some((f, i) => f === p && board.out[i]);
            const win = board.done && p === winnerIndex;
            return (
              <li
                key={p}
                className={
                  win ? 'memory__chip memory__chip--win' : gone ? 'memory__chip memory__chip--out' : 'memory__chip'
                }
              >
                {shortName(candidates[p]?.name ?? '', 8)}
                {gone && <span className="sr-only">, 탈락</span>}
              </li>
            );
          })}
        </ul>
      )}
      <ul
        className={live && board.done ? 'memory__grid memory__grid--done' : 'memory__grid'}
        style={{ '--cols': columns(cards), '--cols-big': cards % 6 === 0 ? 6 : columns(cards) } as React.CSSProperties}
      >
        {Array.from({ length: cards }, (_, i) => {
          const face = live ? board.faces[i] : null;
          const shown = live && face !== null && (board.open.includes(i) || board.out[i] || board.done);
          const place = shown ? candidates[face as number] : null;
          const out = live && board.out[i];
          const win = live && board.done && face === winnerIndex;
          // 끝난 판의 카드를 누르면 새 판이 시작된다.
          const locked =
            spinning && live && (board.auto || board.done || out || board.open.includes(i) || board.open.length >= 2);
          const cls = [
            'memory__card',
            shown ? 'memory__card--open' : '',
            out ? 'memory__card--out' : '',
            win ? 'memory__card--win' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <li key={i}>
              <button
                type="button"
                className={cls}
                onClick={() => press(i)}
                disabled={locked || (spinning && !live)}
                aria-label={
                  place
                    ? `${i + 1}번 카드: ${place.name}${win ? ', 남은 짝' : out ? ', 탈락' : ''}`
                    : `${i + 1}번 카드 뒤집기`
                }
              >
                <span className="memory__face memory__face--back" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="memory__face memory__face--front" aria-hidden="true">
                  {place && (
                    <>
                      <span className="memory__icon">{categoryIcon(place.sub ?? place.category)}</span>
                      <strong>{shortName(place.name, 8)}</strong>
                      {out && !win && <span className="memory__tag">탈락</span>}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {live && !board.done && !board.auto && (
        <button
          type="button"
          className="linkish memory__auto"
          onClick={() => ref.current && commit({ ...ref.current, auto: true })}
        >
          나머지 자동으로
        </button>
      )}
      <p className="sr-only" aria-live="polite">
        {live ? board.say : ''}
      </p>
    </div>
  );
}
