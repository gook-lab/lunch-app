/**
 * 점심 팟 (데모) — 이 브라우저에만. 내 uid 는 DEMO_UID 하나, 동료 팟은 예시로 깐다.
 * Firestore 규칙이 막는 것(하루 한 팟·남 대신 참여·인원 초과·방장 아닌 마감·게임 두 번)을
 * 여기서도 막는다. 데모에서만 되는 동작이 있으면 팀용에서 "고장" 으로 읽힌다.
 */
import type { DayId } from '../lib/date';
import { partyInputProblem, partyPhase } from '../lib/party';
import { DEMO_UID, onDemoChange, readDemo, tick, writeDemo } from './demoStore';
import type { Party, PartyGame, PartyInput, PartyStatus, Unsubscribe } from './types';

export async function partyUid(): Promise<string> {
  return DEMO_UID;
}

const partiesOf = (day: DayId): Party[] => readDemo().parties?.[day] ?? [];

function change(day: DayId, partyId: string, update: (p: Party) => Party): void {
  const party = partiesOf(day).find((p) => p.id === partyId);
  if (!party) throw new Error('팟이 없어요');
  const next = update(party);
  writeDemo((s) => ({
    ...s,
    parties: { ...s.parties, [day]: partiesOf(day).map((p) => (p.id === partyId ? next : p)) },
  }));
}

export function subscribeParties(
  day: DayId,
  onChange: (parties: Party[]) => void,
  _onError: (error: unknown) => void,
): Unsubscribe {
  const emit = () => onChange(partiesOf(day).map((p) => ({ ...p, members: [...p.members] })));
  emit();
  return onDemoChange(emit);
}

export async function openParty(day: DayId, input: PartyInput): Promise<void> {
  await tick();
  const problem = partyInputProblem(input);
  if (problem) throw new Error(problem);
  if (partiesOf(day).some((p) => p.id === DEMO_UID)) throw new Error('오늘은 이미 팟을 열었어요');
  const party: Party = {
    id: DEMO_UID,
    hostUid: DEMO_UID,
    category: input.category,
    time: input.time,
    max: input.max,
    memo: input.memo.trim(),
    status: 'open',
    members: [{ uid: DEMO_UID, at: Date.now() }],
    game: null,
  };
  writeDemo((s) => ({ ...s, parties: { ...s.parties, [day]: [...partiesOf(day), party] } }));
}

export async function joinParty(day: DayId, partyId: string): Promise<void> {
  await tick();
  change(day, partyId, (p) => {
    if (p.members.some((m) => m.uid === DEMO_UID)) return p;
    if (partyPhase(p) !== 'open') throw new Error('지금은 참여할 수 없어요');
    return { ...p, members: [...p.members, { uid: DEMO_UID, at: Date.now() }] };
  });
}

export async function leaveParty(day: DayId, partyId: string): Promise<void> {
  await tick();
  change(day, partyId, (p) => {
    if (p.hostUid === DEMO_UID) throw new Error('방장은 나갈 수 없어요');
    return { ...p, members: p.members.filter((m) => m.uid !== DEMO_UID) };
  });
}

export async function setPartyStatus(day: DayId, partyId: string, status: PartyStatus): Promise<void> {
  await tick();
  change(day, partyId, (p) => {
    if (p.hostUid !== DEMO_UID) throw new Error('방장만 바꿀 수 있어요');
    return { ...p, status };
  });
}

export async function cancelParty(day: DayId, partyId: string): Promise<void> {
  await tick();
  const party = partiesOf(day).find((p) => p.id === partyId);
  if (!party || party.hostUid !== DEMO_UID) throw new Error('방장만 취소할 수 있어요');
  writeDemo((s) => ({ ...s, parties: { ...s.parties, [day]: partiesOf(day).filter((p) => p.id !== partyId) } }));
}

export async function guessParty(day: DayId, partyId: string, placeId: string | null): Promise<void> {
  await tick();
  change(day, partyId, (p) => {
    if (!p.members.some((m) => m.uid === DEMO_UID)) throw new Error('팟에 들어와야 예측할 수 있어요');
    if (p.game) throw new Error('게임이 시작돼서 바꿀 수 없어요');
    const guesses = { ...p.guesses };
    if (placeId) guesses[DEMO_UID] = placeId;
    else delete guesses[DEMO_UID];
    return { ...p, guesses };
  });
}

export async function savePartyGame(day: DayId, partyId: string, game: PartyGame): Promise<void> {
  await tick();
  change(day, partyId, (p) => {
    if (p.hostUid !== DEMO_UID) throw new Error('방장만 게임을 돌릴 수 있어요');
    if (p.game) throw new Error('이미 게임을 돌렸어요');
    return { ...p, game: { ...game, ids: [...game.ids], names: [...game.names] } };
  });
}
