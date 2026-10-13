/**
 * 모든 가게 별점 요약. 목록·지도·결과가 같이 쓴다.
 * 별점은 컬렉션 그룹 하나를 구독한다 — 동료가 남긴 별점도 바로 반영된다.
 * 구독이 실패해도 앱은 그대로 쓴다. 별점만 안 보인다.
 */
import { useEffect, useMemo, useState } from 'react';
import type { Place } from '../lib/candidates';
import { summarizeRatings, type RatingSummary } from '../lib/ratings';
import { ratingUid, subscribeRatings, type PlaceVote } from '../services/ratings';

export function useRatings(places: Place[]): Map<string, RatingSummary> {
  const [votes, setVotes] = useState<PlaceVote[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    const stop = subscribeRatings(setVotes, () => setVotes([]));
    ratingUid()
      .then(setUid)
      .catch(() => setUid(null));
    return stop;
  }, []);
  return useMemo(() => summarizeRatings(places, votes, uid), [places, votes, uid]);
}
