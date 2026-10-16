/**
 * 동료 예측 (Firebase) — predictions/{오늘}/votes/{익명 uid}.
 *
 * 게임 전에 링크로 들어온 사람들이 "어디 나올까" 를 찍고, 결과에 맞힌 사람을 단다.
 * 당첨에는 아무 영향이 없다 — 표는 읽기만 하고 spin() 은 보지 않는다.
 * 기기(익명 uid)당 하루 한 표. 규칙이 자기 문서·오늘·이름 1~12자를 지킨다.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, ensureAuth, db } from './firebase';
import type { DayId } from '../lib/date';

import type { Vote } from './types';

const votes = (day: DayId) => collection(db, 'predictions', day, 'votes');

export async function myUid(): Promise<string> {
  const user = await ensureAuth();
  return user.uid;
}

export function subscribeVotes(
  day: DayId,
  onChange: (votes: Vote[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  ensureAuth()
    .then(() => {
      if (stopped) return;
      inner = onSnapshot(
        votes(day),
        (snap) =>
          onChange(
            snap.docs.map((d) => {
              const v = d.data() as { placeId: string; name: string };
              return { uid: d.id, placeId: v.placeId, name: v.name };
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

export async function castVote(day: DayId, placeId: string, name: string): Promise<void> {
  await ensureAuth();
  const uid = auth.currentUser!.uid;
  await setDoc(doc(votes(day), uid), { placeId, name: name.trim().slice(0, 12), at: serverTimestamp() });
}

export async function clearVote(day: DayId): Promise<void> {
  await ensureAuth();
  await deleteDoc(doc(votes(day), auth.currentUser!.uid));
}

/** 지난 날 표 한 번 읽기 — 지난 날은 규칙상 쓸 수 없어 실시간 구독이 필요 없다. */
export async function fetchVotes(day: DayId): Promise<Vote[]> {
  await ensureAuth();
  const snap = await getDocs(votes(day));
  return snap.docs.map((d) => {
    const v = d.data() as { placeId: string; name: string };
    return { uid: d.id, placeId: v.placeId, name: v.name };
  });
}
