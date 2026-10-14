/**
 * 데이터 접근 입구. 빌드 설정으로 Firebase(팀용)와 데모(브라우저 저장) 중 하나를 쓴다.
 *
 * VITE_DEMO=1 이면 데모다. 조건이 빌드 때 상수로 바뀌므로 쓰지 않는 쪽은 번들에서 빠진다
 * — 데모 빌드엔 Firebase SDK 가 아예 없다. 팀용도 Firebase 를 나중 청크로 받아 첫 화면이 가볍다.
 */
import type { Place, Visit } from '../lib/candidates';
import type { DayId } from '../lib/date';
import type { TodayDecision, Unsubscribe } from './types';

export type { TodayDecision } from './types';

// 조건을 직접 써야 빌드가 상수로 접어 안 쓰는 쪽 import 를 지운다(DEMO 변수를 거치면 남는다).
const impl = () => (import.meta.env.VITE_DEMO === '1' ? import('./lunch.demo') : import('./lunch.firebase'));

export const fetchPlaces = async (): Promise<Place[]> => (await impl()).fetchPlaces();
export const fetchOffice = async () => (await impl()).fetchOffice();
export const saveOffice = async (coord: { lat: number; lng: number }) => (await impl()).saveOffice(coord);
export const fetchRecentVisits = async (today: DayId): Promise<Visit[]> => (await impl()).fetchRecentVisits(today);
export const decideToday = async (today: DayId, placeId: string, mode?: string) =>
  (await impl()).decideToday(today, placeId, mode);
export const addPlace = async (input: Omit<Place, 'id' | 'createdBy'>) => (await impl()).addPlace(input);
export const updatePlace = async (id: string, patch: Parameters<typeof import('./lunch.firebase').updatePlace>[1]) =>
  (await impl()).updatePlace(id, patch);
export const fetchPlace = async (id: string) => (await impl()).fetchPlace(id);

/** 오늘 결정 구독. 구현을 받아 오는 사이에 해제되면 구독을 걸지 않는다. */
export function subscribeToday(
  today: DayId,
  onChange: (decision: TodayDecision | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;
  impl()
    .then((m) => {
      if (!stopped) inner = m.subscribeToday(today, onChange, onError);
    })
    .catch(onError);
  return () => {
    stopped = true;
    inner?.();
  };
}
