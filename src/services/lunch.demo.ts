/** 데이터 접근 (데모) — lunch.firebase.ts 와 같은 함수를 브라우저 저장소로. */
import { VISIT_HISTORY_DAYS, type Place, type Visit } from '../lib/candidates';
import { dayIdBefore, type DayId } from '../lib/date';
import { DEMO_UID, onDemoChange, readDemo, tick, writeDemo } from './demoStore';
import type { TodayDecision, Unsubscribe } from './types';

export async function fetchPlaces(): Promise<Place[]> {
  await tick();
  return readDemo().places.map((p) => ({ ...p }));
}

export async function fetchOffice(): Promise<{ lat: number; lng: number } | null> {
  await tick();
  return readDemo().office;
}

export async function saveOffice(coord: { lat: number; lng: number }): Promise<void> {
  await tick();
  writeDemo((s) => ({ ...s, office: { lat: coord.lat, lng: coord.lng } }));
}

export async function fetchRecentVisits(today: DayId): Promise<Visit[]> {
  await tick();
  const from = dayIdBefore(today, VISIT_HISTORY_DAYS);
  return Object.entries(readDemo().visits)
    .filter(([id]) => id >= from && id <= today)
    .map(([id, placeId]) => {
      const mode = readDemo().modes?.[id];
      return mode ? { id, placeId, mode } : { id, placeId };
    });
}

export function subscribeToday(
  today: DayId,
  onChange: (decision: TodayDecision | null) => void,
  _onError: (error: unknown) => void,
): Unsubscribe {
  const emit = () => {
    const placeId = readDemo().visits[today];
    onChange(placeId ? { dayId: today, placeId } : null);
  };
  emit();
  return onDemoChange(emit);
}

export async function decideToday(today: DayId, placeId: string, mode?: string): Promise<void> {
  await tick();
  writeDemo((s) => ({
    ...s,
    visits: { ...s.visits, [today]: placeId },
    modes: mode ? { ...s.modes, [today]: mode } : s.modes,
  }));
}

export async function addPlace(input: Omit<Place, 'id' | 'createdBy'>): Promise<{ added: boolean; id?: string }> {
  await tick();
  const existing = input.kakaoPlaceId && readDemo().places.find((p) => p.kakaoPlaceId === input.kakaoPlaceId);
  if (existing) return { added: false, id: existing.id };
  const id = `demo-${Date.now().toString(36)}`;
  writeDemo((s) => ({ ...s, places: [...s.places, { ...input, id, createdBy: DEMO_UID }] }));
  return { added: true, id };
}

export async function updatePlace(id: string, patch: Partial<Place>): Promise<void> {
  await tick();
  writeDemo((s) => ({ ...s, places: s.places.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
}

export async function fetchPlace(id: string): Promise<Place | null> {
  await tick();
  return readDemo().places.find((p) => p.id === id) ?? null;
}
