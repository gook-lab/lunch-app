/**
 * 풍선 터뜨리기 — 가게마다 색 풍선이 떠 있고, 하나씩 "펑" 터져 하나만 남는다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 당첨 풍선은 터지지 않고, 나머지를 터뜨릴
 * 순서와 시각은 lib/balloon.ts 의 popOrder 가 판 번호(run) 시드로 정한다.
 * 마지막 풍선이 남으면 그 풍선이 커지며 반짝이고, 잠깐 뒤 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useState } from 'react';
import { shortName } from '../../lib/name';
import { balloonColumns, popOrder } from '../../lib/balloon';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfxLater, type SfxName } from '../../lib/sfx';

interface BalloonState {
  run: number;
  /** 터진 풍선 인덱스. */
  popped: number[];
  done: boolean;
}

/** 마지막 풍선이 터진 뒤 남은 풍선이 커지기까지(터지는 효과가 끝날 틈). */
const SETTLE_MS = 250;
/** 남은 풍선이 커지고 반짝인 뒤 끝내기까지. */
const SHINE_MS = 600;
/** 조각 수. 터질 때 사방으로 튄다. */
const SHARDS = 6;
/** 칸 높이 ÷ 칸 폭. 풍선·줄·이름표가 들어가는 세로 비율이다(App.css 의 aspect-ratio 와 같다). */
const CELL_TALL = 1.45;

export function Balloon({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [state, setState] = useState<BalloonState>({ run: -1, popped: [], done: false });

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const others = Array.from({ length: count }, (_, i) => i).filter((i) => i !== winnerIndex);

    if (prefersReducedMotion()) {
      setState({ run, popped: others, done: true });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 풍선이 안 터진다.
    setState({ run, popped: [], done: false });

    const pops = popOrder(count, winnerIndex, seededRandom(run));
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));

    pops.forEach(({ index, delayMs }) => {
      at(delayMs, () => setState((s) => (s.run === run ? { ...s, popped: [...s.popped, index] } : s)));
    });
    const lastMs = pops.at(-1)?.delayMs ?? 0;
    at(lastMs + SETTLE_MS, () => setState((s) => (s.run === run ? { ...s, done: true } : s)));
    at(lastMs + SETTLE_MS + SHINE_MS, onSpinEnd);

    const stopSfx = sfxLater(pops.map(({ delayMs }): [number, SfxName] => [delayMs, 'burst']));
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="balloon balloon--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 당첨 하나만 남은 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const popped = new Set(live ? state.popped : settled ? candidates.map((_, i) => i).filter((i) => i !== winnerIndex) : []);
  const done = live ? state.done : settled;
  const left = count - popped.size;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const cols = balloonColumns(count);
  const rows = Math.ceil(count / cols);
  // 글자 수는 넉넉히 두고, 칸보다 길면 CSS 말줄임이 자른다.
  const nameMax = expanded ? 12 : 8;

  const status =
    done && winner
      ? `${shortName(winner.name, 12)}만 남았어요!`
      : live || spinning
        ? `풍선이 터지고 있어요… 남은 풍선 ${left}개`
        : `풍선 ${count}개 중 하나만 남아요`;

  return (
    <div
      className={['balloon', expanded ? 'balloon--big' : '', settled ? 'balloon--settled' : ''].filter(Boolean).join(' ')}
      // 판의 폭 ÷ 높이. 칸 하나가 폭 1 · 높이 CELL_TALL 이다. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': (cols / (rows * CELL_TALL)).toFixed(4) } as React.CSSProperties}
    >
      <div
        className="balloon__board"
        role="img"
        aria-label={`풍선 터뜨리기 판, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}
      >
        {candidates.map((p, i) => {
          const isPopped = popped.has(i);
          const isWin = done && i === winnerIndex;
          return (
            <div
              key={p.id}
              title={p.name}
              className={['balloon__item', isPopped ? 'balloon__item--popped' : '', isWin ? 'balloon__item--win' : '']
                .filter(Boolean)
                .join(' ')}
              // 이웃끼리 색이 겹치지 않게 황금각(137.5°)씩 돌린다. 흔들림 박자도 풍선마다 어긋나게.
              style={{ '--hue': Math.round((i * 137.5 + 20) % 360), '--i': i } as React.CSSProperties}
            >
              <span className="balloon__float" aria-hidden="true">
                <span className="balloon__body" />
                <span className="balloon__string" />
                {isPopped && (
                  <span className="balloon__burst">
                    {Array.from({ length: SHARDS }, (_, k) => (
                      <span key={k} className="balloon__shard" style={{ '--a': `${k * (360 / SHARDS) + 15}deg` } as React.CSSProperties} />
                    ))}
                  </span>
                )}
              </span>
              <span className="balloon__tag" aria-hidden="true">
                {shortName(p.name, nameMax)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="balloon__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
