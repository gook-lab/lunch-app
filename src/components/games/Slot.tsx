/**
 * 슬롯 — 릴 세 개가 가운데 줄에 같은 가게를 맞추면 당첨.
 *
 * 한 판(lib/slot.ts 가 판 번호 run 시드로 정한다): 레버를 철컥 당기면 불빛이 돌고 릴이 돈다. 릴은 하나씩 선다.
 * 둘이 같으면 "리치!" — 마지막 릴은 슬로모션으로 기어오고, 멈칫하거나 한 칸 모자라 떨거나 한 칸 지나쳐 꽝이 난다.
 * 꽝이면 "한 번 더 돌아요". 세 줄이 맞으면 잭팟 — 불빛이 번쩍이고 동전이 쏟아진다.
 *
 * 여기서도 결과는 winnerIndex 가 정한다 — 장면은 연출일 뿐, 마지막엔 세 릴 모두 winnerIndex 에 선다.
 *
 * 릴 위치는 rAF 가 DOM 에 직접 쓴다. React 의 transform 값은 판 동안 시작 위치로 두고, 판이 끝나면 마지막 위치로 바꾼다.
 * 릴 띠는 후보 목록 두 벌 남짓을 거꾸로 붙인 것이라 위치를 후보 수로 나눈 나머지만 그리면 이음매 없이 계속 내려간다.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { shortName } from '../../lib/name';
import { seededRandom } from '../../lib/random';
import { REELS, reelAt, reelOrders, slotPlan, symbolAt, type SlotPlan } from '../../lib/slot';
import { sfx, wheelSlotSfxLater, type SfxName, type WheelSlotSfx } from '../../lib/sfx';
import { SPIN_MS, prefersReducedMotion, type GameProps } from './types';
import { useAmbience } from '../../hooks/useAmbience';
import { SEASON_NAME } from '../../lib/ambience';
import { ambienceClasses } from './scene/outfit';
import './Slot.css';
import './Slot.ambience.css';

const WEATHER_MARK = { clear: '', cloudy: '☁️', rain: '☔', snow: '⛄', fog: '🌫️' } as const;
const SEASON_MARK = { spring: '🌸', summer: '🍉', autumn: '🍁', winter: '❄️' } as const;

const ITEM_H = 56;
/** 크게 보기에서 한 줄 높이. 창은 늘 세 줄이라 창 높이도 같이 바뀐다. */
const ITEM_H_BIG = 84;
/** 데스크톱 크게 보기 — 다섯 줄이라 조금 낮춘다. */
const ITEM_H_WIDE_BIG = 78;
/**
 * 데스크톱(960px~)은 다섯 줄을 60px 로 보여 준다. 줄이 많아야 릴이 도는 게 보인다(10/9 사용자).
 * 위에 불빛 줄·아래 상태 줄이 붙어 600×420 판에 들어가게 72px 에서 줄였다.
 */
const ITEM_H_WIDE = 60;
const ROWS_WIDE = 5;
/** 동전 수. */
const COINS = 16;
/** 불빛 수. */
const BULBS = 11;
/** 이보다 빠르면(칸/초) 릴 글자가 흐려진다. */
const BLUR_SPEED = 9;

const WIDE = '(min-width: 960px)';
const isWide = () => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches === true;
/** 창 폭이 960px 을 넘나들면(회전·창 크기) 다시 그린다. */
const subscribeWide = (cb: () => void) => {
  const mq = typeof window !== 'undefined' ? window.matchMedia?.(WIDE) : undefined;
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
};

const mod = (a: number, n: number) => ((a % n) + n) % n;

interface SlotState {
  run: number;
  /** 지금 장면 번호(plan.beats 의 인덱스). 판이 끝나면 마지막(jackpot). */
  beat: number;
  /** React 가 transform 에 쓰는 릴 위치. 판 동안은 시작 위치, 끝나면 마지막 위치. */
  pos: number[];
  plan: SlotPlan | null;
  /** 지금까지 선 릴(소리·불빛). 장면이 바뀔 때 같이 갱신한다. */
  stopped: number;
  done: boolean;
}

export function Slot({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const ambience = useAmbience();
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const big = wide && !expanded;
  const itemH = expanded ? (wide ? ITEM_H_WIDE_BIG : ITEM_H_BIG) : big ? ITEM_H_WIDE : ITEM_H;
  // 데스크톱은 크게 보기에서도 다섯 줄. 휴대폰은 세 줄.
  const rows = wide ? ROWS_WIDE : 3;
  /** 가운데 줄 번호. 위로 이만큼 줄이 더 보인다. */
  const center = (rows - 1) / 2;
  const count = candidates.length;
  const [state, setState] = useState<SlotState>({
    run: -1,
    beat: 0,
    pos: [0, 0, 0],
    plan: null,
    stopped: 0,
    done: false,
  });
  /** 지금 화면의 릴 위치. 다음 판은 여기서 이어 돈다. */
  const posRef = useRef([0, 0, 0]);
  const reelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const geo = useRef({ itemH, center, count });
  geo.current = { itemH, center, count };

  // 후보가 바뀌면 릴을 처음으로 되돌린다.
  useEffect(() => {
    posRef.current = [0, 0, 0];
    setState({ run: -1, beat: 0, pos: [0, 0, 0], plan: null, stopped: 0, done: false });
  }, [count]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;
    const orders = reelOrders(count);
    const starts = posRef.current.map((r) => mod(r, count));

    if (prefersReducedMotion() || count < 2) {
      // 움직임 줄이기(또는 한 곳뿐)면 돌지 않고 세 줄이 맞은 모습만.
      const final = orders.map((o) => o.indexOf(winnerIndex));
      posRef.current = final;
      setState({ run, beat: 0, pos: final, plan: null, stopped: REELS, done: true });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    const plan = slotPlan(count, winnerIndex, starts, SPIN_MS.slot, seededRandom(run))!;
    posRef.current = starts;
    setState({ run, beat: 0, pos: starts, plan, stopped: 0, done: false });

    const timers: number[] = [];
    const stoppedBy = (t: number) => plan.stops.filter((s) => s.at <= t).length;
    plan.beats.forEach(({ at, beat }, i) => {
      if (i === 0) return;
      timers.push(
        window.setTimeout(
          () =>
            setState((s) =>
              s.run === run
                ? {
                    ...s,
                    beat: i,
                    stopped: stoppedBy(at),
                    ...(beat === 'jackpot'
                      ? { done: true, pos: plan.segs.map((g, k) => reelAt(g, plan.endMs, starts[k])) }
                      : {}),
                  }
                : s,
            ),
          at,
        ),
      );
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, WheelSlotSfx | SfxName][] = [[0, 'lever']];
    for (const s of plan.stops) sounds.push([s.at, 'clack']);
    for (const b of plan.beats) {
      if (b.beat === 'reach') sounds.push([b.at + 60, 'reach']);
      if (b.beat === 'miss') sounds.push([b.at + 40, 'buzz']);
      if (b.beat === 'respin') sounds.push([b.at, 'whirl']);
      if (b.beat === 'creep') sounds.push([b.at + 300, 'clack']);
      if (b.beat === 'jackpot') sounds.push([b.at, 'coins'], [b.at + 80, 'tada']);
    }
    const stopSfx = wheelSlotSfxLater(sounds);

    // 릴을 매 프레임 그린다. 칸이 가운데 줄을 지날 때마다 딸깍(셋째 릴만 — 셋이 겹치면 지글거린다).
    let raf = 0;
    let t0 = -1;
    let prevT = 0;
    const prev = [...starts];
    const frame = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = now - t0;
      const { itemH: h, center: c, count: n } = geo.current;
      for (let k = 0; k < REELS; k += 1) {
        const r = reelAt(plan.segs[k], t, starts[k]);
        const el = reelRefs.current[k];
        if (el) {
          el.style.transform = `translateY(${reelY(r, n, c, h)}px)`;
          const speed = t > prevT ? ((r - prev[k]) * 1000) / (t - prevT) : 0;
          el.classList.toggle('slot__reel--blur', speed > BLUR_SPEED);
        }
        if (k === REELS - 1 && Math.floor(r) !== Math.floor(prev[k]) && t > 300) sfx('tick');
        prev[k] = r;
        posRef.current[k] = r;
      }
      prevT = t;
      if (t < plan.landMs) raf = requestAnimationFrame(frame);
      else reelRefs.current.forEach((el) => el?.classList.remove('slot__reel--blur'));
    };
    raf = requestAnimationFrame(frame);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      stopSfx();
      reelRefs.current.forEach((el) => el?.classList.remove('slot__reel--blur'));
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="slot slot--empty" />;

  const orders = reelOrders(count);
  const live = state.run === run;
  const plan = live ? state.plan : null;
  const cur = plan ? plan.beats[state.beat] : null;
  const beat = cur?.beat ?? null;
  const done = live && state.done && winnerIndex !== null;
  const winner = done ? candidates[winnerIndex] : null;
  const nameOf = (i: number | null | undefined, max = 10) =>
    i == null ? '' : shortName(candidates[i]?.name ?? '', max);
  // 이름은 릴 폭에 맞춰 줄인다. 휴대폰 릴 폭은 약 85px 이라 두 줄로 접어 쓴다(Slot.css).
  const max = expanded ? 10 : big ? 8 : 10;
  /** 띠: 후보 목록을 거꾸로 두 벌 남짓 — reelY 참고. */
  const stripLen = stripBase(count, center) + Math.ceil(center) + 2;

  // 리치·잭팟 불빛을 켤 릴. 리치는 앞 두 릴, 잭팟은 셋 다.
  const reachOn = beat === 'reach' || beat === 'teeter' || beat === 'short' || beat === 'creep';
  const lit = (k: number) => (done ? true : reachOn ? k < 2 : false);
  const stoppedReels = done ? REELS : live ? state.stopped : 0;

  const status = (() => {
    if (winner) return `잭팟! ${shortName(winner.name, 14)} 세 줄이에요!`;
    if (!cur) return `${count}곳이 릴에 들어 있어요 — 세 줄을 맞혀 봐요`;
    const respun = cur.round > 0;
    switch (cur.beat) {
      case 'pull':
        return '레버를 당겨요… 철컥!';
      case 'spin':
        return '드르르륵! 릴이 돌아가요';
      case 'stop':
        return respun ? `${nameOf(cur.sym)}부터 다시!` : `첫 번째 릴은 ${nameOf(cur.sym)}!`;
      case 'reach':
        return `리치! ${nameOf(cur.sym)} 두 개예요 — 마지막 릴…`;
      case 'teeter':
        return `${nameOf(cur.sym)}에서 멈추나…?`;
      case 'short':
        return '한 칸 모자라요… 한 칸 더…?';
      case 'creep':
        return '내려온다… 들어간다!';
      case 'miss':
        return '아깝다! 한 칸 지나쳤어요';
      case 'respin':
        return plan?.scene === 'overshoot' ? '한 번 더 돌아요! 마지막 릴만' : '다시 한 번! 셋 다 돌려요';
      default:
        return '';
    }
  })();

  const callout = (() => {
    switch (beat) {
      case 'reach':
        return { text: '리치!', tone: 'reach' };
      case 'short':
        return { text: '한 칸 더…?', tone: 'tense' };
      case 'miss':
        return { text: '아깝다!', tone: 'miss' };
      case 'respin':
        return { text: '한 번 더!', tone: 'reach' };
      default:
        return winner ? { text: '잭팟!', tone: 'win' } : null;
    }
  })();

  return (
    <div
      className={[
        'slot',
        ambienceClasses(ambience),
        big ? 'slot--wide' : '',
        expanded ? 'slot--big' : '',
        wide ? '' : 'slot--narrow',
        done ? 'slot--done' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="img"
      aria-label={`고를 가게 ${count}곳`}
    >
      <div className="slot__topper" aria-hidden="true">
        <span>{SEASON_MARK[ambience.season]}</span>
        {ambience.weekday === 5 ? '불금 잭팟' : `${SEASON_NAME[ambience.season]} 잭팟`}
        <span>{SEASON_MARK[ambience.season]}</span>
        {WEATHER_MARK[ambience.weather] && <span className="slot__topper-wx">{WEATHER_MARK[ambience.weather]}</span>}
      </div>
      <div
        className={[
          'slot__cabinet',
          beat === 'pull' ? 'slot__cabinet--pull' : '',
          live && !done && beat !== 'pull' && plan ? 'slot__cabinet--spin' : '',
          reachOn ? 'slot__cabinet--reach' : '',
          beat === 'miss' ? 'slot__cabinet--miss' : '',
          done ? 'slot__cabinet--jackpot' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="slot__marquee" aria-hidden="true">
          {Array.from({ length: BULBS }, (_, k) => (
            <span key={k} className="slot__bulb" style={{ '--k': k } as React.CSSProperties} />
          ))}
        </div>

        <div className="slot__window" style={{ height: itemH * rows }}>
          {Array.from({ length: REELS }, (_, k) => {
            const pos = live ? state.pos[k] : (posRef.current[k] ?? 0);
            // 가운데 줄 칸(띠 번호). 당첨 표시는 이 칸 하나에만 — 띠에는 같은 가게가 여러 번 있다.
            const mid = stripBase(count, center) - mod(Math.round(pos), count);
            const midWins = done && symbolAt(orders[k], pos) === winnerIndex;
            return (
              <div
                key={k}
                className={[
                  'slot__col',
                  lit(k) ? 'slot__col--lit' : '',
                  reachOn && k === REELS - 1 ? 'slot__col--last' : '',
                  k < stoppedReels ? 'slot__col--stopped' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div
                  ref={(el) => {
                    reelRefs.current[k] = el;
                  }}
                  aria-hidden="true"
                  className="slot__reel"
                  style={{ transform: `translateY(${reelY(pos, count, center, itemH)}px)` }}
                >
                  {Array.from({ length: stripLen }, (_, j) => {
                    const sym = orders[k][mod(-j, count)];
                    const place = candidates[sym];
                    const win = midWins && j === mid;
                    return (
                      <div
                        key={j}
                        className={win ? 'slot__item slot__item--win' : 'slot__item'}
                        style={{ height: itemH }}
                        title={place.name}
                      >
                        <span>{shortName(place.name, max)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="slot__frame" aria-hidden="true" style={{ top: center * itemH, height: itemH }} />
        </div>

        {callout && (
          <span
            key={`${state.run}-${state.beat}`}
            className={`slot__callout slot__callout--${callout.tone}`}
            aria-hidden="true"
          >
            {callout.text}
          </span>
        )}

        <div
          className={['slot__lever', beat === 'pull' ? 'slot__lever--pull' : ''].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          <span className="slot__stick" />
          <span className="slot__knob" />
        </div>

        {done && (
          <span className="slot__coins" aria-hidden="true">
            {Array.from({ length: COINS }, (_, k) => (
              <span
                key={k}
                style={
                  {
                    '--x': `${(k * 61) % 100}%`,
                    '--d': `${0.7 + (k % 4) * 0.18}`,
                    '--w': `${(k % 5) * 0.09}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </span>
        )}
      </div>
      {winner && (
        <p className="slot__winner">
          {winner.name}
          <span className="slot__meta"> · 도보 {winner.walkMin}분</span>
        </p>
      )}
      <p className="slot__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/**
 * 띠에서 r mod n = 0 일 때 가운데 줄에 오는 칸 번호. n 의 배수라야 그 칸이 order[0] 이고,
 * 위로 center 칸 남짓이 늘 띠 안이어야 한다(후보 2곳·다섯 줄이면 3n).
 */
function stripBase(n: number, center: number): number {
  return n * Math.ceil((n + center + 1) / n);
}

/**
 * 릴 위치 r 일 때 띠의 세로 이동(px). 띠 j 번째 칸은 order[(−j) mod n] 이라, r 이 늘면 띠가 아래로 내려가고
 * 가운데 줄에 order[r mod n] 이 온다. 가운데 칸 번호는 base − (r mod n) 이라 위·아래로 center+1 칸이 늘 띠 안이다.
 */
function reelY(r: number, n: number, center: number, h: number): number {
  const p = mod(r, n);
  return (center - (stripBase(n, center) - p)) * h;
}
