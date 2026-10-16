/** 동료 예측 입구. lunch.ts 와 같은 방식으로 Firebase 와 데모 중 하나를 쓴다. */
import type { DayId } from '../lib/date';
import type { Unsubscribe, Vote } from './types';

export type { Vote } from './types';

const impl = () =>
  import.meta.env.VITE_DEMO === '1' ? import('./predictions.demo') : import('./predictions.firebase');

export const myUid = async (): Promise<string> => (await impl()).myUid();
export const castVote = async (day: DayId, placeId: string, name: string) =>
  (await impl()).castVote(day, placeId, name);
export const clearVote = async (day: DayId) => (await impl()).clearVote(day);
export const fetchVotes = async (day: DayId): Promise<Vote[]> => (await impl()).fetchVotes(day);

export function subscribeVotes(
  day: DayId,
  onChange: (votes: Vote[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  impl()
    .then((m) => {
      if (!stopped) inner = m.subscribeVotes(day, onChange, onError);
    })
    .catch(onError);
  return () => {
    stopped = true;
    inner?.();
  };
}
