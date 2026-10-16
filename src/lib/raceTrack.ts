/**
 * 경주 트랙 모양 — 타원 하나뿐이던 코스를 몇 가지로 (10/16 사용자: "맵 2~3개 추가").
 *
 * 모양은 각도 θ 하나로 도는 닫힌 곡선이다. 주자 자리는 PixelRace 가 정한 거리 d(0~1)를
 * θ 로 바꿔 찍기만 하므로, 모양을 바꿔도 순위·당첨은 그대로다(그리기 전용).
 * 차선은 곡선의 바깥쪽 법선 방향으로 벌린다 — 타원일 때 예전처럼 반지름에 더하는 것과 같다.
 *
 * 좌표는 판 단위(가로 100 × 세로 PLANE_H). 가로·세로 단위가 같아 법선 거리가 화면에서도 같다.
 */
export const PLANE_H = 64;
const CX = 50;
const CY = PLANE_H / 2;
const RX = 38;
const RY = 21;

export const TRACK_SHAPES = ['oval', 'stadium', 'tri', 'bean'] as const;
export type TrackShape = (typeof TRACK_SHAPES)[number];

export const TRACK_LABEL: Record<TrackShape, string> = {
  oval: '타원',
  stadium: '스타디움',
  tri: '삼각',
  bean: '콩팥',
};

/** 차선은 주자 수만큼, 최대 10개. 6개를 넘으면 도로를 넓힌다 — 6차선에 16명이 겹쳐 달렸다(10/16 사용자). */
export const MAX_LANES = 10;
export function laneCount(n: number): number {
  return Math.max(1, Math.min(n, MAX_LANES));
}
export function roadWidth(lanes: number): number {
  return 13 + Math.max(0, lanes - 6); // 10차선이면 17 — 바깥 연석이 판 끝(세로 64)에 닿기 전까지
}
/** k 번째 차선 가운데(도로 가운데선에서 바깥쪽 +). */
export function laneOffset(k: number, lanes: number): number {
  const road = roadWidth(lanes);
  return -road / 2 + ((k + 0.5) * road) / lanes;
}

/** 단위 곡선. 출발선이 있는 아래 가운데(θ = π/2)는 어느 모양이든 평평하게 둔다. */
function unit(shape: TrackShape, t: number): [number, number] {
  const c = Math.cos(t);
  const s = Math.sin(t);
  switch (shape) {
    case 'stadium': {
      // 초타원(p=4) — 직선 구간이 긴 둥근 사각.
      return [Math.sign(c) * Math.abs(c) ** 0.5, Math.sign(s) * Math.abs(s) ** 0.5];
    }
    case 'tri': {
      // 꼭짓점 셋, 아래 변이 평평한 둥근 삼각. 최대 반지름이 1 이 되게 나눈다.
      const r = (1 - 0.09 * Math.cos(3 * (t - Math.PI / 2))) / 1.09; // 0.13 이면 안쪽 연석이 모서리에서 접혀 뾰족했다
      return [c * r, s * r];
    }
    case 'bean': {
      // 위쪽 가운데가 안으로 들어간 콩팥.
      let a = t + Math.PI / 2; // 위(θ = -π/2)에서 0
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const r = 1 - 0.32 * Math.exp(-(a * a) / 0.3);
      return [c * r, s * r];
    }
    default:
      return [c, s];
  }
}

function base(shape: TrackShape, t: number): [number, number] {
  const [u, v] = unit(shape, t);
  return [CX + RX * u, CY + RY * v];
}

/** θ 에서 차선 lane 만큼 바깥으로 민 점(판 단위)과 진행 방향(도, 화면 기준). */
export function trackAt(shape: TrackShape, t: number, lane: number): { x: number; y: number; deg: number } {
  const e = 1e-3;
  const [x0, y0] = base(shape, t - e);
  const [x1, y1] = base(shape, t + e);
  const [x, y] = base(shape, t);
  const tx = x1 - x0;
  const ty = y1 - y0;
  const len = Math.hypot(tx, ty) || 1;
  // θ 가 늘면 시계 방향(화면 y 아래)이라 (ty, -tx) 가 바깥쪽 — 중심 반대편인지 확인해 맞춘다.
  let nx = ty / len;
  let ny = -tx / len;
  if (nx * (x - CX) + ny * (y - CY) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: x + nx * lane, y: y + ny * lane, deg: (Math.atan2(ty, tx) * 180) / Math.PI };
}

/** 거리 d(0~1, 전체 바퀴) → 화면 %. 출발선은 아래 가운데. */
export function trackPoint(shape: TrackShape, d: number, lane: number, laps: number): { x: number; y: number; deg: number } {
  const p = trackAt(shape, Math.PI / 2 + d * laps * 2 * Math.PI, lane);
  return { x: p.x, y: (p.y / PLANE_H) * 100, deg: p.deg };
}

/** 차선 lane 을 따라 한 바퀴 도는 SVG 경로(판 단위, viewBox 0 0 100 PLANE_H). */
export function trackPath(shape: TrackShape, lane: number, steps = 144): string {
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const p = trackAt(shape, (i / steps) * 2 * Math.PI, lane);
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/**
 * 출발 대열. 한 차선에 여럿이면(주자 > 차선) 뒷줄은 출발선 뒤에 선다 — 한 점에 겹쳐 서 있었다.
 * 그 간격은 처음 1/4 바퀴 동안 줄어 사라지므로 결승 장면·순위는 그대로다.
 */
export function gridBack(row: number, d: number, laps: number): number {
  if (row <= 0) return 0;
  const fade = Math.max(0, 1 - d * laps * 4);
  return (row * 0.022 * fade) / laps;
}
