/**
 * 지도를 눌렀을 때 뜨는 "이 근처 밥집" 목록의 순수 계산.
 * 카카오 categorySearch('FD6' 음식점) 결과를 가까운 순으로 자르고,
 * 이미 넣은 가게면 그 가게를 붙여 "이미 있어요" 로 보여 준다.
 */
import type { Place } from '../../lib/candidates';
import { findDuplicate } from '../../lib/duplicate';
import { straightLineMeters, type Coord } from '../../lib/walk';
import type { KakaoPlace } from '../../types/kakao';

/** 누른 자리에서 이만큼 안을 찾는다. 건물 하나 정도. */
export const TAP_RADIUS_M = 50;
export const TAP_MAX_HITS = 4;
/** 이름이 달라도 이만큼 가까우면 같은 가게로 본다. */
const NEAR_SAME_M = 20;

export interface NearbyHit {
  hit: KakaoPlace;
  /** 누른 자리에서의 거리(m). */
  meters: number;
  /** 이미 넣은 가게. 없으면 null. */
  existing: Place | null;
}

const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

export function existingFor(places: readonly Place[], hit: KakaoPlace): Place | null {
  const lat = Number(hit.y);
  const lng = Number(hit.x);
  const dup = findDuplicate(places, { name: hit.place_name, lat, lng, kakaoPlaceId: hit.id });
  if (dup) return dup.place;
  const name = norm(hit.place_name);
  return (
    places.find((p) => norm(p.name) === name) ??
    places.find((p) => straightLineMeters(p.lat, p.lng, lat, lng) <= NEAR_SAME_M) ??
    null
  );
}

export function nearbyHits(places: readonly Place[], at: Coord, data: readonly KakaoPlace[]): NearbyHit[] {
  return data
    .map((hit) => ({
      hit,
      meters: Math.round(straightLineMeters(at.lat, at.lng, Number(hit.y), Number(hit.x))),
      existing: existingFor(places, hit),
    }))
    .filter((h) => Number.isFinite(h.meters))
    .sort((a, b) => a.meters - b.meters)
    .slice(0, TAP_MAX_HITS);
}
