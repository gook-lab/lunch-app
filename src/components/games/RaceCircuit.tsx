/**
 * 레이싱 서킷 — 위에서 본 픽셀 자동차가 기울인(perspective) 타원 트랙을 두 바퀴 돈다.
 *
 * 차는 트랙 판 위에 그림자를 두고 살짝 떠 있어(translateZ) 판을 기울이면 입체로 보인다.
 * 사건 연출: 부스터(불꽃·속도선) · 타이어 펑크(불꽃 튐·바퀴 날아감·흔들림) ·
 * 전복(제자리 옆구르기). 위치·순위 계산은 PixelRace 가 하고, 여기는 그리기만 한다.
 */
import type { Place } from '../../lib/candidates';
import { categoryHue } from '../../lib/category';
import type { RaceEventKind } from '../../lib/race';
import { shortName } from '../../lib/name';

const LAPS = 2;

/** 트랙 판 좌표(가로 100 × 세로 PLANE_H). 타원 중심과 반지름. */
const PLANE_H = 64;
const CX = 50;
const CY = PLANE_H / 2;
const RX = 38;
const RY = 21;
/** 차선 폭(판 단위). 차가 많아도 이 안에서 나눠 선다. */
const LANE_SPAN = 9;

const CAR = ['..kk....kk..', 'kbbbbbbbbbb.', 'kbbbbggbbbbw', 'kbbbbggbbbbw', 'kbbbbbbbbbb.', '..kk....kk..'];

function carShadow(hue: number, px: number): string {
  const colors: Record<string, string> = {
    b: `oklch(0.62 0.18 ${hue})`,
    g: 'oklch(0.86 0.04 230)',
    k: 'var(--color-neutral-900)',
    w: 'oklch(0.95 0.12 95)',
  };
  const out: string[] = [];
  CAR.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (colors[ch]) out.push(`${(x + 1) * px}px ${(y + 1) * px}px 0 ${colors[ch]}`);
    }),
  );
  return out.join(',');
}

/** 거리 d(0~1, 두 바퀴) → 판 위 위치(%)와 진행 방향(도). 출발선은 아래 가운데. */
function circuitPoint(d: number, lane: number): { x: number; y: number; deg: number } {
  const theta = Math.PI / 2 + d * LAPS * 2 * Math.PI;
  const rx = RX + lane;
  const ry = RY + lane;
  const x = CX + rx * Math.cos(theta);
  const y = CY + ry * Math.sin(theta);
  const deg = (Math.atan2(ry * Math.cos(theta), -rx * Math.sin(theta)) * 180) / Math.PI;
  return { x, y: (y / PLANE_H) * 100, deg };
}

interface Props {
  candidates: Place[];
  dist: number[];
  rankOf: Map<number, number>;
  active: (RaceEventKind | null)[];
  px: number;
}

export function RaceCircuit({ candidates, dist, rankOf, active, px }: Props) {
  const n = candidates.length;
  const lead = Math.max(...dist);
  const lap = Math.min(LAPS, 1 + Math.floor(lead * LAPS + 1e-9));
  // 지금 순서(들어온 차는 등수, 나머지는 달린 거리 순).
  const standing = candidates
    .map((_, i) => i)
    .sort((a, b) => (rankOf.get(a) ?? 99) - (rankOf.get(b) ?? 99) || dist[b] - dist[a]);
  return (
    <div className="rc">
      <div className="rc__stage" aria-hidden="true">
        <span className="rc__lap">{lead >= 1 ? 'FINISH' : lap === LAPS ? 'FINAL LAP' : `LAP ${lap}/${LAPS}`}</span>
        <div className="rc__plane" style={{ aspectRatio: `100 / ${PLANE_H}` }}>
          <span className="rc__track" />
          <span className="rc__infield" />
          <span className="rc__start" />
          {candidates.map((p, i) => {
            const lane = n === 1 ? 0 : (i / (n - 1) - 0.5) * LANE_SPAN;
            const { x, y, deg } = circuitPoint(dist[i], lane);
            const ev = active[i];
            return (
              <span
                key={p.id}
                className={['rc__car', ev ? `rc__car--${ev}` : '', rankOf.get(i) === 1 ? 'rc__car--win' : '']
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    left: `${x}%`,
                    top: `${y}%`,
                    transform: `translate(-50%, -50%) rotate(${deg}deg)`,
                    zIndex: Math.round(y * 10),
                    '--px': `${px}px`,
                  } as React.CSSProperties
                }
              >
                <span className="rc__shadow" />
                {ev === 'boost' && <span className="rc__flame" />}
                <span className="rc__body">
                  <span
                    className="rc__sprite"
                    style={{
                      width: px,
                      height: px,
                      boxShadow: carShadow(categoryHue(p.category), px),
                    }}
                  />
                </span>
                {ev === 'wobble' && (
                  <>
                    <span className="rc__spark rc__spark--1" />
                    <span className="rc__spark rc__spark--2" />
                    <span className="rc__spark rc__spark--3" />
                    <span className="rc__tire" />
                  </>
                )}
                {ev === 'crash' && <span className="rc__smoke" />}
              </span>
            );
          })}
        </div>
      </div>
      <ol className="rc__standing" aria-label="지금 순위">
        {standing.map((i, r) => (
          <li key={candidates[i].id} className={rankOf.get(i) === 1 ? 'rc__pos rc__pos--win' : 'rc__pos'}>
            <span className="rc__posNo">{r + 1}</span>
            <span
              className="rc__posDot"
              style={{
                background: `oklch(0.62 0.18 ${categoryHue(candidates[i].category)})`,
              }}
              aria-hidden="true"
            />
            {shortName(candidates[i].name, n > 10 ? 4 : 6)}
            {active[i] && (
              <span aria-hidden="true">{active[i] === 'boost' ? ' 🔥' : active[i] === 'crash' ? ' 💫' : ' 💥'}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
