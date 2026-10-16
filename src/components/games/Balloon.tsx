/**
 * 풍선 터뜨리기 — 가게마다 색 풍선이 떠 있고, 다트가 하나씩 노려 터뜨린다. 마지막 두 풍선은
 * 번갈아 부풀다 하나가 펑 — 남은 풍선이 리본을 달고 떠오른다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 당첨 풍선은 터지지 않고, 연출 일정(다트·떨림·연쇄·살아남기·대결)은
 * lib/balloon.ts 의 balloonPlan 이 판 번호(run) 시드로 정한다. 사건은 당첨을 바꾸지 않는다.
 * 끝나면 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import { balloonColumns, balloonFrame, balloonPlan, finalFrame, type BalloonFrame } from '../../lib/balloon';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { tournbalSfxLater, type SfxName, type TournbalSfx } from '../../lib/sfx';
import { useAmbience } from '../../hooks/useAmbience';
import { ambienceClasses } from './scene/outfit';
import './Balloon.css';
import './Balloon.ambience.css';

interface BalloonState {
  run: number;
  /** plan.beats 의 몇 번째까지 왔나. */
  k: number;
  /** 움직임 줄이기로 끝 장면만 보이는가. */
  instant: boolean;
}

/** 조각 수. 터질 때 사방으로 튄다. */
const SHARDS = 6;
/** 떠오를 때 꽃가루 조각 수. */
const CONFETTI = 14;
/** 칸 높이 ÷ 칸 폭. 풍선·줄·이름표가 들어가는 세로 비율이다(App.css 의 aspect-ratio 와 같다). */
const CELL_TALL = 1.45;
/** 칸 안에서 풍선 몸통 가운데의 높이(칸 높이 비). 다트가 여기를 노린다. */
const BODY_Y = 0.36;

export function Balloon({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [state, setState] = useState<BalloonState>({ run: -1, k: -1, instant: false });
  const ambience = useAmbience();
  const plan = useMemo(
    () => (winnerIndex === null ? null : balloonPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0 || !plan) return;

    if (prefersReducedMotion() || plan.beats.length === 0) {
      setState({ run, k: 0, instant: true });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 풍선이 안 터진다.
    setState({ run, k: 0, instant: false });
    const timers: number[] = [];
    plan.beats.forEach((b, k) => {
      if (k > 0) timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, k } : s)), b.atMs));
    });
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const sounds: [number, TournbalSfx | SfxName][] = [];
    for (const b of plan.beats) {
      if (b.kind === 'aim') sounds.push([b.atMs, b.cause === 'wind' ? 'gust' : 'dart']);
      else if (b.kind === 'wobble') sounds.push([b.atMs, 'squeak']);
      else if (b.kind === 'pop' || b.kind === 'chain' || b.kind === 'burst') sounds.push([b.atMs, 'burst']);
      else if (b.kind === 'save') sounds.push([b.atMs, b.cause === 'wind' ? 'whoosh' : 'boing']);
      else if (b.kind === 'duel') sounds.push([b.atMs, 'start']);
      else if (b.kind === 'pump') sounds.push([b.atMs, 'pump']);
      else if (b.kind === 'strain') sounds.push([b.atMs, 'squeak'], [b.atMs + 220, 'squeak']);
      else if (b.kind === 'float') sounds.push([b.atMs + 80, 'trophy']);
    }
    const stopSfx = tournbalSfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan]);

  if (count === 0) return <div className="balloon balloon--empty" />;

  const live = state.run === run && state.k >= 0;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 당첨 하나만 남은 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const still = settled || (live && state.instant);
  const frame: BalloonFrame | null =
    winnerIndex === null
      ? null
      : still
        ? finalFrame(count, winnerIndex)
        : live && plan
          ? balloonFrame(plan, state.k)
          : spinning && plan
            ? balloonFrame(plan, 0)
            : null;

  const popped = frame?.popped ?? new Set<number>();
  const left = count - popped.size;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  const cols = balloonColumns(count);
  const rows = Math.ceil(count / cols);
  // 글자 수는 넉넉히 두고, 칸보다 길면 CSS 말줄임이 자른다.
  const nameMax = expanded ? 12 : 8;
  const beat = frame?.beat ?? null;
  const nm = (i: number | undefined) => (i === undefined ? '' : shortName(candidates[i].name, 8));

  const status = (() => {
    if (!frame || !beat) return `풍선 ${count}개 중 하나만 남아요`;
    switch (beat.kind) {
      case 'intro':
        return '다트가 풍선을 노려요…';
      case 'aim':
        return beat.cause ? '다트가 날아가요…' : `슝— 남은 풍선 ${left}개`;
      case 'wobble':
        return beat.cause ? '터질까…?' : `부들부들… 남은 풍선 ${left}개`;
      case 'save':
        return beat.cause === 'wind' ? `바람이 휙! ${nm(beat.index)} 휴, 살았다` : `팅! ${nm(beat.index)} 휴, 살았다`;
      case 'pop':
        return `펑! 남은 풍선 ${left}개`;
      case 'chain':
        return `연쇄로 펑펑! 남은 풍선 ${left}개`;
      case 'duel':
        return '마지막 두 풍선! 누가 먼저 터질까요?';
      case 'pump':
        return '빵빵하게 부풀어요…';
      case 'strain':
        return '아슬아슬… 터질 것 같아요!';
      case 'burst':
        return `펑! ${nm(beat.index)} 탈락`;
      case 'float':
        return winner ? `${shortName(winner.name, 12)}만 남았어요!` : '';
      default:
        return '';
    }
  })();

  // 화면 가운데 큰 글씨.
  const callout = (() => {
    if (!beat || still) return null;
    switch (beat.kind) {
      case 'save':
        return { text: beat.cause === 'wind' ? '휘잉~ 휴!' : '팅! 휴~', tone: 'save' };
      case 'chain':
        return { text: '연쇄 펑펑!', tone: 'chain' };
      case 'duel':
        return { text: '마지막 대결!', tone: 'duel' };
      case 'strain':
        return { text: '아슬아슬!', tone: 'strain' };
      case 'burst':
        return { text: '펑!!', tone: 'burst' };
      default:
        return null;
    }
  })();

  // 다트 자리(판 %). 몸통 위 가장자리에 끝이 닿는다. 왼쪽 절반 풍선은 오른쪽 위에서, 오른쪽 절반은
  // 왼쪽 위에서(좌우 뒤집어) 찌른다 — 다트가 판 밖으로 나가 휴대폰에서 가로 스크롤이 생기지 않게.
  const dart = frame?.dart ?? null;
  const dartAt = (i: number) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const flip = c + 0.5 > cols / 2;
    return { x: ((c + 0.5 + (flip ? -0.24 : 0.24)) / cols) * 100, y: ((r + BODY_Y - 0.1) / rows) * 100, flip };
  };
  const showDart = !!frame && !still && !frame.duel && !frame.float;
  const dartPos = dart ? dartAt(dart.index) : { x: 46, y: -2, flip: false };
  const flyMs = beat?.kind === 'aim' ? (beat.flyMs ?? 250) : 120;

  return (
    <div
      className={['balloon', expanded ? 'balloon--big' : '', still ? 'balloon--settled' : '', ambienceClasses(ambience)].filter(Boolean).join(' ')}
      // 판의 폭 ÷ 높이. 칸 하나가 폭 1 · 높이 CELL_TALL 이다. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': (cols / (rows * CELL_TALL)).toFixed(4) } as React.CSSProperties}
    >
      <div
        className={[
          'balloon__board',
          frame?.wind ? 'balloon__board--wind' : '',
          frame?.duel ? 'balloon__board--duel' : '',
          frame?.float && !still ? 'balloon__board--float' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="img"
        aria-label={`풍선 터뜨리기 판, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        style={{ '--cols': cols, '--rows': rows } as React.CSSProperties}
      >
        {candidates.map((p, i) => {
          const isPopped = popped.has(i);
          const isWin = !!frame?.float && i === winnerIndex;
          const inDuel = !!frame?.duel && frame.duel.includes(i) && !isPopped;
          const size = frame?.sizes.get(i);
          const saved = beat?.kind === 'save' && beat.index === i;
          return (
            <div
              key={p.id}
              title={p.name}
              className={[
                'balloon__item',
                isPopped ? 'balloon__item--popped' : '',
                isWin ? 'balloon__item--win' : '',
                frame?.wobble === i ? 'balloon__item--wobble' : '',
                inDuel ? 'balloon__item--duel' : '',
                frame?.strain === i ? 'balloon__item--strain' : '',
                saved ? `balloon__item--saved balloon__item--saved-${beat?.cause}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              // 이웃끼리 색이 겹치지 않게 황금각(137.5°)씩 돌린다. 흔들림 박자도 풍선마다 어긋나게.
              style={{ '--hue': Math.round((i * 137.5 + 20) % 360), '--i': i, ...(size ? { '--pump': size } : {}) } as React.CSSProperties}
            >
              <span className="balloon__float" aria-hidden="true">
                <span className="balloon__body" />
                <span className="balloon__string" />
                {isWin && <span className="balloon__ribbon" />}
                {isPopped && (
                  <span className="balloon__burst">
                    {Array.from({ length: SHARDS }, (_, k) => (
                      <span key={k} className="balloon__shard" style={{ '--a': `${k * (360 / SHARDS) + 15}deg` } as React.CSSProperties} />
                    ))}
                    <span className="balloon__pow">펑!</span>
                  </span>
                )}
                {isWin && !still && (
                  <span className="balloon__confetti">
                    {Array.from({ length: CONFETTI }, (_, k) => (
                      <span
                        key={k}
                        style={{ '--a': `${(k * 360) / CONFETTI + (k % 3) * 8}deg`, '--h': (k * 53) % 360, '--d': `${0.7 + (k % 4) * 0.2}` } as React.CSSProperties}
                      />
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

        {showDart && (
          <span
            className={['balloon__dart', dart ? `balloon__dart--${dart.mode}` : 'balloon__dart--idle', dartPos.flip ? 'balloon__dart--flip' : ''].filter(Boolean).join(' ')}
            style={{ left: `${dartPos.x.toFixed(2)}%`, top: `${dartPos.y.toFixed(2)}%`, '--fly': `${flyMs}ms` } as React.CSSProperties}
            aria-hidden="true"
          >
            <svg viewBox="0 0 48 48" className="balloon__dart-svg">
              {/* 끝(바늘)이 왼쪽 아래(0,48) 모서리에 오게 그린다. */}
              <line x1="2" y1="46" x2="18" y2="30" className="balloon__dart-tip" />
              <path d="M16 26 L22 32 L32 22 L26 16 Z" className="balloon__dart-body" />
              <path d="M30 18 L40 4 L44 8 L34 20 Z M30 18 L44 8 L40 4 Z" className="balloon__dart-fin" />
              <path d="M28 14 L36 2 L46 12 L34 20 Z" className="balloon__dart-fin" />
              <circle cx="22.5" cy="23" r="1.6" className="balloon__dart-eye" />
              <circle cx="26.5" cy="27" r="1.6" className="balloon__dart-eye" />
            </svg>
          </span>
        )}
        {frame?.wind && !still && (
          <span className="balloon__gust" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}
        {callout && (
          <span key={`${run}-${state.k}`} className={`balloon__callout balloon__callout--${callout.tone}`} aria-hidden="true">
            {callout.text}
          </span>
        )}
      </div>
      <p className="balloon__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
