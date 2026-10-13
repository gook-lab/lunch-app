/**
 * 경주 트랙 — 기울인(perspective) 타원 위를 달린다. 레이싱은 아스팔트 서킷,
 * 경마는 흙 주로. 바퀴 수는 PixelRace 가 정한다(기본 세 바퀴).
 *
 * 차는 위에서 본 그림이라 판 위에 눕고 살짝 떠서 그림자를 둔다. 말은 옆에서 본
 * 그림이라 판의 기울기만큼 되세워(billboard) 서 있게 하고, 왼쪽으로 달릴 땐 뒤집는다.
 * 순위표의 이름을 누르면 카메라가 그 주자를 당겨 따라간다.
 * 위치·순위 계산은 PixelRace 가 하고, 여기는 그리기만 한다.
 */
import type { Place } from '../../lib/candidates';
import type { RaceEventKind } from '../../lib/race';
import { shortName } from '../../lib/name';

type TrackTheme = 'horse' | 'car';

/** 트랙 판 좌표(가로 100 × 세로 PLANE_H). 타원 중심과 반지름. */
const PLANE_H = 64;
const CX = 50;
const CY = PLANE_H / 2;
const RX = 38;
const RY = 21;
/** 도로 폭(판 단위, 연석 안쪽). 차선은 최대 MAX_LANES 개로 나누고 주자는 번호 순으로 돌아가며 선다. */
const ROAD = 13;
const MAX_LANES = 6;
const laneOffset = (k: number, lanes: number) => -ROAD / 2 + ((k + 0.5) * ROAD) / lanes;
/** 따라가기 배율. */
const ZOOM = 1.9;

/** 주자 색은 가게 카테고리가 아니라 순번으로 — 같은 카테고리끼리 색이 겹쳤다(10/13 사용자).
 *  색상환을 고르게 나누고, 주자가 많으면 밝기를 번갈아 바꿔 이웃 색도 갈라 놓는다. */
function runnerColor(i: number, n: number, dark = false): string {
  const hue = (20 + (i * 360) / Math.max(1, n)) % 360;
  const light = (n > 10 && i % 2 ? 0.78 : 0.62) - (dark ? 0.16 : 0);
  return `oklch(${light.toFixed(2)} 0.17 ${hue.toFixed(1)})`;
}

const CAR = ['..kk....kk..', 'kbbbbbbbbbb.', 'kbbbbggbbbbw', 'kbbbbggbbbbw', 'kbbbbbbbbbb.', '..kk....kk..'];
const HORSE: string[][] = [
  [
    '......cc......',
    '.....jjjj.....',
    '......jj...mb.',
    '..bbbbbbbbbbbb',
    '.bbbbbbbbbbbb.',
    'm.bbbbbbbbb...',
    '..b.b....b.b..',
    '.b...b..b...b.',
  ],
  [
    '......cc......',
    '.....jjjj.....',
    '......jj...mb.',
    '..bbbbbbbbbbbb',
    '.bbbbbbbbbbbb.',
    '.mbbbbbbbbb...',
    '...bb....bb...',
    '...b.b..b.b...',
  ],
];

/** 그림 한 장을 box-shadow 한 줄로. 픽셀 하나 = px. */
/** 그림 한 장을 box-shadow 한 줄로. 픽셀 하나 = px. 색은 글자·자리로 정한다(무늬용). */
function sprite(rows: string[], color: (ch: string, x: number, y: number) => string | undefined, px: number): string {
  const out: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const c = color(ch, x, y);
      if (c) out.push(`${(x + 1) * px}px ${(y + 1) * px}px 0 ${c}`);
    }),
  );
  return out.join(',');
}

const INK = 'var(--color-neutral-900)';
const SNOW = 'oklch(0.96 0.01 90)';

/**
 * 말 품종 — 기수 옷 색만으론 말이 다 똑같아 보였다(10/13 사용자). 순번으로 돌아가며
 * 정하니 여덟 마리까지는 모두 다르다. body·mane 은 (x, y) 를 받아 무늬를 그린다.
 */
interface Breed {
  name: string;
  body: (x: number, y: number) => string;
  mane: (x: number, y: number) => string;
  /** 머리 위에 더 찍을 점(유니콘 뿔). */
  extra?: [number, number, string][];
}
const BREEDS: Breed[] = [
  { name: '밤색말', body: () => 'oklch(0.48 0.09 50)', mane: () => INK },
  { name: '얼룩말', body: (x) => (x % 2 ? INK : SNOW), mane: () => INK },
  { name: '흑마', body: () => 'oklch(0.27 0.01 260)', mane: () => 'oklch(0.45 0.01 260)' },
  { name: '백마', body: () => SNOW, mane: () => 'oklch(0.78 0.01 260)' },
  {
    name: '점박이말',
    body: (x, y) => ((x * 7 + y * 3) % 5 === 0 || y >= 6 ? 'oklch(0.35 0.06 50)' : SNOW),
    mane: () => 'oklch(0.35 0.06 50)',
  },
  { name: '팔로미노', body: () => 'oklch(0.76 0.12 80)', mane: () => SNOW },
  {
    name: '회색 얼룩말',
    body: (x, y) => ((x + y) % 3 === 0 ? 'oklch(0.82 0.01 260)' : 'oklch(0.6 0.01 260)'),
    mane: () => 'oklch(0.4 0.01 260)',
  },
  {
    name: '유니콘',
    body: () => SNOW,
    mane: (_, y) => `oklch(0.72 0.17 ${(y * 70) % 360})`,
    extra: [
      [12, 1, 'oklch(0.85 0.15 90)'],
      [13, 0, 'oklch(0.85 0.15 90)'],
    ],
  },
];
// 판(run)마다 한 칸씩 돌려 준다 — 가게가 다섯 곳이어도 판이 바뀌면 유니콘이 나온다. 한 판 안에선 여덟 마리까지 다 다르다.
const breedOf = (i: number, round: number) => BREEDS[(i + round) % BREEDS.length];

function paint(theme: TrackTheme, i: number, n: number, frame: number, px: number, round: number): string {
  if (theme === 'car') {
    const colors: Record<string, string> = {
      b: runnerColor(i, n),
      g: 'oklch(0.86 0.04 230)',
      k: INK,
      w: 'oklch(0.95 0.12 95)',
    };
    return sprite(CAR, (ch) => colors[ch], px);
  }
  const breed = breedOf(i, round);
  const jockey = runnerColor(i, n);
  const cap = runnerColor(i, n, true);
  const body = sprite(
    HORSE[frame],
    (ch, x, y) =>
      ch === 'b'
        ? breed.body(x, y)
        : ch === 'm'
          ? breed.mane(x, y)
          : ch === 'j'
            ? jockey
            : ch === 'c'
              ? cap
              : undefined,
    px,
  );
  const extra = (breed.extra ?? []).map(([x, y, c]) => `${(x + 1) * px}px ${(y + 1) * px}px 0 ${c}`);
  return [body, ...extra].join(',');
}

/** 거리 d(0~1, 전체 바퀴) → 판 위 위치(%)와 진행 방향(도). 출발선은 아래 가운데. */
function trackPoint(d: number, lane: number, laps: number): { x: number; y: number; deg: number } {
  const theta = Math.PI / 2 + d * laps * 2 * Math.PI;
  const rx = RX + lane;
  const ry = RY + lane;
  const x = CX + rx * Math.cos(theta);
  const y = CY + ry * Math.sin(theta);
  const deg = (Math.atan2(ry * Math.cos(theta), -rx * Math.sin(theta)) * 180) / Math.PI;
  return { x, y: (y / PLANE_H) * 100, deg };
}

const STAND_ICON: Record<TrackTheme, Record<RaceEventKind, string>> = {
  car: { boost: ' 🔥', crash: ' 💫', bump: ' 💢', wobble: ' 💥', slip: ' 🍌' },
  horse: { boost: ' 🥕', crash: ' 💥', bump: ' 💢', wobble: ' 💫', slip: ' 🍌' },
};

interface Props {
  theme: TrackTheme;
  candidates: Place[];
  dist: number[];
  rankOf: Map<number, number>;
  active: (RaceEventKind | null)[];
  /** 경마 장면 말풍선(이모지). 레이싱은 그림으로 보여 줘서 없다. */
  bubbles?: (string | null)[];
  px: number;
  /** 그림 칸(말 달리기 두 장). */
  frame: number;
  focus: number | null;
  onFocus: (i: number | null) => void;
  /** 몇 번째 판인지 — 말 품종을 판마다 돌린다. */
  round: number;
  laps: number;
  /** 주자 i 가 선 출발 자리. 차선은 자리 번호로 정한다. */
  slots: number[];
  /** 자리 섞는 중 — 주자가 새 차선으로 미끄러져 옮겨 간다. */
  shuffling: boolean;
  /** 관중이 던져 바닥에 떨어진 것. d 는 떨어진 거리, runner 는 밟은 주자(차선). */
  hazards: { key: string; runner: number; d: number; icon: string }[];
}

export function RaceCircuit({
  theme,
  candidates,
  dist,
  rankOf,
  active,
  bubbles,
  px,
  frame,
  focus,
  onFocus,
  round,
  laps,
  slots,
  shuffling,
  hazards,
}: Props) {
  const n = candidates.length;
  const lanes = Math.min(n, MAX_LANES);
  const laneOf = (i: number) => laneOffset((slots[i] ?? i) % lanes, lanes);
  const lead = Math.max(...dist);
  const lap = Math.min(laps, 1 + Math.floor(lead * laps + 1e-9));
  const points = candidates.map((_, i) => trackPoint(dist[i], laneOf(i), laps));
  const cam = focus === null ? null : points[focus];
  // 지금 순서(들어온 주자는 등수, 나머지는 달린 거리 순).
  const standing = candidates
    .map((_, i) => i)
    .sort((a, b) => (rankOf.get(a) ?? 99) - (rankOf.get(b) ?? 99) || dist[b] - dist[a]);
  const lapText =
    lead >= 1
      ? 'FINISH'
      : laps === 1
        ? lead >= 0.75
          ? '마지막 직선'
          : ''
        : lap === laps
          ? 'FINAL LAP'
          : `LAP ${lap}/${laps}`;
  return (
    <div className={['rc', `rc--${theme}`, shuffling ? 'rc--shuffle' : ''].filter(Boolean).join(' ')}>
      <div className="rc__stage" aria-hidden="true">
        {lapText && <span className="rc__lap">{lapText}</span>}
        {focus !== null && (
          <span className="rc__tag">
            📍 {shortName(candidates[focus].name, 8)}
            {theme === 'horse' ? ` · ${breedOf(focus, round).name}` : ''}
            {rankOf.get(focus) ? ` ${rankOf.get(focus)}등` : ` ${standing.indexOf(focus) + 1}위`}
          </span>
        )}
        <div
          className={cam ? 'rc__plane rc__plane--follow' : 'rc__plane'}
          style={{
            aspectRatio: `100 / ${PLANE_H}`,
            // 따라가기: 그 주자 자리를 원점으로 당긴다. 원점이 주자와 같이 움직여 카메라가 따라간다.
            transformOrigin: cam ? `${cam.x}% ${cam.y}%` : undefined,
            scale: cam ? String(ZOOM) : undefined,
          }}
        >
          <span className="rc__track" />
          <span className="rc__infield" />
          {Array.from({ length: lanes - 1 }, (_, k) => {
            // 차선 사이 점선 — 차선 경계 반지름에 타원을 하나씩.
            const off = -ROAD / 2 + ((k + 1) * ROAD) / lanes;
            const rx = RX + off;
            const ry = RY + off;
            return (
              <span
                key={k}
                className="rc__laneLine"
                style={{
                  left: `${CX - rx}%`,
                  width: `${rx * 2}%`,
                  top: `${((CY - ry) / PLANE_H) * 100}%`,
                  height: `${((ry * 2) / PLANE_H) * 100}%`,
                }}
              />
            );
          })}
          <span className="rc__start" />
          {hazards.map((h) => {
            const p = trackPoint(h.d, laneOf(h.runner), laps);
            // 트랙 바깥(관중석) 쪽에서 날아온다 — 타원 중심에서 그 자리로 향하는 방향의 연장선.
            const dx = p.x - CX;
            const dy = ((p.y / 100) * PLANE_H - CY) * 1.6;
            const len = Math.hypot(dx, dy) || 1;
            return (
              <span
                key={h.key}
                className="rc__hazard"
                style={
                  {
                    left: `${p.x}%`,
                    top: `${p.y}%`,
                    '--tx': `${((dx / len) * 70).toFixed(1)}px`,
                    '--ty': `${((dy / len) * 70).toFixed(1)}px`,
                  } as React.CSSProperties
                }
              >
                {h.icon}
              </span>
            );
          })}
          {candidates.map((p, i) => {
            const { x, y, deg } = points[i];
            const ev = active[i];
            // 말은 세워 그린다 — 방향은 왼쪽/오른쪽 뒤집기만.
            const flip = theme === 'horse' && Math.cos((deg * Math.PI) / 180) < 0;
            return (
              <span
                key={p.id}
                data-breed={theme === 'horse' ? breedOf(i, round).name : undefined}
                className={[
                  'rc__runner',
                  ev ? `rc__runner--${ev}` : '',
                  rankOf.get(i) === 1 ? 'rc__runner--win' : '',
                  focus === i ? 'rc__runner--focus' : focus !== null ? 'rc__runner--dim' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: theme === 'car' ? `translate(-50%, -50%) rotate(${deg}deg)` : 'translate(-50%, -50%)',
                    zIndex: Math.round(y * 10),
                    '--px': `${px}px`,
                    '--flip': flip ? -1 : 1,
                  } as React.CSSProperties
                }
              >
                <span className="rc__shadow" />
                {ev === 'boost' && <span className="rc__flame" />}
                <span className="rc__body">
                  <span
                    className="rc__sprite"
                    style={{ width: px, height: px, boxShadow: paint(theme, i, n, frame, px, round) }}
                  />
                </span>
                {(ev === 'wobble' || ev === 'bump') && (
                  <>
                    <span className="rc__spark rc__spark--1" />
                    <span className="rc__spark rc__spark--2" />
                    <span className="rc__spark rc__spark--3" />
                    {ev === 'wobble' && theme === 'car' && <span className="rc__tire" />}
                  </>
                )}
                {ev === 'crash' && <span className="rc__smoke" />}
                {bubbles?.[i] && <span className="rc__bubble">{bubbles[i]}</span>}
                {theme === 'horse' && (ev === 'boost' || ev === 'crash') && <span className="rc__dust" />}
              </span>
            );
          })}
        </div>
      </div>
      <ol className="rc__standing" aria-label="지금 순위 — 이름을 누르면 그 주자를 따라가요">
        {standing.map((i, r) => (
          <li key={candidates[i].id}>
            <button
              type="button"
              className={rankOf.get(i) === 1 ? 'rc__pos rc__pos--win' : 'rc__pos'}
              title={theme === 'horse' ? `${candidates[i].name} · ${breedOf(i, round).name}` : candidates[i].name}
              aria-pressed={focus === i}
              onClick={() => onFocus(focus === i ? null : i)}
            >
              <span className="rc__posNo">{r + 1}</span>
              <span className="rc__posDot" style={{ background: runnerColor(i, n) }} aria-hidden="true" />
              {shortName(candidates[i].name, n > 10 ? 4 : 6)}
              {active[i] && <span aria-hidden="true">{STAND_ICON[theme][active[i]]}</span>}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
