/**
 * 낚시 — 가게 이름표를 단 물고기들이 연못에서 헤엄치고, 낚싯줄이 몇 번 입질을 받다가
 * 당첨 물고기를 낚아 올린다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 물고기 자리·헤엄 박자와 입질 순서·시각은
 * lib/fishing.ts 가 정한다(입질은 판 번호 run 시드). 마지막에 무는 물고기는 언제나 당첨이다.
 * 당첨 물고기가 물 위로 올라와 반짝이면 onSpinEnd 를 한 번 부른다.
 *
 * 연출 사건(판 번호 run 시드로 정해진다): 당첨이 아닌 물고기가 걸려 반쯤 올라오다 빠져나가는
 * '놓친 대물'(hook → slip → leave), 큰 물고기 그림자가 지나가는 장면(pass). 둘 다 당첨과 상관없다.
 * 물고기 생김새(종류·색)는 자리와 같이 후보 수마다 한 번 정한다(lib/fishing.ts fishLooks).
 *
 * 계절·날씨: 배경·옷차림·등장 물고기 종류를 바꾼다. useAmbience() 로 받는다.
 * 도감: 낚은 물고기 종류를 localStorage 에 기록하고, 도감 버튼으로 본다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Sheet } from '@gook-lab/ui';
import { shortName } from '../../lib/name';
import { withJosa } from '../../lib/josa';
import { fishingPlan, fishLooks, FISH_SPECIES, pondLayout, SKY } from '../../lib/fishing';
import { seededRandom } from '../../lib/random';
import { prefersReducedMotion, type GameProps } from './types';
import { sfxLater, type SfxName } from '../../lib/sfx';
import { useAmbience } from '../../hooks/useAmbience';
import { getFishDex, recordCaughtFish, type FishSpeciesId, FISH_SPECIES_NAMES } from '../../lib/fishDex';
import './Fishing.ambience.css';

/**
 * cast: 줄이 내려가는 중 · move: 다음 물고기 위로 옮기는 중 · bite: 입질(찌 흔들림)
 * · leave: 물고기가 떠남 · strike: 챔질(당첨이 물었다) · land: 물 위로 올라옴.
 * · hook: 놓친 대물이 걸려 반쯤 끌려 올라옴 · slip: 몸부림치다 빠져나감(그다음 leave).
 */
type Phase = 'cast' | 'move' | 'bite' | 'hook' | 'slip' | 'leave' | 'strike' | 'land';

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
const LOOK_SEED = 101;

export function Fishing({ candidates, winnerIndex, spinning, run, onSpinEnd, expanded = false }: GameProps) {
  const count = candidates.length;
  const { season, weekday, weather } = useAmbience();
  const [state, setState] = useState<FishingState>({ run: -1, phase: 'cast', fish: 0 });
  const [showDex, setShowDex] = useState(false);
  const layout = useMemo(() => pondLayout(count, seededRandom(LAYOUT_SEED + count)), [count]);
  // 생김새도 자리처럼 후보 수마다 고정 — 판마다 바뀌면 '아까 그 복어'를 따라갈 수 없다.
  const looks = useMemo(() => fishLooks(count, layout.cols, seededRandom(LOOK_SEED + count)), [count, layout.cols]);
  // 입질 일정은 판 번호 시드라 몇 번 계산해도 같다. 그림자(pass)를 그리려고 렌더에서도 쓴다.
  const plan = useMemo(
    () => (winnerIndex === null ? null : fishingPlan(count, winnerIndex, seededRandom(run))),
    [count, winnerIndex, run],
  );

  useEffect(() => {
    if (!spinning || winnerIndex === null || count === 0) return;

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
    plan.bites.forEach(({ fish, moveMs, biteMs, leaveMs, escape }, k) => {
      const last = k === plan.bites.length - 1;
      if (k > 0) at(moveMs, 'move', fish);
      at(biteMs, 'bite', fish);
      if (escape) {
        // 놓친 대물: 챔질 소리까지 당첨과 똑같이 — 속아야 긴장이 산다. 빠져나갈 때 미끄러지는 소리.
        at(escape.hookMs, 'hook', fish);
        at(escape.slipMs, 'slip', fish);
        sounds.push([escape.hookMs, 'splash'], [escape.slipMs + 120, 'slip']);
      }
      at(leaveMs, last ? 'strike' : 'leave', fish);
      // 찌가 톡톡 두 번 — 입질.
      sounds.push([biteMs + 60, 'plop'], [biteMs + 300, 'plop']);
      if (last) sounds.push([leaveMs, 'splash']);
    });
    at(plan.landMs, 'land', winnerIndex);
    timers.push(window.setTimeout(() => {
      // 낚은 물고기를 도감에 기록한다.
      if (winner) {
        const fishSpeciesId = `${season}-${looks[winnerIndex].kind}` as FishSpeciesId;
        recordCaughtFish(fishSpeciesId);
      }
      onSpinEnd();
    }, plan.endMs));

    const stopSfx = sfxLater(sounds);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      stopSfx();
    };
  }, [spinning, winnerIndex, count, run, onSpinEnd, plan, season, looks]);

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
  /*
   * 놓친 대물이 끌려 올라오는 높이. 첫 줄은 수면까지 끌려와 몸이 반쯤 물 밖으로 나온다.
   * 아래 줄은 칸 높이의 0.38 만 — 더 올리면 윗줄 이름표에 닿는다(390px·15곳 재현). 닿아도 윗줄 이름표가
   * 위에 그려지게 CSS 가 놓친 대물을 다른 물고기 뒤(z-index 1)에 둔다.
   */
  const hookedY = !aim
    ? SKY
    : aim.y < SKY + layout.cellH
      ? SKY + layout.cellH * 0.05
      : aim.y - layout.cellH * 0.38;
  const hookY = !aim
    ? SKY
    : phase === 'land'
      ? LAND_HOOK
      : phase === 'hook' || phase === 'slip'
        ? hookedY - layout.cellH * 0.08
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
        : phase === 'hook'
          ? '걸렸어요! 끌어올려요'
          : phase === 'slip'
            ? '앗, 빠져나가요!'
            : phase === 'leave'
          ? '앗, 놓쳤어요'
          : phase === 'strike'
            ? '걸렸어요! 끌어올려요'
            : phase
              ? '낚싯줄을 드리웠어요…'
              : `물고기 ${count}마리가 헤엄치고 있어요`;

  return (
    <div
      className={['fishing', expanded ? 'fishing--big' : '', settled ? 'fishing--settled' : '', `fishing--season-${season}`, `fishing--weather-${weather}`, weekday === 5 ? 'fishing--friday' : ''].filter(Boolean).join(' ')}
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
            {phase !== 'land' && phase !== 'hook' && phase !== 'slip' && (
              <span className={`fishing__float fishing__float--${phase}`} style={{ left: `${lineX}%` }} aria-hidden="true" />
            )}
          </>
        )}
        {/* 큰 물고기 그림자 — 물고기들 뒤로 한 번 지나간다. 지연은 이 판 시작(이 요소가 생긴 때)부터 잰다. */}
        {live && plan?.pass && phase !== 'land' && (
          <span
            key={run}
            className={['fishing__shadow', plan.pass.fromLeft ? '' : 'fishing__shadow--rtl'].filter(Boolean).join(' ')}
            style={
              {
                top: `${plan.pass.y}%`,
                '--pass-delay': `${plan.pass.startMs}ms`,
                '--pass-dur': `${plan.pass.durMs}ms`,
              } as React.CSSProperties
            }
            aria-hidden="true"
          />
        )}
        {candidates.map((p, i) => {
          const f = layout.fish[i];
          const look = looks[i];
          const aimed = i === target;
          const hooked = aimed && (phase === 'hook' || phase === 'slip');
          const biting = aimed && (phase === 'bite' || phase === 'strike');
          const fleeing = aimed && phase === 'leave';
          const caught = aimed && phase === 'land';
          // 떠날 때는 연못 바깥쪽으로 잠깐 달아났다가, 줄이 다음 물고기로 옮기면 제자리로 돌아온다.
          const away = f.x < 50 ? -1 : 1;
          const x = fleeing ? f.x + away * f.range * 2.2 : caught ? lineX : f.x;
          // 낚은 물고기는 바늘 자리(줄 끝)에 붙는다. 몸을 바늘 아래로 내리는 건 CSS 가 한다.
          const y = caught ? hookY : hooked ? hookedY : biting ? f.y - reach : fleeing ? f.y + reach * 0.5 : f.y;
          return (
            <div
              key={p.id}
              title={p.name}
              className={[
                'fishing__fish',
                `fishing__fish--${look.kind}`,
                biting ? 'fishing__fish--bite' : '',
                hooked ? 'fishing__fish--hooked' : '',
                aimed && phase === 'slip' ? 'fishing__fish--slip' : '',
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
                  '--hue': look.hue,
                  '--size': FISH_SPECIES[look.kind].size,
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
      <div className="fishing__controls">
        <p className="fishing__status" aria-live="polite">
          {status}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setShowDex(!showDex)}>
          도감
        </Button>
      </div>
      <FishDexSheet open={showDex} onOpenChange={setShowDex} />
    </div>
  );
}

/** 도감 — 낚은 물고기를 본다. */
function FishDexSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const dex = getFishDex();
  const allSpecies: Array<{ id: FishSpeciesId; season: 'spring' | 'summer' | 'autumn' | 'winter'; name: string }> = [];

  // 모든 가능한 종을 생성한다.
  for (const s of ['spring', 'summer', 'autumn', 'winter'] as const) {
    for (const kind of Object.keys(FISH_SPECIES_NAMES) as (keyof typeof FISH_SPECIES_NAMES)[]) {
      const speciesId = `${s}-${kind}` as FishSpeciesId;
      allSpecies.push({
        id: speciesId,
        season: s,
        name: FISH_SPECIES_NAMES[kind],
      });
    }
  }

  const seen = new Set(dex);
  const caught = allSpecies.filter((s) => seen.has(s.id));
  const total = allSpecies.length;

  return (
    <Sheet open={open} onClose={() => onOpenChange(false)} title="낚시 도감">
      <div className="fishing-dex">
        <div className="fishing-dex__header">
          <p className="fishing-dex__count">
            {caught.length}/{total}
          </p>
        </div>
        <div className="fishing-dex__content">
          {allSpecies.map((species) => {
            const hasCaught = seen.has(species.id);
            return (
              <div
                key={species.id}
                className={['fishing-dex__item', hasCaught ? 'fishing-dex__item--caught' : 'fishing-dex__item--unseen'].filter(Boolean).join(' ')}
                title={hasCaught ? `${species.name} (${species.season})` : '아직 낚지 못했어요'}
              >
                <div className="fishing-dex__icon">
                  {hasCaught ? <span className="fishing-dex__silhouette">{species.name}</span> : '?'}
                </div>
                <div className="fishing-dex__meta">
                  <div className="fishing-dex__name">{hasCaught ? species.name : '미발견'}</div>
                  <div className="fishing-dex__season">{species.season}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
