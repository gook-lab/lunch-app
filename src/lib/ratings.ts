/**
 * 별점 요약 — 사람마다 한 표(places/{id}/ratings/{uid})를 가게별 평균으로 묶는다.
 *
 * 사람마다 별점을 따로 두기 전에는 가게 문서의 rating 하나를 마지막 사람이 덮어썼다.
 * 그 값은 버리지 않고 "예전 별점" 한 표로 센다. 새 표가 생겨도 그대로 한 표로 남는다.
 * 별점은 보여 주기만 한다. 후보 산출과 당첨에는 쓰지 않는다.
 */
import type { Place } from './candidates';
import type { PlaceVote } from '../services/types';

export const LEGACY_UID = 'legacy';

export interface RatingSummary {
  /** 평균(소수 한 자리). 표가 없으면 0. */
  average: number;
  count: number;
  /** 내 표. 없으면 null. */
  mine: PlaceVote | null;
  /** 한줄평이 있는 표(내 표 포함), 최근 저장 순서는 모르므로 점수 높은 순. */
  reviews: PlaceVote[];
}

export function summarizeRatings(
  places: Place[],
  votes: PlaceVote[],
  myUid: string | null,
): Map<string, RatingSummary> {
  const byPlace = new Map<string, PlaceVote[]>();
  for (const v of votes) {
    if (!Number.isInteger(v.score) || v.score < 1 || v.score > 5) continue;
    byPlace.set(v.placeId, [...(byPlace.get(v.placeId) ?? []), v]);
  }
  const out = new Map<string, RatingSummary>();
  for (const place of places) {
    const list = [...(byPlace.get(place.id) ?? [])];
    if (place.rating) list.push({ placeId: place.id, uid: LEGACY_UID, score: place.rating, review: place.review });
    if (list.length === 0) continue;
    const sum = list.reduce((s, v) => s + v.score, 0);
    out.set(place.id, {
      average: Math.round((sum / list.length) * 10) / 10,
      count: list.length,
      mine: (myUid && list.find((v) => v.uid === myUid)) || null,
      reviews: list.filter((v) => v.review).sort((a, b) => b.score - a.score),
    });
  }
  return out;
}

/** "★ 4.3" 처럼. 정수면 ".0" 을 붙여 자리를 맞춘다. */
export const formatAverage = (average: number) => average.toFixed(1);
