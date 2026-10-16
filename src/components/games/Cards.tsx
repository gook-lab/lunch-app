/**
 * 카드 뒤집기 — 한 장을 고르면 딜러가 카드를 모아 섞고(리플 촤르륵 · 브리지 착!) 다시 나눠 준다.
 * 나머지 카드가 꽝으로 뒤집히고, 반짝이며 들썩이던 카드도 꽝, 가끔 조커가 놀래킨다.
 * 마지막에 고른 카드가 천천히 뒤집히며 빛이 쓸고 지나가면 당첨.
 *
 * 당첨은 카드가 정하지 않는다. App 이 균등 난수로 이미 정했고(winnerIndex), 여기서는 고른 카드에
 * 그 당첨을 놓고 나머지 카드를 섞어 연다(lib/cards.ts → lib/ladder.ts revealSlots — 사다리와 같은 논리).
 * 카드는 열릴 때까지 전부 가려져 있으므로, 미리 섞어 엎어 둔 것과 확률이 같다. 사건(아깝다·조커)은
 * 당첨이 아닌 카드에만 일어난다. 어느 카드를 고르든 당첨 확률은 그대로다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { cardLooks, cardsPlan, waveGap, type CardsSay } from '../../lib/cards';
import { categoryLabel } from '../../lib/category';
import { withJosa } from '../../lib/josa';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { gachaCardsSfxLater, type GachaCardsSfxName, type SfxName } from '../../lib/sfx';
import { prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { ambienceClasses } from './scene/outfit';
import './Cards.css';
import './scene/scene.css';
import './scene/cardback.css';

interface Shown {
  run: number;
  step: number;
}

/** 컷신 미니 카드 수(한쪽). */
const HALF = 6;
/** 당첨 카드에서 터지는 꽃가루 수. */
const CONFETTI = 18;

const CALLOUT: Partial<Record<CardsSay, string>> = {
  riffle: '촤르륵',
  bridge: '착!',
  joker: '조커!',
  final: '두근두근',
};

/** 주인공 카드 위 말풍선. */
const BUBBLE: Partial<Record<CardsSay, string>> = {
  tease: '이건가?',
  miss: '꽝!',
  'joker-out': '꽝!',
};

export function Cards({
  candidates,
  winnerIndex,
  spinning,
  run,
  onSpinEnd,
  onRequestSpin,
  expanded = false,
}: GameProps) {
  const ambience = useAmbience();
  const count = candidates.length;
  const [picked, setPicked] = useState<number | null>(null);
  const [shown, setShown] = useState<Shown>({ run: -1, step: 0 });
  const tableRef = useRef<HTMLDivElement>(null);

  // 실행 단추로 시작해 카드를 안 골랐으면 판 번호로 한 장 고른다.
  const effectivePick =
    picked !== null && picked < count ? picked : winnerIndex === null ? null : Math.floor(seededRandom(run)() * Math.max(count, 1));
  const plan = useMemo(
    () =>
      effectivePick === null || winnerIndex === null ? null : cardsPlan(count, effectivePick, winnerIndex, seededRandom(run + 1)),
    [count, effectivePick, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    if (prefersReducedMotion() || !plan) {
      setShown({ run, step: plan ? plan.steps.length - 1 : 0 });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }
    // 카드마다 탁자 가운데까지의 거리 — 모일 때·나눠 줄 때 이만큼 날아간다.
    const table = tableRef.current;
    if (table) {
      const tr = table.getBoundingClientRect();
      table.querySelectorAll<HTMLElement>('.cards__grid > li').forEach((li) => {
        const r = li.getBoundingClientRect();
        li.style.setProperty('--fx', `${(tr.left + tr.width / 2 - (r.left + r.width / 2)).toFixed(1)}px`);
        li.style.setProperty('--fy', `${(tr.top + tr.height / 2 - (r.top + r.height / 2)).toFixed(1)}px`);
      });
    }
    setShown({ run, step: 0 });
    const timers: number[] = [];
    plan.steps.forEach((st, k) => {
      if (k === 0) return;
      timers.push(window.setTimeout(() => setShown((s) => (s.run === run ? { run, step: k } : s)), st.at));
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const gap = waveGap(plan.wave.length);
    const sounds: [number, GachaCardsSfxName | SfxName][] = [];
    for (const st of plan.steps) {
      if (st.say === 'gather') sounds.push([0, 'shuffle']);
      if (st.say === 'riffle') sounds.push([st.at + 180, 'riffle']);
      if (st.say === 'bridge') sounds.push([st.at + 380, 'snap']);
      if (st.say === 'deal') sounds.push([st.at, 'deal']);
      if (st.say === 'wave') for (let k = 0; k < Math.min(plan.wave.length, 6); k += 1) sounds.push([st.at + k * gap * Math.max(1, plan.wave.length / 6), 'flip']);
      if (st.say === 'tease') sounds.push([st.at, 'wobble']);
      if (st.say === 'miss') sounds.push([st.at, 'flip'], [st.at + 160, 'dud']);
      if (st.say === 'joker') sounds.push([st.at, 'flip'], [st.at + 200, 'joker']);
      if (st.say === 'joker-out') sounds.push([st.at + 200, 'dud']);
      if (st.say === 'final') sounds.push([st.at, 'tap'], [st.at + 520, 'flip']);
      if (st.say === 'won') sounds.push([st.at, 'shine']);
    }
    const stopSfx = gachaCardsSfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="cards cards--empty" />;

  const live = shown.run === run;
  const settled = !live && winnerIndex !== null && !spinning;
  const steps = plan?.steps ?? [];
  const k = live ? shown.step : settled ? steps.length - 1 : -1;
  const say: CardsSay | 'idle' = !plan
    ? winnerIndex !== null && (live || settled)
      ? 'won'
      : 'idle'
    : k >= 0
      ? (steps[k]?.say ?? 'idle')
      : 'idle';
  const looks = plan && k >= 0 ? cardLooks(plan, k) : null;
  const gathered = say === 'gather' || say === 'riffle' || say === 'bridge';
  const done = say === 'won';
  const focus = plan && k >= 0 ? steps[k]?.card ?? null : null;
  const gap = plan ? waveGap(plan.wave.length) : 0;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  // 크게 보기(데스크톱)는 판 높이에 다 들어오게 열 수를 정하고, 폭 ÷ 높이(--fit)를 desktop.css 에 넘긴다.
  const bigCols = count <= 5 ? count : count <= 8 ? 4 : count <= 10 ? 5 : count <= 12 ? 4 : 5;
  const bigRows = Math.ceil(count / bigCols);

  const pick = (i: number) => {
    if (spinning) return;
    setPicked(i);
    onRequestSpin?.();
  };

  const status = (() => {
    const nm = (c: number | null) => (c === null || !plan ? '' : shortName(candidates[plan.slots[c]].name, 10));
    switch (say) {
      case 'idle':
        return `카드 ${count}장 — 한 장 골라 주세요`;
      case 'gather':
        return '카드를 모아요';
      case 'riffle':
        return '촤르륵… 딜러가 섞어요';
      case 'bridge':
        return '착! 다 섞었어요';
      case 'deal':
        return '카드를 나눠 드려요';
      case 'wave':
        return '꽝, 꽝, 꽝…';
      case 'tease':
        return `어? ${(focus ?? 0) + 1}번 카드가 반짝여요…`;
      case 'miss':
        return `꽝! ${withJosa(nm(focus), '은/는')} 아니에요`;
      case 'joker':
        return `조커! ${(focus ?? 0) + 1}번 카드가 당첨…?`;
      case 'joker-out':
        return `장난이었어요. ${nm(focus)}, 꽝!`;
      case 'final':
        return `마지막 ${(effectivePick ?? 0) + 1}번 카드… 두근두근`;
      case 'won':
        return winner ? `당첨! ${shortName(winner.name, 14)}` : '';
    }
  })();
  const callout = live ? CALLOUT[say as CardsSay] : undefined;

  return (
    <div
      className={['cards', ambienceClasses(ambience), expanded ? 'cards--big' : '', `cards--${say}`, settled ? 'cards--settled' : ''].filter(Boolean).join(' ')}
      style={{ '--cols': bigCols, '--rows': bigRows, '--fit': ((bigCols * 3) / (bigRows * 4)).toFixed(4) } as React.CSSProperties}
    >
      {/* 카드가 많으면 판이 길어 아래 줄은 화면 밖이다. 상태 줄은 판 위에 둔다. */}
      <p className="cards__status" aria-live="polite">
        {status}
      </p>
      <div className="cards__table" ref={tableRef}>
        <ul
          className={[
            'cards__grid',
            gathered ? 'cards__grid--gathered' : '',
            say === 'deal' ? 'cards__grid--deal' : '',
            done ? 'cards__grid--done' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ '--deal': `${Math.min(30, Math.floor(260 / Math.max(1, count - 1)))}ms` } as React.CSSProperties}
        >
          {candidates.map((_, i) => {
            const look = looks?.[i] ?? (!plan && done && i === effectivePick ? 'win' : 'back');
            const open = look === 'lose' || look === 'win' || look === 'joker' || look === 'final';
            const place = plan && (look === 'lose' || look === 'win' || look === 'final') ? candidates[plan.slots[i]] : !plan && look === 'win' && winner ? winner : null;
            const mine = i === effectivePick && winnerIndex !== null;
            const win = look === 'win';
            const unjoker = live && say === 'joker-out' && focus === i;
            const waveAt = plan ? plan.wave.indexOf(i) : -1;
            const cls = [
              'cards__card',
              open ? 'cards__card--open' : '',
              mine ? 'cards__card--mine' : '',
              look === 'tease' ? 'cards__card--tease' : '',
              look === 'lose' ? 'cards__card--lose' : '',
              look === 'joker' ? 'cards__card--joker' : '',
              look === 'final' ? 'cards__card--final' : '',
              unjoker ? 'cards__card--unjoker' : '',
              win ? 'cards__card--win' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={i}
                className={focus === i && (say === 'tease' || say === 'joker' || say === 'final') ? 'cards__slot--focus' : undefined}
                style={{ '--i': i, '--w': Math.max(0, waveAt), '--gap': `${gap}ms` } as React.CSSProperties}
              >
                <button
                  type="button"
                  className={cls}
                  onClick={() => pick(i)}
                  disabled={spinning}
                  aria-label={place && look !== 'final' ? `${i + 1}번 카드: ${place.name}` : `${i + 1}번 카드 고르기`}
                >
                  <span className="cards__face cards__face--back" aria-hidden="true">
                    <span className="cards__num">{i + 1}</span>
                  </span>
                  <span className="cards__face cards__face--front" aria-hidden="true">
                    {look === 'joker' ? (
                      <span className="cards__jokerface">
                        <span className="cards__jokericon">🃏</span>
                        <b>JOKER</b>
                      </span>
                    ) : (
                      place && (
                        <>
                          {look === 'lose' && <em className="cards__stamp">꽝</em>}
                          <strong>{shortName(place.name, 10)}</strong>
                          <span>
                            {categoryLabel(place)} · {place.walkMin}분
                          </span>
                        </>
                      )
                    )}
                  </span>
                </button>
                {live && focus === i && BUBBLE[say as CardsSay] && (
                  <span key={`${run}-${shown.step}`} className={`cards__bubble cards__bubble--${say}`} aria-hidden="true">
                    {BUBBLE[say as CardsSay]}
                  </span>
                )}
                {win && live && (
                  <span className="cards__confetti" aria-hidden="true">
                    {Array.from({ length: CONFETTI }, (_, c) => (
                      <span
                        key={c}
                        style={
                          {
                            '--a': `${(c * 360) / CONFETTI + (c % 3) * 8}deg`,
                            '--h': (c * 53) % 360,
                            '--d': `${0.8 + (c % 4) * 0.2}`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {live && gathered && (
          <div className={`cards__cut cards__cut--${say}`} aria-hidden="true">
            <span className="cards__bar cards__bar--top" />
            <span className="cards__bar cards__bar--bottom" />
            <span key={`${run}-${shown.step}`} className="cards__deck">
              {Array.from({ length: HALF * 2 }, (_, c) => (
                <span
                  key={c}
                  className="cards__mini"
                  style={{ '--s': c < HALF ? -1 : 1, '--k': c % HALF } as React.CSSProperties}
                />
              ))}
            </span>
          </div>
        )}
        {callout && (
          <span key={`${run}-${shown.step}`} className={`cards__callout cards__callout--${say}`} aria-hidden="true">
            {callout}
          </span>
        )}
      </div>
    </div>
  );
}
