/**
 * 경주 트랙 — 기울인(perspective) 타원 위를 달린다. 레이싱은 아스팔트 서킷 세 바퀴,
 * 경마는 흙 주로 한 바퀴.
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

const LAPS: Record<TrackTheme, number> = { horse: 1, car: 3 };

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
function sprite(rows: string[], colors: Record<string, string>, px: number): string {
  const out: string[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) out.push(`${(x + 1) * px}px ${(y + 1) * px}px 0 ${colors[ch]}`);
    }),
  );
  return out.join(',');
}

function paint(theme: TrackTheme, i: number, n: number, frame: number, px: number): string {
  if (theme === 'car') {
    return sprite(
      CAR,
      { b: runnerColor(i, n), g: 'oklch(0.86 0.04 230)', k: 'var(--color-neutral-900)', w: 'oklch(0.95 0.12 95)' },
      px,
    );
  }
  // 말은 갈색 그대로, 기수 옷(모자·윗옷) 색으로 가른다.
  return sprite(
    HORSE[frame],
    { b: 'oklch(0.48 0.08 55)', m: 'var(--color-neutral-900)', j: runnerColor(i, n), c: runnerColor(i, n, true) },
    px,
  );
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
  car: { boost: ' 🔥', crash: ' 💫', bump: ' 💢', wobble: ' 💥' },
  horse: { boost: ' 🥕', crash: ' 💥', bump: ' 💢', wobble: ' 💫' },
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
}

export function RaceCircuit({ theme, candidates, dist, rankOf, active, bubbles, px, frame, focus, onFocus }: Props) {
  const n = candidates.length;
  const laps = LAPS[theme];
  const lanes = Math.min(n, MAX_LANES);
  const lead = Math.max(...dist);
  const lap = Math.min(laps, 1 + Math.floor(lead * laps + 1e-9));
  const points = candidates.map((_, i) => trackPoint(dist[i], laneOffset(i % lanes, lanes), laps));
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
    <div className={`rc rc--${theme}`}>
      <div className="rc__stage" aria-hidden="true">
        {lapText && <span className="rc__lap">{lapText}</span>}
        {focus !== null && (
          <span className="rc__tag">
            📍 {shortName(candidates[focus].name, 8)}
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
          {candidates.map((p, i) => {
            const { x, y, deg } = points[i];
            const ev = active[i];
            // 말은 세워 그린다 — 방향은 왼쪽/오른쪽 뒤집기만.
            const flip = theme === 'horse' && Math.cos((deg * Math.PI) / 180) < 0;
            return (
              <span
                key={p.id}
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
                    style={{ width: px, height: px, boxShadow: paint(theme, i, n, frame, px) }}
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
