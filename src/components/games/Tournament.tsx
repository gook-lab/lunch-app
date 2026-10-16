/**
 * 토너먼트 — 후보끼리 대진표를 짜 한 판씩 붙는다.
 *
 * 우승은 대진표가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex),
 * lib/tournament.ts 가 그 가게가 모든 경기를 이기는 대진표를 만든다. 대진 순서·다른 경기 결과·
 * 연출(어느 경기를 크게 볼지, 게이지가 어떻게 흔들릴지, 역전)은 판 번호(run) 시드로 섞는다.
 * 연출은 승패를 바꾸지 않는다 — 게이지는 언제나 이긴 쪽 끝으로 간다.
 *
 * 시작 전에 "응원할 가게" 를 고를 수 있다. 응원은 결과에 아무 영향이 없고,
 * 끝난 뒤 그 가게가 어디까지 갔는지 알려 줄 뿐이다.
 *
 * 순서: 앞 판들은 모든 경기가 한꺼번에 쾅 맞붙고(가끔 진 쪽이 먼저 앞서다 뒤집힌다),
 * 4강은 한 경기를 VS 컷신으로 크게, 결승은 눈싸움을 길게 한 뒤 힘겨루기 → K.O. → 트로피.
 */
import { categoryLabel } from '../../lib/category';
import { useEffect, useMemo, useState } from 'react';
import { withJosa } from '../../lib/josa';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import {
  buildBracket,
  reachedRound,
  realMatches,
  roundName,
  tournamentCues,
  tournamentPlan,
  type Cue,
  type Entry,
  type Feature,
} from '../../lib/tournament';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { tournbalSfxLater, type TournbalSfx } from '../../lib/sfx';
import type { SfxName } from '../../lib/sfx';
import './Tournament.css';

interface Shown {
  run: number;
  /** cues 의 몇 번째 단계까지 왔나. */
  k: number;
}

/** 트로피 둘레 꽃가루 조각 수. */
const CONFETTI = 18;

export function Tournament({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [cheer, setCheer] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown>({ run: -1, k: -1 });

  const bracket = useMemo(
    () => (winnerIndex === null ? null : buildBracket(count, winnerIndex, seededRandom(run + 7))),
    [count, winnerIndex, run],
  );
  const plan = useMemo(() => (bracket ? tournamentPlan(bracket, seededRandom(run * 13 + 5), SPIN_MS.tournament) : null), [bracket, run]);
  const cues = useMemo(() => (plan ? tournamentCues(plan) : []), [plan]);
  // 경기가 있는 판만 센다. 마지막 판([우승])은 결과를 보여 줄 대진이 없다.
  const matchRounds = bracket ? bracket.rounds.length - 1 : 0;

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0 || !plan) return;
    if (prefersReducedMotion() || matchRounds === 0) {
      setShown({ run, k: cues.length - 1 });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    // 이번 판을 시작한다. 이걸 빼면 아래 setShown 이 지난 판 단계에 머문다.
    setShown({ run, k: 0 });
    const timers: number[] = [];
    cues.forEach((c, k) => {
      if (k > 0) timers.push(window.setTimeout(() => setShown({ run, k }), c.atMs));
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, TournbalSfx | SfxName][] = [];
    for (const c of cues) {
      if (c.phase === 'clash') sounds.push([c.atMs, 'clash']);
      else if (c.phase === 'result') sounds.push([c.atMs, 'step']);
      else if (c.phase === 'slam') sounds.push([c.atMs + 120, 'slam'], [c.atMs + 300, 'zap']);
      else if (c.phase === 'stare') sounds.push([c.atMs + 200, 'heartbeat'], [c.atMs + 700, 'heartbeat']);
      else if (c.phase === 'shout') sounds.push([c.atMs, 'whoosh']);
      else if (c.phase === 'ko') sounds.push([c.atMs, 'ko']);
      else if (c.phase === 'trophy') sounds.push([c.atMs + 150, 'trophy']);
    }
    for (const rp of plan.rounds) {
      const f = rp.feature;
      if (!f) continue;
      // 힘겨루기 동안 챙챙 부딪친다.
      for (let t = f.fightMs + 60; t < f.koMs - 80; t += 240) sounds.push([t, 'clash']);
    }
    const stopSfx = tournbalSfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan, cues, matchRounds]);

  if (count === 0) return <div className="tour tour--empty" />;

  const name = (e: Entry, max = 10) => (e === null ? '부전승' : shortName(candidates[e].name, max));

  const live = shown.run === run && shown.k >= 0;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 트로피 장면을 움직임 없이 보인다.
  const settled = !live && !spinning && bracket !== null && plan !== null && cues.length > 0;
  const cue: Cue | null = live ? (cues[Math.min(shown.k, cues.length - 1)] ?? null) : settled ? cues[cues.length - 1] : spinning && cues.length ? cues[0] : null;

  // 아직 안 돌렸으면 응원할 가게 고르기 판.
  if (!bracket || !plan || !cue) {
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

  const done = cue.phase === 'trophy';
  const r = Math.max(0, Math.min(cue.round, matchRounds - 1));
  const rp = plan.rounds[r];
  const round = bracket.rounds[r];
  const next = bracket.rounds[r + 1] ?? [];
  const f: Feature | null = rp?.feature ?? null;
  const phase = cue.phase;
  const resolved = done || phase === 'result' || phase === 'ko' || phase === 'out';
  const clashing = phase === 'clash' || phase === 'fake' || phase === 'fight' || phase === 'shout' || phase === 'stare';
  const champion = winnerIndex === null ? null : candidates[winnerIndex];
  const isFinal = r === matchRounds - 1;

  let cheerLine = '';
  if (done && cheer !== null) {
    const reached = reachedRound(bracket, cheer);
    cheerLine =
      cheer === winnerIndex
        ? `📣 응원한 ${withJosa(candidates[cheer].name, '이/가')} 우승했어요!`
        : `📣 응원한 ${withJosa(candidates[cheer].name, '은/는')} ${roundName(bracket.rounds[reached].length)}에서 멈췄어요.`;
  }

  const fa = f ? round[2 * f.match] : null;
  const fb = f ? round[2 * f.match + 1] : null;
  const fw = f ? next[f.match] : null;
  const shout = f && phase === 'shout' && cue.shout !== undefined ? f.shouts[cue.shout] : null;

  const status = (() => {
    if (done) return cheerLine || `🏆 ${champion ? shortName(champion.name, 12) : ''} 우승! ${matchRounds}판 전승이에요`;
    const rn = roundName(round.length);
    switch (phase) {
      case 'list':
        return `${rn} 시작!`;
      case 'clash':
        return '쾅! 한꺼번에 맞붙었어요';
      case 'fake':
        return '어? 이변이 일어날까요?';
      case 'result':
        return rp.fake ? '역전! 뒤집고 다음 판으로 가요' : '이긴 가게가 다음 판으로 가요';
      case 'slam':
        return isFinal ? `결승전! ${name(fa, 8)} vs ${name(fb, 8)}` : `빅매치! ${name(fa, 8)} vs ${name(fb, 8)}`;
      case 'stare':
        return '눈싸움 중… 아무도 안 물러서요';
      case 'fight':
        return '힘겨루기 중이에요…';
      case 'shout':
        if (!shout) return '힘겨루기 중이에요…';
        if (shout.text === '재역전!') return '재역전! 다시 뒤집혔어요';
        if (shout.tone === 'swap') return '역전! 판이 뒤집혔어요';
        if (shout.tone === 'close') return '막상막하! 누가 이길지 몰라요';
        return '압도적이에요!';
      case 'ko':
        if (isFinal) return f?.kind === 'close' ? `간발의 차! ${name(fw, 12)} 우승!` : `K.O.! ${name(fw, 12)} 우승!`;
        return `${name(fw, 10)} 승리! 결승으로 가요`;
      case 'out':
        return '이긴 가게가 결승으로 가요';
      default:
        return '';
    }
  })();

  const real = new Set(realMatches(round));
  const byes = round.filter((e, i) => e !== null && round[i ^ 1] === null) as number[];
  const cut = f && fa !== null && fb !== null && (phase === 'slam' || phase === 'stare' || phase === 'fight' || phase === 'shout' || phase === 'ko' || phase === 'out');

  return (
    <div
      className={['tour', 'tour--live', expanded ? 'tour--big' : '', settled ? 'tour--settled' : ''].filter(Boolean).join(' ')}
    >
      <ol className="tour__steps" aria-label="진행">
        {bracket.rounds.slice(0, -1).map((rd, i) => (
          <li
            key={i}
            className={['tour__step', i < r || done ? 'tour__step--past' : '', i === r && !done ? 'tour__step--now' : '']
              .filter(Boolean)
              .join(' ')}
            aria-current={i === r && !done ? 'step' : undefined}
          >
            {roundName(rd.length)}
          </li>
        ))}
        <li className={done ? 'tour__step tour__step--now tour__step--cup' : 'tour__step tour__step--cup'}>🏆</li>
      </ol>

      <div className="tour__stage">
        {done && champion ? (
          <div className="tour__champion">
            <span className="tour__rays" aria-hidden="true" />
            <span className="tour__cup" aria-hidden="true">
              🏆
              <span className="tour__confetti">
                {Array.from({ length: CONFETTI }, (_, k) => (
                  <span
                    key={k}
                    style={{ '--a': `${(k * 360) / CONFETTI + (k % 3) * 9}deg`, '--h': (k * 53) % 360, '--d': `${0.75 + (k % 4) * 0.2}` } as React.CSSProperties}
                  />
                ))}
              </span>
            </span>
            <strong>{champion.name}</strong>
            <span className="muted small">
              {matchRounds}판 전승 · {categoryLabel(champion)} · 도보 {champion.walkMin}분
            </span>
          </div>
        ) : (
          <>
            <ul className="tour__matches" aria-label={`${roundName(round.length)} 대진`}>
              {Array.from({ length: round.length / 2 }, (_, m) => m)
                .filter((m) => real.has(m))
                .map((m) => {
                  const a = round[2 * m];
                  const b = round[2 * m + 1];
                  const w = next[m];
                  const fake = rp.fake?.match === m;
                  const cls = (e: Entry) =>
                    [
                      'tour__side',
                      resolved && e === w && 'tour__side--win',
                      resolved && e !== w && 'tour__side--lose',
                      fake && phase === 'fake' && e !== w && 'tour__side--lead',
                      e !== null && e === cheer && 'tour__side--cheer',
                    ]
                      .filter(Boolean)
                      .join(' ');
                  return (
                    <li
                      key={`${r}-${m}`}
                      className={[
                        'tour__match',
                        clashing && 'tour__match--clash',
                        f?.match === m && 'tour__match--feature',
                        fake && resolved && 'tour__match--upset',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ '--i': m } as React.CSSProperties}
                    >
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
            {byes.length > 0 && (
              <p className="tour__byes">
                부전승 {byes.length}곳은 바로 올라가요{byes.length <= 3 ? ` · ${byes.map((e) => name(e, 6)).join(' · ')}` : ''}
              </p>
            )}
          </>
        )}

        {cut && f && fa !== null && fb !== null && fw !== null && (
          <Clash
            key={`${run}-${r}`}
            phase={phase}
            final={isFinal}
            label={isFinal ? '결승전' : `${roundName(round.length)} 빅매치`}
            a={name(fa, expanded ? 12 : 9)}
            b={name(fb, expanded ? 12 : 9)}
            cheerA={fa === cheer}
            cheerB={fb === cheer}
            winA={fw === fa}
            feature={f}
            shout={shout ? { text: shout.text, tone: shout.tone, key: cue.shout ?? 0 } : phase === 'ko' ? { text: f.shouts[f.shouts.length - 1].text, tone: 'ko', key: 99 } : null}
          />
        )}
      </div>

      <p className="tour__hint" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/**
 * VS 컷신. 두 카드가 좌우에서 쾅 들어오고(가운데 VS 번개), 결승이면 눈싸움을 하고,
 * 힘 게이지가 흔들리다(역전 외침) K.O. — 진 카드는 튕겨 나가고 이긴 카드가 빛난다.
 */
function Clash({
  phase,
  final,
  label,
  a,
  b,
  cheerA,
  cheerB,
  winA,
  feature,
  shout,
}: {
  phase: Cue['phase'];
  final: boolean;
  label: string;
  a: string;
  b: string;
  cheerA: boolean;
  cheerB: boolean;
  winA: boolean;
  feature: Feature;
  shout: { text: string; tone: string; key: number } | null;
}) {
  const fighting = phase === 'fight' || phase === 'shout' || phase === 'ko' || phase === 'out';
  const ko = phase === 'ko' || phase === 'out';
  // 게이지는 왼쪽(a) 몫이다. a 가 이긴 쪽이면 그대로, 아니면 뒤집는다.
  const gv: Record<string, string> = { '--fight': `${feature.koMs - feature.fightMs}ms` };
  feature.gauge.forEach((g, k) => {
    gv[`--g${k}`] = `${((winA ? g : 1 - g) * 100).toFixed(1)}%`;
  });
  const card = (side: 'a' | 'b') => {
    const win = side === 'a' ? winA : !winA;
    return (
      <span
        className={[
          'tour__card',
          `tour__card--${side}`,
          ko && win ? 'tour__card--win' : '',
          ko && !win ? 'tour__card--lose' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className="tour__eyes" aria-hidden="true">
          <span />
          <span />
        </span>
        <span className="tour__card-name">
          {(side === 'a' ? cheerA : cheerB) && <span aria-hidden="true">📣</span>}
          {side === 'a' ? a : b}
        </span>
        {ko && win && <span className="tour__stamp">승!</span>}
      </span>
    );
  };
  return (
    <div
      className={[
        'tour__cut',
        `tour__cut--${phase}`,
        final ? 'tour__cut--final' : '',
        fighting ? 'tour__cut--fighting' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <span className="tour__cut-bg" />
      {final && (
        <>
          <span className="tour__bar tour__bar--top" />
          <span className="tour__bar tour__bar--bottom" />
        </>
      )}
      <span className="tour__label">{label}</span>
      <div className="tour__ring">
        {card('a')}
        <span className="tour__vsmark">
          <svg viewBox="0 0 40 64" className="tour__bolt">
            <path d="M24 0 L6 36 L18 36 L12 64 L34 24 L21 24 Z" />
          </svg>
          <span className="tour__vs-text">VS</span>
          {phase === 'stare' && (
            <svg viewBox="0 0 120 20" className="tour__crackle" preserveAspectRatio="none">
              <polyline points="0,10 12,3 22,15 34,4 46,16 58,5 70,15 82,4 94,16 106,6 120,10" />
            </svg>
          )}
          {fighting && !ko && <span className="tour__sparks" />}
        </span>
        {card('b')}
      </div>
      <div className={['tour__gauge', fighting ? 'tour__gauge--go' : ''].filter(Boolean).join(' ')} style={gv as React.CSSProperties}>
        <span className="tour__gauge-a" />
        <span className="tour__gauge-mid" />
      </div>
      {phase === 'stare' && <span className="tour__dots">…</span>}
      {shout && (
        <span key={shout.key} className={`tour__shout tour__shout--${shout.tone}`}>
          {shout.text}
        </span>
      )}
      {ko && <span className="tour__flash" />}
    </div>
  );
}
