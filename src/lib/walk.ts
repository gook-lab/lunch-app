/**
 * 도보시간 추정 — 직선거리 × 1.3 ÷ 67 m/분 (설계).
 *
 * 실측이 아니라 추정이다. 설계가 정한 교체 트리거는
 * "시드 12곳 중 2곳 이상에서 실제 도보시간과 2분 넘게 차이" 이고,
 * 판단은 첫 사용자가 직접 걸어보고 한다. 그때 카카오 길찾기로 바꾼다.
 *
 * 1.3 은 직선거리를 실제 보행 경로로 환산하는 우회 계수이고,
 * 67 m/분은 성인 보통 걸음 속도다. 둘 다 추정값이라는 것을 숨기지 않는다.
 */

const DETOUR_FACTOR = 1.3;
const METERS_PER_MINUTE = 67;
const EARTH_RADIUS_M = 6_371_000;

export interface Coord {
  lat: number;
  lng: number;
}

/**
 * 화면에서 정한 회사 위치(Firestore settings/office). 앱이 데이터를 읽을 때
 * 넣어 준다. 있으면 .env 값보다 먼저 쓴다.
 */
let officeOverride: Coord | null = null;

export function setOfficeOverride(coord: Coord | null): void {
  officeOverride = coord;
}

/** 회사 좌표를 어디서 가져오는지. 'env' 는 설정 파일의 임시값이다. */
export function officeSource(): 'saved' | 'env' {
  return officeOverride ? 'saved' : 'env';
}

/**
 * 회사 좌표. 화면에서 정한 값이 있으면 그것, 없으면 .env 값.
 * 둘 다 없으면 지어내지 않고 던진다 (설계 Open Question 3).
 */
export function officeCoord(): Coord {
  if (officeOverride) return officeOverride;
  const lat = Number(import.meta.env.VITE_OFFICE_LAT);
  const lng = Number(import.meta.env.VITE_OFFICE_LNG);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(
      'VITE_OFFICE_LAT / VITE_OFFICE_LNG 가 설정되지 않았어요. .env.local 에 사무실 좌표를 넣어 주세요.',
    );
  }
  return { lat, lng };
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이 직선거리(m). Haversine. */
export function straightLineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** 회사에서 그 좌표까지의 추정 도보시간(분). 최소 1분. */
export function walkMinutesBetween(
  lat: number,
  lng: number,
  office = officeCoord(),
): number {
  const meters = straightLineMeters(office.lat, office.lng, lat, lng);
  return Math.max(1, Math.round((meters * DETOUR_FACTOR) / METERS_PER_MINUTE));
}

/**
 * 도보시간 → 직선 반경(m). walkMinutesBetween 의 역산이다.
 *
 * 지도에 5·10·15분 원을 그리는 데 쓴다. 반올림이 있어 완전한 역함수는 아니다 —
 * 이 반경으로 나온 지점을 walkMinutesBetween 에 넣으면 같은 분이 나오지만,
 * 그 안의 모든 점이 그런 것은 아니다. 원은 눈금이지 판정선이 아니다.
 */
export function metersForWalkMinutes(walkMin: number): number {
  return (walkMin * METERS_PER_MINUTE) / DETOUR_FACTOR;
}
