/**
 * 낚시 — 가게 이름표를 단 물고기들이 연못에서 헤엄치고, 낚싯줄이 몇 번 입질을 받다가
 * 당첨 물고기를 낚아 올린다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 물고기 자리·헤엄 박자와 입질 순서·시각은
 * lib/fishing.ts 가 정한다(입질은 판 번호 run 시드). 마지막에 무는 물고기는 언제나 당첨이다.
 * 당첨 물고기가 물 위로 올라와 반짝이면 onSpinEnd 를 한 번 부른다.
 */
import { useEffect, useMemo, useState } from 'react';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import { fishingPlan, pondLayout, SKY } from '../../lib/fishing';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfxLater, type SfxName } from '../../lib/sfx';

/**
 * cast: 줄이 내려가는 중 · move: 다음 물고기 위로 옮기는 중 · bite: 입질(찌 흔들림)
 * · leave: 물고기가 떠남 · strike: 챔질(당첨이 물었다) · land: 물 위로 올라옴.
 */
type Phase = 'cast' | 'move' | 'bite' | 'leave' | 'strike' | 'land';

interface FishingState {
  run: number;
  phase: Phase;
  /** 줄이 겨누는 물고기. */
  fish: number;
}

/** 낚아 올린 뒤 바늘 높이(연못 높이의 %). 하늘(SKY) 맨 위 — 매달린 물고기가 하늘 띠에 들어간다. */
const LAND_HOOK = 3;

/** 물고기 자리는 후보 수마다 한 번 정한다 — 판마다 바뀌면 고른 물고기를 눈으로 따라갈 수 없다. */
const LAYOUT_SEED = 7;

export function Fishing({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const [state, setState] = useState<FishingState>({ run: -1, phase: 'cast', fish: 0 });
  const layout = useMemo(() => pondLayout(count, seededRandom(LAYOUT_SEED + count)), [count]);

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

    const plan = fishingPlan(count, winnerIndex, seededRandom(run));
    if (prefersReducedMotion() || !plan) {
      // 움직임 줄이기(또는 한 곳뿐)면 입질 없이 낚아 올린 모습만 보인다.
      setState({ run, phase: 'land', fish: winnerIndex });
      const t = window.setTimeout(onSpinEnd, 0);
      return () => window.clearTimeout(t);
    }

    // 이번 판을 시작한다. 이걸 빼면 아래 setState 들이 s.run === run 에 막혀 줄이 안 내려간다.
    setState({ run, phase: 'cast', fish: plan.bites[0].fish });

    const timers: number[] = [];
    const at = (ms: number, phase: Phase, fish: number) =>
      timers.push(window.setTimeout(() => setState((s) => (s.run === run ? { ...s, phase, fish } : s)), ms));
    const sounds: [number, SfxName][] = [[plan.castMs - 100, 'plop']];
    plan.bites.forEach(({ fish, moveMs, biteMs, leaveMs }, k) => {
      const last = k === plan.bites.length - 1;
      if (k > 0) at(moveMs, 'move', fish);
      at(biteMs, 'bite', fish);
      at(leaveMs, last ? 'strike' : 'leave', fish);
      // 찌가 톡톡 두 번 — 입질.
      sounds.push([biteMs + 60, 'plop'], [biteMs + 300, 'plop']);
      if (last) sounds.push([leaveMs, 'splash']);
    });
    at(plan.landMs, 'land', winnerIndex);
    timers.push(window.setTimeout(onSpinEnd, plan.endMs));

    const stopSfx = sfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd]);

  if (count === 0) return <div className="fishing fishing--empty" />;

  const live = state.run === run;
  // 판이 끝난 뒤 다시 그려질 때(크게 보기 전환 등)는 낚아 올린 모습을 보인다.
  const settled = !live && winnerIndex !== null && !spinning;
  const phase: Phase | null = live ? state.phase : settled ? 'land' : null;
  const target = live ? state.fish : settled && winnerIndex !== null ? winnerIndex : -1;
  const winner = winnerIndex === null ? null : candidates[winnerIndex];
  // 이름표 폭은 칸의 72%(390px·4열이면 약 60px)라 다섯 글자쯤. 넘치면 CSS 말줄임이 한 번 더 자른다.
  const nameMax = expanded ? 8 : layout.cols >= 4 ? 6 : 8;

  // 바늘은 겨눈 물고기 입 바로 위. 물고기는 입질 때 바늘 쪽으로 떠오른다.
  const reach = layout.cellH * 0.22;
  const aim = target >= 0 ? layout.fish[target] : null;
  /*
   * 낚아 올리면 바늘은 하늘 맨 위(LAND_HOOK)까지 감기고 물고기는 그 바늘에 입이 걸려 매달린다.
   * 예전엔 바늘만 하늘(6%)에 두고 물고기는 따로 10%에 세로(몸 위·이름표 아래)로 세워,
   * 줄과 물고기가 떨어져 보이고 이름표가 물속 첫 줄 이름표('숯불 제육')를 덮었다(리뷰 재현).
   * 이제 몸과 이름표를 가로로 눕혀 하늘 띠 안에 넣는다(Fishing CSS .fishing__fish--win).
   */
  const hookY = !aim
    ? SKY
    : phase === 'land'
      ? LAND_HOOK
      : phase === 'strike'
        ? aim.y - reach - layout.cellH * 0.08
        : aim.y - reach - layout.cellH * 0.18;
  // 매달린 몸이 연못 가장자리에 잘리지 않게만 안쪽으로. 이름표는 연못 가운데 쪽으로 붙는다.
  const lineX = !aim ? 50 : phase === 'land' ? Math.min(92, Math.max(8, aim.x)) : aim.x;

  const status =
    phase === 'land' && winner
      ? `${withJosa(shortName(winner.name, 12), '을/를')} 낚았어요!`
      : phase === 'bite'
        ? '입질이 왔어요…'
        : phase === 'leave'
          ? '앗, 놓쳤어요'
          : phase === 'strike'
            ? '걸렸어요! 끌어올려요'
            : phase
              ? '낚싯줄을 드리웠어요…'
              : `물고기 ${count}마리가 헤엄치고 있어요`;

  return (
    <div
      className={['fishing', expanded ? 'fishing--big' : '', settled ? 'fishing--settled' : ''].filter(Boolean).join(' ')}
      // 연못 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css).
      style={{ '--fit': layout.aspect.toFixed(4) } as React.CSSProperties}
    >
      <div
        className="fishing__pond"
        role="img"
        aria-label={`낚시 연못, 가게 ${count}곳: ${candidates.map((p) => p.name).join(', ')}`}
        style={{ '--sky': `${SKY}%`, '--cell-w': `${100 / layout.cols}cqw` } as React.CSSProperties}
      >
        {phase && aim && (
          <>
            {/* 낚싯줄은 하늘 위에서 곧장 내려온다. 자리·길이는 transition 으로 옮긴다. */}
            <span
              className={['fishing__line', phase === 'cast' ? 'fishing__line--cast' : ''].filter(Boolean).join(' ')}
              style={{ left: `${lineX}%`, height: `${hookY}%` }}
              aria-hidden="true"
            />
            {phase !== 'land' && (
              <span className={`fishing__float fishing__float--${phase}`} style={{ left: `${lineX}%` }} aria-hidden="true" />
            )}
          </>
        )}
        {candidates.map((p, i) => {
          const f = layout.fish[i];
          const aimed = i === target;
          const biting = aimed && (phase === 'bite' || phase === 'strike');
          const fleeing = aimed && phase === 'leave';
          const caught = aimed && phase === 'land';
          // 떠날 때는 연못 바깥쪽으로 잠깐 달아났다가, 줄이 다음 물고기로 옮기면 제자리로 돌아온다.
          const away = f.x < 50 ? -1 : 1;
          const x = fleeing ? f.x + away * f.range * 2.2 : caught ? lineX : f.x;
          // 낚은 물고기는 바늘 자리(줄 끝)에 붙는다. 몸을 바늘 아래로 내리는 건 CSS 가 한다.
          const y = caught ? hookY : biting ? f.y - reach : fleeing ? f.y + reach * 0.5 : f.y;
          return (
            <div
              key={p.id}
              title={p.name}
              className={[
                'fishing__fish',
                biting ? 'fishing__fish--bite' : '',
                fleeing ? 'fishing__fish--flee' : '',
                caught ? 'fishing__fish--win' : '',
                caught && x >= 50 ? 'fishing__fish--tagLeft' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={
                {
                  left: `${x}%`,
                  top: `${y}%`,
                  '--hue': Math.round((i * 137.5 + 200) % 360),
                  '--range': `${f.range}cqw`,
                  '--period': `${f.periodMs}ms`,
                  '--delay': `${f.delayMs}ms`,
                } as React.CSSProperties
              }
            >
              <span className="fishing__swim" aria-hidden="true">
                <span className="fishing__body" />
              </span>
              <span className="fishing__tag" aria-hidden="true">
                {shortName(p.name, caught ? 12 : nameMax)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="fishing__status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
