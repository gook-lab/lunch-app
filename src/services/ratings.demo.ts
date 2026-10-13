/** 별점 (데모) — 동료 표는 씨앗으로 깔고, 내 표는 DEMO_UID 하나. */
import { DEMO_UID, onDemoChange, readDemo, tick, writeDemo } from './demoStore';
import type { PlaceVote, Unsubscribe } from './types';

export function subscribeRatings(
  onChange: (votes: PlaceVote[]) => void,
  _onError: (error: unknown) => void,
): Unsubscribe {
  const emit = () => onChange([...(readDemo().ratings ?? [])]);
  emit();
  return onDemoChange(emit);
}

export async function ratingUid(): Promise<string> {
  return DEMO_UID;
}

export async function rate(placeId: string, score: number, review: string, name: string): Promise<void> {
  await tick();
  const vote: PlaceVote = { placeId, uid: DEMO_UID, score };
  if (review.trim()) vote.review = review.trim().slice(0, 40);
  if (name.trim()) vote.name = name.trim().slice(0, 12);
  writeDemo((s) => ({
    ...s,
    ratings: [...(s.ratings ?? []).filter((v) => !(v.placeId === placeId && v.uid === DEMO_UID)), vote],
  }));
}

export async function unrate(placeId: string): Promise<void> {
  await tick();
  writeDemo((s) => ({
    ...s,
    ratings: (s.ratings ?? []).filter((v) => !(v.placeId === placeId && v.uid === DEMO_UID)),
  }));
}
