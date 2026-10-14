/**
 * 토너먼트 — 후보끼리 대진표를 짜 한 판씩 붙는다.
 *
 * 우승은 대진표가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * lib/tournament.ts 가 그 가게가 모든 경기를 이기는 대진표를 만든다. 대진
 * 순서와 다른 경기 결과만 판 번호(run)로 섞는다.
 *
 * 시작 전에 "응원할 가게" 를 고를 수 있다. 응원은 결과에 아무 영향이 없고,
 * 끝난 뒤 그 가게가 어디까지 갔는지 알려 줄 뿐이다.
 *
 * 순서: 판마다 대진을 보여 주고(match) → 승패를 가른다(result). 마지막에 우승.
 * 뒤 판일수록 오래 보여 준다(stepStarts) — 결승에서 긴장이 쌓이게.
 */
import { categoryLabel } from '../../lib/category';
import { useEffect, useMemo, useState } from 'react';
import { withJosa } from '../../lib/josa';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { buildBracket, reachedRound, roundName, stepStarts, type Entry } from '../../lib/tournament';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { sfxLater, type SfxName } from '../../lib/sfx';

interface Shown {
  run: number;
  /** 2r = r 번째 판 대진, 2r+1 = 그 판 결과. 마지막 값이면 우승까지 다 보인다. */
  step: number;
}

export function Tournament({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [cheer, setCheer] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown>({ run: -1, step: -1 });

  const bracket = useMemo(
    () => (winnerIndex === null ? null : buildBracket(count, winnerIndex, seededRandom(run + 7))),
    [count, winnerIndex, run],
  );
  // 경기가 있는 판만 센다. 마지막 판([우승])은 결과를 보여 줄 대진이 없다.
  const matchRounds = bracket ? bracket.rounds.length - 1 : 0;
  const lastStep = matchRounds * 2;
  const step = shown.run === run ? shown.step : bracket ? 0 : -1;
  const done = bracket !== null && step >= lastStep;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0 || !bracket) return;
    if (prefersReducedMotion() || matchRounds === 0) {
      setShown({ run, step: lastStep });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    setShown({ run, step: 0 });
    const starts = stepStarts(matchRounds, SPIN_MS.tournament);
    const timers: number[] = [];
    for (let s = 1; s <= lastStep; s += 1) {
      timers.push(window.setTimeout(() => setShown({ run, step: s }), starts[s]));
    }
    timers.push(window.setTimeout(onSpinEnd, SPIN_MS.tournament));
    // 경기가 붙을 때 챙, 이긴 쪽이 올라갈 때 발소리.
    const stopSfx = sfxLater(
      Array.from({ length: lastStep }, (_, k): [number, SfxName] => [
        starts[k + 1],
        (k + 1) % 2 === 1 ? 'clash' : 'step',
      ]),
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, bracket, matchRounds, lastStep]);

  if (count === 0) return <div className="tour tour--empty" />;

  const name = (e: Entry) => (e === null ? '부전승' : shortName(candidates[e].name, 10));

  // 아직 안 돌렸으면 응원할 가게 고르기 판.
  if (!bracket || step < 0) {
    return (
      <div className={expanded ? 'tour tour--big' : 'tour'}>
        <p className="muted small tour__hint">
          {cheer === null
            ? '응원할 가게를 하나 골라 보세요. 응원은 결과에 영향이 없어요.'
            : `📣 ${withJosa(candidates[cheer].name, '을/를')} 응원해요. 대진은 시작할 때 섞어요.`}
        </p>
        <ul className="tour__entries">
          {candidates.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                className={i === cheer ? 'tour__entry tour__entry--cheer' : 'tour__entry'}
                aria-pressed={i === cheer}
                onClick={() => setCheer(i === cheer ? null : i)}
              >
                {i === cheer && <span aria-hidden="true">📣 </span>}
                {shortName(p.name, 10)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const r = Math.min(Math.floor(step / 2), matchRounds - 1);
  const resolved = done || step % 2 === 1;
  const round = bracket.rounds[Math.max(r, 0)];
  const next = bracket.rounds[Math.max(r, 0) + 1] ?? [];
  const champion = winnerIndex === null ? null : candidates[winnerIndex];

  let cheerLine = '';
  if (done && cheer !== null) {
    const reached = reachedRound(bracket, cheer);
    cheerLine =
      cheer === winnerIndex
        ? `📣 응원한 ${withJosa(candidates[cheer].name, '이/가')} 우승했어요!`
        : `📣 응원한 ${withJosa(candidates[cheer].name, '은/는')} ${roundName(bracket.rounds[reached].length)}에서 멈췄어요.`;
  }

  return (
    <div className={expanded ? 'tour tour--big' : 'tour'}>
      <ol className="tour__steps" aria-label="진행">
        {bracket.rounds.slice(0, -1).map((rd, i) => (
          <li
            key={i}
            className={
              i < r || done ? 'tour__step tour__step--past' : i === r ? 'tour__step tour__step--now' : 'tour__step'
            }
            aria-current={i === r && !done ? 'step' : undefined}
          >
            {roundName(rd.length)}
          </li>
        ))}
        <li className={done ? 'tour__step tour__step--now' : 'tour__step'}>🏆</li>
      </ol>

      {done && champion ? (
        <div className="tour__champion">
          <span aria-hidden="true">🏆</span>
          <strong>{champion.name}</strong>
          <span className="muted small">
            {matchRounds}판 전승 · {categoryLabel(champion)} · 도보 {champion.walkMin}분
          </span>
        </div>
      ) : (
        <ul className="tour__matches" aria-label={`${roundName(round.length)} 대진`}>
          {Array.from({ length: round.length / 2 }, (_, m) => {
            const a = round[2 * m];
            const b = round[2 * m + 1];
            const w = next[m];
            const cls = (e: Entry) =>
              [
                'tour__side',
                e === null && 'tour__side--bye',
                resolved && e !== null && e === w && 'tour__side--win',
                resolved && e !== null && e !== w && 'tour__side--lose',
                e !== null && e === cheer && 'tour__side--cheer',
              ]
                .filter(Boolean)
                .join(' ');
            return (
              <li key={m} className="tour__match">
                <span className={cls(a)}>{name(a)}</span>
                <span className="tour__vs" aria-hidden="true">
                  vs
                </span>
                <span className={cls(b)}>{name(b)}</span>
                {resolved && w !== null && <span className="sr-only">, {name(w)} 승</span>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="muted small tour__hint">
        {done
          ? cheerLine || `${count}곳 토너먼트가 끝났어요.`
          : resolved
            ? '이긴 가게가 다음 판으로 가요.'
            : `${roundName(round.length)} 시작!`}
      </p>
    </div>
  );
}
