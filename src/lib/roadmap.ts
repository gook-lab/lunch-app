/**
 * 도보권 지도 — 결정 화면의 로드맵 (시안 1a).
 *
 * 실제 위경도를 쓰지 않는다. 반지름은 도보시간, 각도는 카테고리다. 지리적으로는
 * 거짓이지만 이 화면이 답해야 하는 질문은 "어디 있나" 가 아니라 "지금 필터에서
 * 무엇이 후보이고 무엇이 왜 빠졌나" 다. 진짜 지도는 지도 탭이 따로 있다.
 *
 * 좌표 계산만 여기 두고 색·두께는 CSS 가 맡는다. 기하가 틀리면 점이 엉뚱한
 * 카테고리 조각에 얹히는데, 그건 브라우저를 열지 않고도 잡을 수 있어야 한다.
 */
import { placeStatus, WALK_STEPS, type Filters, type Place, type PlaceStatus, type CandidateResult } from './candidates';
import { CATEGORIES } from './category';

/** viewBox 는 400×400, 사무실이 가운데다. */
export const VIEW = 400;
const CX = VIEW / 2;
const CY = VIEW / 2;

/** 도보 1분 = 반지름 10. 15분 링이 150 이다. */
const R_PER_MIN = 10;
/**
 * 바깥 테두리. 도보 상한이 15분이므로 그보다 먼 곳은 전부 여기 얹힌다.
 * 60분과 20분을 구분해 그릴 이유가 없다 — 둘 다 "범위 밖" 이고,
 * 안 자르면 viewBox 를 넘어가 화면에서 사라진다.
 */
const R_MAX = 168;
/** 카테고리 조각의 바깥 반지름과 라벨 반지름. */
const WEDGE_R = 178;
const LABEL_R = 184;
const SPOKE_R = 172;

const WEDGE_DEG = 360 / CATEGORIES.length;

/** 0도가 북쪽, 시계방향. */
export function pointAt(r: number, deg: number): { x: number; y: number } {
  const a = (deg * Math.PI) / 180;
  return { x: CX + r * Math.sin(a), y: CY - r * Math.cos(a) };
}

/** viewBox 좌표를 컨테이너 백분율로. 400 폭이라 4로 나눈다. */
const pct = (v: number) => `${v / 4}%`;

function wedgePath(r: number, from: number, to: number): string {
  const a = pointAt(r, from);
  const b = pointAt(r, to);
  return `M${CX} ${CY} L${a.x} ${a.y} A${r} ${r} 0 0 1 ${b.x} ${b.y} Z`;
}

/**
 * 안쪽 한계. 이보다 가까운 곳은 사무실 표시와 "사무실" 글자 위에 얹혀
 * 둘 다 못 읽게 된다. 5분 링(r=50)보다 안쪽이라 그림이 거짓말하지는 않는다.
 */
const R_MIN = 32;

/** 도보시간 → 반지름. 양쪽 다 가둔다. */
export function radiusForWalk(walkMin: number): number {
  return Math.min(Math.max(walkMin * R_PER_MIN, R_MIN), R_MAX);
}

export interface RoadmapRing {
  walkMin: number;
  r: number;
  label: string;
  on: boolean;
  left: string;
  top: string;
}

export interface RoadmapWedge {
  category: string;
  /** 누를 수 있는 투명 조각. */
  path: string;
  /** 고른 카테고리를 도보 원 안에서만 칠하는 조각. 안 골랐으면 null. */
  fillPath: string | null;
  on: boolean;
  /** 아무것도 안 고른 상태에서는 전부 진하게 읽힌다. */
  dimmed: boolean;
  left: string;
  top: string;
}

export interface RoadmapDot {
  place: Place;
  status: PlaceStatus;
  x: number;
  y: number;
  /** 점 반지름. SVG 의 r 은 CSS 로도 되지만 브라우저마다 다르므로 값으로 넘긴다. */
  r: number;
  left: string;
  top: string;
  /** 점 옆 라벨. "샘플 " 은 떼서 좁은 화면에서 읽히게 한다. */
  label: string;
  /** 이름을 보여줄 처지인가. 범위 밖·꺼짐은 숨긴다. */
  labelled: boolean;
  /** 라벨을 점 위에 놓았다(아래가 다른 라벨과 겹쳐서). */
  labelAbove: boolean;
}

export interface RoadmapModel {
  /** 고른 도보 범위를 칠하는 원의 반지름. */
  discR: number;
  rings: RoadmapRing[];
  wedges: RoadmapWedge[];
  spokes: { x: number; y: number }[];
  dots: RoadmapDot[];
}

/** 점 반지름. 처지마다 다르고, 라벨 위치 계산에 쓰인다. */
const DOT_R: Record<PlaceStatus, number> = {
  candidate: 6,
  released: 5,
  recent: 5,
  out: 3.5,
  off: 3.5,
};

export function buildRoadmap(
  places: readonly Place[],
  filters: Filters,
  result: CandidateResult,
): RoadmapModel {
  const rings: RoadmapRing[] = WALK_STEPS.map((step) => {
    const r = step * R_PER_MIN;
    // 알약은 링 위 북북서쯤에 둔다. 링마다 겹치지 않는 위치가 필요하다.
    const at = pointAt(r, 330);
    return {
      walkMin: step,
      r,
      label: `${step}분`,
      on: filters.maxWalkMin === step,
      left: pct(at.x),
      top: pct(at.y),
    };
  });

  const nothingPicked = filters.categories.length === 0;

  const wedges: RoadmapWedge[] = CATEGORIES.map((category, i) => {
    const on = filters.categories.includes(category);
    const at = pointAt(LABEL_R, i * WEDGE_DEG + WEDGE_DEG / 2);
    return {
      category,
      path: wedgePath(WEDGE_R, i * WEDGE_DEG, (i + 1) * WEDGE_DEG),
      fillPath: on
        ? wedgePath(filters.maxWalkMin * R_PER_MIN, i * WEDGE_DEG, (i + 1) * WEDGE_DEG)
        : null,
      on,
      dimmed: !on && !nothingPicked,
      left: pct(at.x),
      top: pct(at.y),
    };
  });

  const spokes = CATEGORIES.map((_, i) => pointAt(SPOKE_R, i * WEDGE_DEG));

  const dots: RoadmapDot[] = [];
  CATEGORIES.forEach((category, i) => {
    // 같은 카테고리 안에서는 가까운 곳부터 각도를 나눠 준다. 같은 도보시간이
    // 겹쳐도 각도가 달라 점이 하나로 뭉치지 않는다.
    const list = places
      .filter((p) => p.category === category)
      .sort((a, b) => (a.walkMin === b.walkMin ? a.id.localeCompare(b.id) : a.walkMin - b.walkMin));

    list.forEach((place, j) => {
      const deg = i * WEDGE_DEG + ((j + 1) * WEDGE_DEG) / (list.length + 1);
      const at = pointAt(radiusForWalk(place.walkMin), deg);
      const status = placeStatus(place, filters, result);
      const labelled = status !== 'out' && status !== 'off';
      dots.push({
        place,
        status,
        x: at.x,
        y: at.y,
        r: DOT_R[status],
        left: pct(at.x),
        top: pct(at.y + DOT_R[status] + 3),
        label: place.name.replace(/^샘플 /, ''),
        labelled,
        labelAbove: false,
      });
    });
  });

  // CATEGORIES 에 없는 카테고리(지도에서 자유 입력)는 위에서 빠진다.
  // 빠뜨리면 목록에는 있는데 로드맵에 없는 가게가 생겨 화면이 거짓말을 한다.
  const drawn = new Set(dots.map((d) => d.place.id));
  const others = places.filter((p) => !drawn.has(p.id));
  others.forEach((place, j) => {
    // 조각 사이 경계선 위에 순서대로 얹는다.
    const deg = (j * WEDGE_DEG) % 360;
    const at = pointAt(radiusForWalk(place.walkMin), deg);
    const status = placeStatus(place, filters, result);
    dots.push({
      place,
      status,
      x: at.x,
      y: at.y,
      r: DOT_R[status],
      left: pct(at.x),
      top: pct(at.y + DOT_R[status] + 3),
      label: place.name.replace(/^샘플 /, ''),
      labelled: status !== 'out' && status !== 'off',
      labelAbove: false,
    });
  });

  resolveLabels(dots);

  return { discR: filters.maxWalkMin * R_PER_MIN, rings, wedges, spokes, dots };
}

/*
 * 라벨 충돌 회피.
 *
 * 한 조각(60도)에 가게가 다섯이면 라벨이 서로 덮는다 — 20곳 픽스처에서
 * 라벨 20개 중 11쌍이 겹쳤다. 가까운 곳부터 자리를 잡고, 아래가 겹치면
 * 점 위로 올리고, 위도 겹치면 라벨을 숨긴다. 점은 남으니 가게가 사라지는
 * 건 아니고, 이름은 목록 탭에 있다.
 *
 * 글자 폭은 추정이다. 라벨은 HTML 이라 SVG 좌표로 재지 못한다. 무대 폭
 * 300px 에 viewBox 400 이라 1px = 4/3 단위, 9.5px 글꼴에서 한글 한 자는
 * 약 12.7 단위다. 무대가 300px 보다 좁으면 라벨이 상대적으로 커져 추정이
 * 작아지는데, 그 경우는 390px 폰에서도 무대가 300px 이라 실제로는 없다.
 */
const LABEL_H = 13;
const LABEL_GAP = 3;

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** 라벨 글자 폭 추정(VIEW 단위). */
export function labelWidth(label: string): number {
  let w = 0;
  for (const ch of label) {
    if (/[가-힣]/.test(ch)) w += 12.7;
    else if (ch === ' ') w += 4;
    else w += 7;
  }
  return w;
}

/** 라벨이 차지하는 상자(VIEW 단위). 테스트가 겹침을 재는 데 쓴다. */
export function labelBox(dot: RoadmapDot): Box {
  const w = labelWidth(dot.label);
  const y1 = dot.labelAbove
    ? dot.y - dot.r - LABEL_GAP - LABEL_H
    : dot.y + dot.r + LABEL_GAP;
  return { x1: dot.x - w / 2, x2: dot.x + w / 2, y1, y2: y1 + LABEL_H };
}

const intersects = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

function resolveLabels(dots: RoadmapDot[]): void {
  const taken: Box[] = [];
  const free = (box: Box) => !taken.some((t) => intersects(box, t));
  const order = dots
    .filter((d) => d.labelled)
    .sort((a, b) =>
      a.place.walkMin === b.place.walkMin
        ? a.place.id.localeCompare(b.place.id)
        : a.place.walkMin - b.place.walkMin,
    );
  for (const d of order) {
    const below = labelBox(d);
    if (free(below)) {
      taken.push(below);
      continue;
    }
    d.labelAbove = true;
    const above = labelBox(d);
    if (free(above)) {
      d.top = pct(above.y1);
      taken.push(above);
      continue;
    }
    d.labelAbove = false;
    d.labelled = false;
  }
}

/** 점이 어느 각도에 있는지. 기하 검증에 쓴다. */
export function degreeOf(x: number, y: number): number {
  const deg = (Math.atan2(x - CX, CY - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}
