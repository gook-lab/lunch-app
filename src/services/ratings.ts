/** 별점 입구. lunch.ts 와 같은 방식으로 Firebase 와 데모 중 하나를 쓴다. */
import type { PlaceVote, Unsubscribe } from './types';

export type { PlaceVote } from './types';

const impl = () => (import.meta.env.VITE_DEMO === '1' ? import('./ratings.demo') : import('./ratings.firebase'));

export const ratingUid = async (): Promise<string> => (await impl()).ratingUid();
export const rate = async (placeId: string, score: number, review: string, name: string) =>
  (await impl()).rate(placeId, score, review, name);
export const unrate = async (placeId: string) => (await impl()).unrate(placeId);

export function subscribeRatings(
  onChange: (votes: PlaceVote[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  impl()
    .then((m) => {
      if (!stopped) inner = m.subscribeRatings(onChange, onError);
    })
    .catch(onError);
  return () => {
    stopped = true;
    inner?.();
  };
}
