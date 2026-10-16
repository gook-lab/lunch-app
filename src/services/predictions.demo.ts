/** 동료 예측 (데모) — 내 표는 DEMO_UID 하나, 동료 표는 씨앗으로 깔아 둔 두 표. */
import type { DayId } from '../lib/date';
import { DEMO_UID, onDemoChange, readDemo, tick, writeDemo } from './demoStore';
import type { Unsubscribe, Vote } from './types';

export async function myUid(): Promise<string> {
  return DEMO_UID;
}

export function subscribeVotes(
  day: DayId,
  onChange: (votes: Vote[]) => void,
  _onError: (error: unknown) => void,
): Unsubscribe {
  const emit = () => onChange([...(readDemo().votes[day] ?? [])]);
  emit();
  return onDemoChange(emit);
}

export async function castVote(day: DayId, placeId: string, name: string): Promise<void> {
  await tick();
  const vote = { uid: DEMO_UID, placeId, name: name.trim().slice(0, 12) };
  writeDemo((s) => ({
    ...s,
    votes: { ...s.votes, [day]: [...(s.votes[day] ?? []).filter((v) => v.uid !== DEMO_UID), vote] },
  }));
}

export async function clearVote(day: DayId): Promise<void> {
  await tick();
  writeDemo((s) => ({ ...s, votes: { ...s.votes, [day]: (s.votes[day] ?? []).filter((v) => v.uid !== DEMO_UID) } }));
}

export async function fetchVotes(day: DayId): Promise<Vote[]> {
  return [...(readDemo().votes[day] ?? [])];
}
