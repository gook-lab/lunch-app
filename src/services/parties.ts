/** 점심 팟 입구. lunch.ts 와 같은 방식으로 Firebase 와 데모 중 하나를 쓴다. */
import type { DayId } from '../lib/date';
import type { Party, PartyGame, PartyInput, PartyStatus, Unsubscribe } from './types';

export type { Party, PartyGame, PartyInput, PartyStatus } from './types';

const impl = () => (import.meta.env.VITE_DEMO === '1' ? import('./parties.demo') : import('./parties.firebase'));

export const partyUid = async (): Promise<string> => (await impl()).partyUid();
export const openParty = async (day: DayId, input: PartyInput) => (await impl()).openParty(day, input);
export const joinParty = async (day: DayId, partyId: string) => (await impl()).joinParty(day, partyId);
export const leaveParty = async (day: DayId, partyId: string) => (await impl()).leaveParty(day, partyId);
export const setPartyStatus = async (day: DayId, partyId: string, status: PartyStatus) =>
  (await impl()).setPartyStatus(day, partyId, status);
export const cancelParty = async (day: DayId, partyId: string) => (await impl()).cancelParty(day, partyId);
export const savePartyGame = async (day: DayId, partyId: string, game: PartyGame) =>
  (await impl()).savePartyGame(day, partyId, game);

export function subscribeParties(
  day: DayId,
  onChange: (parties: Party[]) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  impl()
    .then((m) => {
      if (!stopped) inner = m.subscribeParties(day, onChange, onError);
    })
    .catch(onError);
  return () => {
    stopped = true;
    inner?.();
  };
}
