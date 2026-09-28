/**
 * 중복 등록 판정.
 *
 * 같은 가게가 두 번 들어오는 경로가 둘이다.
 *  1. 검색으로 같은 곳을 또 고른다 — kakaoPlaceId 가 같다.
 *  2. 한 번은 검색으로, 한 번은 지도를 길게 눌러 넣는다 — kakaoPlaceId 가
 *     한쪽에 없어서 1번으로는 못 잡는다. 이름과 거리로 본다.
 *
 * 막지 않고 알리기만 하는 이유: 30m 안에 같은 이름의 다른 가게가 실제로
 * 있을 수 있다(푸드코트, 같은 건물 지점). 판단은 사람이 한다.
 *
 * 삭제가 없으므로 잘못 넣으면 active 를 끄는 수밖에 없다. 그래서 넣기 전에
 * 알려주는 이 판정이 유일한 방어선이다.
 */
import type { Place } from './candidates';
import { straightLineMeters } from './walk';

/** 이름이 같고 이 거리 안이면 같은 가게로 본다. */
export const SAME_PLACE_METERS = 30;

export interface DuplicateCandidate {
  name: string;
  lat: number;
  lng: number;
  /** 지도를 길게 눌러 넣는 경우에는 없다. */
  kakaoPlaceId?: string;
}

export type DuplicateReason = 'kakao-id' | 'name-and-distance';

export interface DuplicateHit {
  place: Place;
  reason: DuplicateReason;
  /** 이름·거리로 걸렸을 때의 거리(m). id 로 걸렸으면 null. */
  meters: number | null;
}

/** 이름 비교 전 다듬기. 공백 차이로 다른 가게가 되지 않게 한다. */
function normalize(name: string): string {
  return name.replace(/\s+/g, '').toLowerCase();
}

/**
 * 이미 있는 가게를 찾는다. 없으면 null.
 * kakaoPlaceId 일치를 먼저 본다 — 그쪽이 확실한 근거다.
 */
export function findDuplicate(
  places: readonly Place[],
  candidate: DuplicateCandidate,
): DuplicateHit | null {
  if (candidate.kakaoPlaceId) {
    const byId = places.find((p) => p.kakaoPlaceId === candidate.kakaoPlaceId);
    if (byId) return { place: byId, reason: 'kakao-id', meters: null };
  }

  const wanted = normalize(candidate.name);
  if (wanted.length === 0) return null;

  let nearest: DuplicateHit | null = null;
  for (const place of places) {
    if (normalize(place.name) !== wanted) continue;
    const meters = straightLineMeters(candidate.lat, candidate.lng, place.lat, place.lng);
    if (meters > SAME_PLACE_METERS) continue;
    if (nearest === null || meters < nearest.meters!) {
      nearest = { place, reason: 'name-and-distance', meters };
    }
  }
  return nearest;
}
