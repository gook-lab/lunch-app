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

/** 15분 링 반지름. */
const R_15 = 150;
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
/** 링 알약 각도. 조각 경계선(살) 위다. */
const PILL_DEG = 0;

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

/**
 * 도보시간 → 반지름. 제곱근 눈금이라 가까운 쪽이 넓게 펴진다. 양쪽 다 가둔다.
 *
 * 1분 = 10 의 직선 눈금에서는 사무실 앞 5분 안 가게들이 반지름 50 안에 몰려
 * 점과 이름이 서로 덮였다(10/9 UI 점검, 가게 4곳이 전부 5분 안). 점심 가게는
 * 대부분 가까우니 가까운 쪽을 크게 보여 주는 게 맞다. 5분 링이 100, 10분이 128.
 */
export function radiusForWalk(walkMin: number): number {
  // 0분이 R_MIN, 15분이 R_15. 바닥을 R_MIN 에서 시작해야 1분과 3분이 한 반지름으로
  // 뭉개지지 않는다(실데이터에 1분짜리가 둘이다).
  const r = R_MIN + (R_15 - R_MIN) * Math.sqrt(Math.max(walkMin, 0) / 15);
  return Math.min(r, R_MAX);
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
  /** 라벨 자리. 아래 → 위 → 오른쪽 → 왼쪽 순으로 빈 곳을 찾는다. */
  labelSide: LabelSide;
}

export type LabelSide = 'below' | 'above' | 'right' | 'left';

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

/*
 * 알약 반지름. 제곱근 눈금에선 10분·15분 링 간격(22)이 알약 높이(24)보다 좁아
 * 한 줄에 두면 겹친다. 바깥 링 알약은 링 바깥에, 나머지는 링 안쪽에 붙인다.
 */
const PILL_INSET = 12;
function pillR(step: number, r: number): number {
  return step === WALK_STEPS[WALK_STEPS.length - 1] ? r + PILL_INSET : r - PILL_INSET;
}

/*
 * 점이 링 알약 밑에 깔리면 정북 쪽으로 밀어낸다. 알약은 정북 경계선 위라 한식(오른쪽)
 * 조각 점은 시계방향, 중식(왼쪽) 조각 점은 반시계방향으로 1도씩 민다. 알약과 반지름이
 * 먼 점은 그대로라 조각 전체를 비우는 것보다 덜 붐빈다.
 */
function clearOfPills(deg: number, r: number, dotR: number, rings: readonly RoadmapRing[]): number {
  const pills = fixedBoxes(rings).slice(2);
  const hit = (d: number) => {
    const at = pointAt(r, d);
    return pills.some((p) => at.x + dotR > p.x1 && at.x - dotR < p.x2 && at.y + dotR > p.y1 && at.y - dotR < p.y2);
  };
  const step = deg < 180 ? 1 : -1;
  let d = deg;
  for (let n = 0; n < 45 && hit(d); n += 1) d += step;
  return d;
}

const isLabelled = (status: PlaceStatus) => status !== 'out' && status !== 'off';

/*
 * 조각 안 각도 칸 나누기. 이름이 붙는 점(후보·다시 넣음·최근 제외)끼리 칸을
 * 최대한 벌리고, 이름 없는 점(조건 밖·꺼짐)이 사이를 채운다. 순서대로 칸을 주면
 * 꺼 둔 가게가 칸을 먹어 켜진 가게끼리 붙었다 — 한식 여섯 곳 중 켜진 셋이 이웃 칸에
 * 몰려 점이 서로 덮였다(10/9 실데이터). 같은 처지끼리는 가까운 순서를 지킨다.
 * 반환값은 list 의 j 번째가 앉을 칸 번호다.
 */
export function spreadSlots(labelled: readonly boolean[]): number[] {
  const n = labelled.length;
  const k = labelled.filter(Boolean).length;
  const wanted = Array.from({ length: k }, (_, i) => (k === 1 ? (n - 1) / 2 : (i * (n - 1)) / (k - 1)));
  const used = new Set<number>();
  const named = wanted.map((w) => {
    let best = -1;
    for (let c = 0; c < n; c += 1) if (!used.has(c) && (best < 0 || Math.abs(c - w) < Math.abs(best - w))) best = c;
    used.add(best);
    return best;
  });
  const rest = Array.from({ length: n }, (_, c) => c).filter((c) => !used.has(c));
  let a = 0;
  let b = 0;
  return labelled.map((on) => (on ? named[a++] : rest[b++]));
}

export function buildRoadmap(
  places: readonly Place[],
  filters: Filters,
  result: CandidateResult,
): RoadmapModel {
  const rings: RoadmapRing[] = WALK_STEPS.map((step) => {
    const r = radiusForWalk(step);
    // 알약은 정북 조각 경계선 위에 둔다. 가게 점은 경계선을 피해 찍히므로 안 겹친다.
    // 예전 330도는 한 조각에 가게가 하나일 때 그 점과 각도가 같아 이름이 숨겨졌다.
    const at = pointAt(pillR(step, r), PILL_DEG);
    return {
      walkMin: step,
      r,
      label: `${step}분`,
      on: filters.maxWalkMin === step,
      left: pct(at.x),
      top: pct(at.y),
    };
  });

  // 나라로 고르고 있으면 조각은 하나도 켜지 않는다(점은 placeStatus 가 나라로 거른다).
  const nothingPicked = filters.categories.length === 0 && !(filters.cuisines && filters.cuisines.length > 0);

  const wedges: RoadmapWedge[] = CATEGORIES.map((category, i) => {
    const on = filters.categories.includes(category);
    const at = pointAt(LABEL_R, i * WEDGE_DEG + WEDGE_DEG / 2);
    return {
      category,
      path: wedgePath(WEDGE_R, i * WEDGE_DEG, (i + 1) * WEDGE_DEG),
      fillPath: on
        ? wedgePath(radiusForWalk(filters.maxWalkMin), i * WEDGE_DEG, (i + 1) * WEDGE_DEG)
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

    const slot = spreadSlots(list.map((p) => isLabelled(placeStatus(p, filters, result))));
    list.forEach((place, j) => {
      const deg = clearOfPills(
        i * WEDGE_DEG + ((slot[j] + 1) * WEDGE_DEG) / (list.length + 1),
        radiusForWalk(place.walkMin),
        DOT_R[placeStatus(place, filters, result)],
        rings,
      );
      const at = pointAt(radiusForWalk(place.walkMin), deg);
      const status = placeStatus(place, filters, result);
      const labelled = isLabelled(status);
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
        labelSide: 'below',
      });
    });
  });

  // CATEGORIES 에 없는 카테고리(지도에서 자유 입력)는 위에서 빠진다.
  // 빠뜨리면 목록에는 있는데 로드맵에 없는 가게가 생겨 화면이 거짓말을 한다.
  const drawn = new Set(dots.map((d) => d.place.id));
  const others = places.filter((p) => !drawn.has(p.id));
  others.forEach((place, j) => {
    // 조각 사이 경계선 위에 순서대로 얹는다.
    const status = placeStatus(place, filters, result);
    const deg = clearOfPills((j * WEDGE_DEG) % 360, radiusForWalk(place.walkMin), DOT_R[status], rings);
    const at = pointAt(radiusForWalk(place.walkMin), deg);
    dots.push({
      place,
      status,
      x: at.x,
      y: at.y,
      r: DOT_R[status],
      left: pct(at.x),
      top: pct(at.y + DOT_R[status] + 3),
      label: place.name.replace(/^샘플 /, ''),
      labelled: isLabelled(status),
      labelAbove: false,
      labelSide: 'below',
    });
  });

  resolveLabels(dots, rings);

  return { discR: radiusForWalk(filters.maxWalkMin), rings, wedges, spokes, dots };
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
  const off = dot.r + LABEL_GAP;
  switch (dot.labelSide) {
    case 'above':
      return { x1: dot.x - w / 2, x2: dot.x + w / 2, y1: dot.y - off - LABEL_H, y2: dot.y - off };
    case 'right':
      return { x1: dot.x + off, x2: dot.x + off + w, y1: dot.y - LABEL_H / 2, y2: dot.y + LABEL_H / 2 };
    case 'left':
      return { x1: dot.x - off - w, x2: dot.x - off, y1: dot.y - LABEL_H / 2, y2: dot.y + LABEL_H / 2 };
    default:
      return { x1: dot.x - w / 2, x2: dot.x + w / 2, y1: dot.y + off, y2: dot.y + off + LABEL_H };
  }
}

/** 라벨 상자의 기준점(CSS left/top). 쪽마다 CSS translate 가 다르다. */
function labelAnchor(dot: RoadmapDot, box: Box): { x: number; y: number } {
  switch (dot.labelSide) {
    case 'right':
      return { x: box.x1, y: dot.y };
    case 'left':
      return { x: box.x2, y: dot.y };
    default:
      return { x: dot.x, y: box.y1 };
  }
}

const intersects = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/*
 * 라벨이 피해야 하는 고정 상자들. 사무실 표시와 그 아래 "사무실" 글자, 링 알약.
 * 점끼리만 피하면 가까운 가게 이름이 "사무실" 위에 얹혔다(10/9 UI 점검).
 * 알약은 높이 18px, "15분" 폭 약 40px 이라 VIEW 단위로 54×24 쯤이다.
 */
export function fixedBoxes(rings: readonly RoadmapRing[]): Box[] {
  const pillW = 54;
  const pillH = 24;
  return [
    { x1: CX - 8, y1: CY - 8, x2: CX + 8, y2: CY + 8 },
    // .rm__here: top 52.5% = 210, 글자 높이 약 16 단위, 폭 "사무실" 세 자.
    { x1: CX - 22, y1: CY + 10, x2: CX + 22, y2: CY + 27 },
    ...rings.map((r) => {
      const at = pointAt(pillR(r.walkMin, r.r), PILL_DEG);
      return { x1: at.x - pillW / 2, y1: at.y - pillH / 2, x2: at.x + pillW / 2, y2: at.y + pillH / 2 };
    }),
  ];
}

function resolveLabels(dots: RoadmapDot[], rings: readonly RoadmapRing[]): void {
  const taken: Box[] = fixedBoxes(rings);
  const free = (box: Box) => !taken.some((t) => intersects(box, t));
  const order = dots
    .filter((d) => d.labelled)
    .sort((a, b) =>
      a.place.walkMin === b.place.walkMin
        ? a.place.id.localeCompare(b.place.id)
        : a.place.walkMin - b.place.walkMin,
    );
  // 점도 피한다. 남의 점 위에 이름이 얹히면 그 점이 안 보인다.
  const dotBoxes = dots.map((d) => ({ id: d.place.id, box: { x1: d.x - d.r, y1: d.y - d.r, x2: d.x + d.r, y2: d.y + d.r } }));
  const SIDES: LabelSide[] = ['below', 'above', 'right', 'left'];
  for (const d of order) {
    const others = dotBoxes.filter((o) => o.id !== d.place.id).map((o) => o.box);
    const fits = (sd: LabelSide, avoidDots: boolean) => {
      d.labelSide = sd;
      const box = labelBox(d);
      return free(box) && box.x1 >= 0 && box.x2 <= VIEW && !(avoidDots && others.some((o) => intersects(box, o)));
    };
    // 남의 점까지 피하는 자리가 먼저, 없으면 라벨끼리만 안 겹치는 자리. 아주 붐비는
    // 조각에선 점끼리 간격이 점 지름보다 좁아 점을 다 피하는 자리가 없다.
    const side = SIDES.find((sd) => fits(sd, true)) ?? SIDES.find((sd) => fits(sd, false));
    if (!side) {
      d.labelSide = 'below';
      d.labelAbove = false;
      d.labelled = false;
      continue;
    }
    const box = labelBox(d);
    const at = labelAnchor(d, box);
    d.labelAbove = side === 'above';
    d.left = pct(at.x);
    d.top = pct(at.y);
    taken.push(box);
  }
}

/** 점이 어느 각도에 있는지. 기하 검증에 쓴다. */
export function degreeOf(x: number, y: number): number {
  const deg = (Math.atan2(x - CX, CY - y) * 180) / Math.PI;
  return (deg + 360) % 360;
}
