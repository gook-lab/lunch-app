/**
 * 점심 팟 (Firebase) — parties/{오늘}/list/{방장 uid}.
 *
 * 문서 id 가 방장 uid 라 한 사람이 하루에 팟 하나만 연다(규칙이 지킨다). 모인 사람은 members 맵에
 * 자기 uid 하나만 넣고 뺀다. 이름·이메일은 저장하지 않는다 — 아바타는 화면이 uid 로 만든다(lib/avatar.ts).
 * 인원 상한은 규칙이 쓰기 순간의 문서로 잰다. 두 사람이 마지막 자리를 동시에 눌러도 한 명만 들어간다.
 */
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  FieldPath,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { ensureAuth, db } from './firebase';
import type { DayId } from '../lib/date';
import { readParty } from '../lib/party';
import type { Party, PartyGame, PartyInput, PartyStatus } from './types';

const list = (day: DayId) => collection(db, 'parties', day, 'list');
const ref = (day: DayId, partyId: string) => doc(list(day), partyId);

/** 서버 시각(Timestamp) → ms. 방금 쓴 내 참여는 서버가 받기 전이라 추정값으로 온다. */
const toMs = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : Number.MAX_SAFE_INTEGER);

export async function partyUid(): Promise<string> {
  return (await ensureAuth()).uid;
}

export function subscribeParties(
  day: DayId,
  onChange: (parties: Party[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  ensureAuth()
    .then(() => {
      if (stopped) return;
      inner = onSnapshot(
        list(day),
        (snap) =>
          onChange(
            snap.docs
              .map((d) => readParty(d.id, d.data({ serverTimestamps: 'estimate' }), toMs))
              .filter((p): p is Party => p !== null),
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

export async function openParty(day: DayId, input: PartyInput): Promise<void> {
  const { uid } = await ensureAuth();
  await setDoc(ref(day, uid), {
    category: input.category,
    time: input.time,
    max: input.max,
    memo: input.memo.trim(),
    hostUid: uid,
    status: 'open',
    members: { [uid]: serverTimestamp() },
    createdAt: serverTimestamp(),
  });
}

export async function joinParty(day: DayId, partyId: string): Promise<void> {
  const { uid } = await ensureAuth();
  await updateDoc(ref(day, partyId), new FieldPath('members', uid), serverTimestamp());
}

export async function leaveParty(day: DayId, partyId: string): Promise<void> {
  const { uid } = await ensureAuth();
  await updateDoc(ref(day, partyId), new FieldPath('members', uid), deleteField());
}

export async function setPartyStatus(day: DayId, partyId: string, status: PartyStatus): Promise<void> {
  await ensureAuth();
  await updateDoc(ref(day, partyId), { status });
}

export async function cancelParty(day: DayId, partyId: string): Promise<void> {
  await ensureAuth();
  await deleteDoc(ref(day, partyId));
}

/** 팟 예측 — 내 칸 하나만 넣고 뺀다. 규칙: 멤버만, 게임 전까지만. */
export async function guessParty(day: DayId, partyId: string, placeId: string | null): Promise<void> {
  const uid = (await ensureAuth()).uid;
  await updateDoc(ref(day, partyId), new FieldPath('guesses', uid), placeId ?? deleteField());
}

export async function savePartyGame(day: DayId, partyId: string, game: PartyGame): Promise<void> {
  await ensureAuth();
  await updateDoc(ref(day, partyId), {
    game: {
      mode: game.mode,
      run: game.run,
      ids: game.ids,
      names: game.names,
      winnerIndex: game.winnerIndex,
      at: serverTimestamp(),
    },
  });
}
