/**
 * 별점 (Firebase) — places/{placeId}/ratings/{익명 uid}.
 *
 * 예전엔 가게 문서의 rating 하나를 마지막에 고친 사람이 덮어썼다. 사람마다 한 표씩
 * 따로 두고 화면이 평균을 낸다. 가게가 몇십 곳이라 컬렉션 그룹 하나를 통째로 구독한다.
 */
import { collectionGroup, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, authReady, db } from './firebase';
import type { PlaceVote, Unsubscribe } from './types';

export function subscribeRatings(
  onChange: (votes: PlaceVote[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  authReady
    .then(() => {
      if (stopped) return;
      inner = onSnapshot(
        collectionGroup(db, 'ratings'),
        (snap) =>
          onChange(
            snap.docs.map((d) => {
              const v = d.data() as { score: number; review?: string; name?: string };
              return { placeId: d.ref.parent.parent!.id, uid: d.id, score: v.score, review: v.review, name: v.name };
            }),
          ),
        onError,
      );
    })
    .catch(onError);
  return () => {
    stopped = true;
    inner?.();
  };
}

export async function ratingUid(): Promise<string> {
  return (await authReady).uid;
}

export async function rate(placeId: string, score: number, review: string, name: string): Promise<void> {
  await authReady;
  const data: Record<string, unknown> = { score, at: serverTimestamp() };
  if (review.trim()) data.review = review.trim().slice(0, 40);
  if (name.trim()) data.name = name.trim().slice(0, 12);
  await setDoc(doc(db, 'places', placeId, 'ratings', auth.currentUser!.uid), data);
}

export async function unrate(placeId: string): Promise<void> {
  await authReady;
  await deleteDoc(doc(db, 'places', placeId, 'ratings', auth.currentUser!.uid));
}
