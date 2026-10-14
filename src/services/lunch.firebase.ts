/**
 * 데이터 접근 (Firebase) — places / visits. 화면은 lunch.ts 를 거쳐 부른다.
 *
 * 읽기 경로는 셋이다 (엔지니어링 리뷰 D3 + 외부 검증 교정):
 *  1. places        — 1회 읽기. 실시간 구독하지 않는다.
 *  2. 최근 31일 visits — 부팅 시 documentId() 범위 쿼리로 1회.
 *  3. visits/{오늘}  — 실시간 구독. 이 앱의 유일한 동시성 지점이다.
 *
 * 2번이 빠져 있으면 "최근 방문 제외" 가 동작할 근거가 없다. 설계에 이 경로가
 * 없었고 외부 검증에서 잡혔다.
 */
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, authReady } from './firebase';
import { dayIdBefore, type DayId } from '../lib/date';
import { VISIT_HISTORY_DAYS, type Place, type Visit } from '../lib/candidates';
import type { TodayDecision } from './types';

const places = () => collection(db, 'places');
const officeDoc = () => doc(db, 'settings', 'office');
const visits = () => collection(db, 'visits');

/** 가게 목록 1회 읽기. */
export async function fetchPlaces(): Promise<Place[]> {
  await authReady;
  const snap = await getDocs(places());
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Place, 'id'>) }));
}

/**
 * 회사 위치. 모두가 같은 기준으로 도보 시간을 봐야 하므로 기기가 아니라
 * Firestore 문서 하나에 둔다. 아직 아무도 안 정했으면 null.
 */
export async function fetchOffice(): Promise<{ lat: number; lng: number } | null> {
  await authReady;
  const snap = await getDoc(officeDoc());
  if (!snap.exists()) return null;
  const { lat, lng } = snap.data() as { lat: unknown; lng: unknown };
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}

/** 회사 위치를 바꾼다. 규칙이 한국 안 좌표인지, 시각이 서버 시각인지 검사한다. */
export async function saveOffice(coord: { lat: number; lng: number }): Promise<void> {
  await authReady;
  await setDoc(officeDoc(), { lat: coord.lat, lng: coord.lng, updatedAt: serverTimestamp() });
}

/** 최근 31일 결정 기록. 문서 id 가 YYYYMMDD 라 documentId() 범위 쿼리로 읽는다. */
export async function fetchRecentVisits(today: DayId): Promise<Visit[]> {
  await authReady;
  const snap = await getDocs(
    query(
      visits(),
      where(documentId(), '>=', dayIdBefore(today, VISIT_HISTORY_DAYS)),
      where(documentId(), '<=', today),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as { placeId: string; mode?: string };
    return data.mode ? { id: d.id, placeId: data.placeId, mode: data.mode } : { id: d.id, placeId: data.placeId };
  });
}


/**
 * 오늘 결정 문서 구독. 반드시 익명 로그인이 붙은 뒤에 건다.
 * onError 는 무시하면 안 된다 — permission-denied 로 리스너가 죽으면
 * 화면은 영원히 "아직 안 정했습니다" 에 머문다.
 */
export function subscribeToday(
  today: DayId,
  onChange: (decision: TodayDecision | null) => void,
  onError: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let inner: Unsubscribe | undefined;

  authReady
    .then(() => {
      if (stopped) return;
      inner = onSnapshot(
        doc(visits(), today),
        (snap) => {
          onChange(
            snap.exists()
              ? { dayId: today, placeId: (snap.data() as { placeId: string }).placeId }
              : null,
          );
        },
        onError,
      );
    })
    .catch(onError);

  return () => {
    stopped = true;
    inner?.();
  };
}

/**
 * 오늘의 결정을 쓴다. 같은 날 다시 쓰면 덮어쓴다 — 재결정 확인은 화면이 한다.
 * decidedAt 은 서버 시각이다. 규칙이 request.time 과 같은지 검사한다.
 */
export async function decideToday(today: DayId, placeId: string, mode?: string): Promise<void> {
  await authReady;
  // mode 는 어떤 게임으로 뽑았는지 — 이번 달 기록의 "자주 쓴 게임" 에만 쓴다.
  await setDoc(doc(visits(), today), { placeId, decidedAt: serverTimestamp(), ...(mode ? { mode } : {}) });
}

/**
 * 빈 선택 필드를 털어낸다.
 *
 * Firestore 는 undefined 를 그대로 받으면 던진다. 그리고 빈 문자열을 쓰면
 * 규칙의 "없으면 통과" 가 아니라 "있는데 빈 값" 이 되어, 나중에 필드가 있는
 * 문서와 없는 문서가 뒤섞인다. 아예 키를 빼는 쪽이 깨끗하다.
 */
function withoutEmpty<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * 가게 추가. 같은 kakaoPlaceId 가 이미 있으면 쓰지 않고 false 를 돌려준다.
 *
 * 화면도 findDuplicate 로 미리 거르지만 여기서 한 번 더 본다 — 두 사람이
 * 동시에 넣으면 화면 쪽 검사는 둘 다 통과한다. kakaoPlaceId 가 없는
 * (지도에서 길게 눌러 넣은) 가게는 이 검사가 안 걸리므로 화면 경고가 전부다.
 */
export async function addPlace(
  input: Omit<Place, 'id' | 'createdBy'>,
): Promise<{ added: boolean; id?: string }> {
  const user = await authReady;
  if (input.kakaoPlaceId) {
    const existing = await getDocs(
      query(places(), where('kakaoPlaceId', '==', input.kakaoPlaceId)),
    );
    if (!existing.empty) return { added: false, id: existing.docs[0].id };
  }

  const ref = doc(places());
  await setDoc(ref, { ...withoutEmpty(input), createdBy: user.uid });
  return { added: true, id: ref.id };
}

/** 폐업 처리와 오타·좌표 수정 (D8). 삭제는 없다. */
export async function updatePlace(
  id: string,
  patch: Partial<
    Pick<
      Place,
      'name' | 'lat' | 'lng' | 'walkMin' | 'category' | 'active'
      | 'price' | 'rating' | 'review' | 'memo'
    >
  >,
): Promise<void> {
  await authReady;
  await updateDoc(doc(places(), id), withoutEmpty(patch));
}

export async function fetchPlace(id: string): Promise<Place | null> {
  await authReady;
  const snap = await getDoc(doc(places(), id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Place, 'id'>) } : null;
}
