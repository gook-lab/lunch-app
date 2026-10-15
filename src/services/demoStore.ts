/**
 * 데모 저장소 — Firebase 없이 이 브라우저(localStorage)에만 둔다.
 *
 * 공개 데모는 다른 팀에 그대로 건네는 링크라 빈 상태로 시작한다(10/14). 지어낸 가게가
 * 깔려 있으면 자기 동네 가게와 섞여 지워야 했다. 둘러보기만 할 사람은 빈 화면의
 * "예시로 둘러보기" 로 서울시청 주변 지어낸 가게·방문 기록·동료 예측을 깐다.
 * 저장이 막힌 창(시크릿 등)에서도 이번 방문 동안은 메모리로 돈다.
 */
import type { Place } from '../lib/candidates';
import { dayIdBefore, todayKST, type DayId } from '../lib/date';
import { defaultPartyTime, minutesOf } from '../lib/party';
import type { Party, PlaceVote, Vote } from './types';

// 씨앗을 바꾸면 판 번호를 올린다 — 예전 데모 저장분은 새 씨앗으로 다시 시작한다.
// v3: 카테고리를 메뉴 > 세부로 바꾸며 가게를 다시 깔았다(10/14).
// v4: 빈 상태로 시작한다. 예시는 고를 때만 깐다(10/14).
const KEY = 'lunch-app:demo-v4';

export interface DemoState {
  places: Place[];
  /** 날짜(YYYYMMDD) → 그날 정한 가게. */
  visits: Record<DayId, string>;
  /** 날짜 → 그날 뽑은 게임. 예전 저장분에는 없을 수 있다. */
  modes?: Record<DayId, string>;
  office: { lat: number; lng: number } | null;
  /** 날짜 → 그날 예측 표. */
  votes: Record<DayId, Vote[]>;
  /** 가게별 사람별 별점. 예전 저장분에는 없을 수 있다. */
  ratings?: PlaceVote[];
  /** 날짜 → 그날 점심 팟. 예전 저장분에는 없을 수 있다. */
  parties?: Record<DayId, Party[]>;
}

export const DEMO_UID = 'demo-me';

/** 서울시청 기준 [이름, 카테고리, 북쪽 m, 동쪽 m]. 이름은 지어냈다. 마지막 곳은 꺼 둔 가게. */
const SEED: [string, string, number, number][] = [
  ['골목 칼국수', '국수·냉면', 180, -120],
  ['할머니 김치찌개', '국밥·찌개', -150, 90],
  ['한 그릇 국밥', '국밥·찌개', 260, 220],
  ['숯불 제육', '고기구이', -320, -60],
  ['초록 샐러드', '샐러드', 90, 310],
  ['불꽃 짬뽕', '짬뽕·짜장', -60, -380],
  ['떡볶이 연구소', '떡볶이·튀김', 420, 40],
  ['파스타 하우스', '파스타', -480, 260],
  ['만두 공방', '라면·만두', 350, -420],
  ['우동 한 판', '라멘·우동', -260, 470],
  ['소금 덮밥', '덮밥·초밥', 610, -210],
  ['스시 한 접시', '덮밥·초밥', -120, 560],
  ['진한 라멘', '라멘·우동', 520, 330],
  ['버거 정류장', '버거·샌드위치', -380, 150],
  ['돈가스 식당', '돈까스', -650, -330],
];
const ORIGIN = { lat: 37.5663, lng: 126.9779 };

function sample(): DemoState {
  const places: Place[] = SEED.map(([name, category, north, east], i) => ({
    id: `demo-${i + 1}`,
    name,
    category,
    lat: +(ORIGIN.lat + north / 111_320).toFixed(6),
    lng: +(ORIGIN.lng + east / (111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180))).toFixed(6),
    walkMin: 0,
    kakaoPlaceId: '',
    active: i !== SEED.length - 1,
    createdBy: 'demo',
  }));
  const today = todayKST();
  // 최근 방문 몇 건 — 이번 주 안 2건은 오늘 후보에서 빠지는 게 보인다.
  const visits: Record<DayId, string> = {
    [dayIdBefore(today, 2)]: 'demo-2',
    [dayIdBefore(today, 4)]: 'demo-6',
    [dayIdBefore(today, 9)]: 'demo-1',
    [dayIdBefore(today, 13)]: 'demo-4',
  };
  const votes: Record<DayId, Vote[]> = {
    [today]: [
      { uid: 'demo-a', placeId: 'demo-3', name: '민지' },
      { uid: 'demo-b', placeId: 'demo-7', name: '준호' },
    ],
  };
  // 동료 별점 — 평균과 한줄평이 바로 보이게 몇 곳에만.
  const ratings: PlaceVote[] = [
    { placeId: 'demo-1', uid: 'demo-a', score: 5, name: '민지', review: '국물이 진해요' },
    { placeId: 'demo-1', uid: 'demo-b', score: 4, name: '준호' },
    { placeId: 'demo-2', uid: 'demo-a', score: 4, name: '민지', review: '김치찌개 맛집' },
    { placeId: 'demo-3', uid: 'demo-b', score: 5, name: '준호', review: '해장엔 여기' },
    { placeId: 'demo-3', uid: 'demo-c', score: 4, name: '서연' },
    { placeId: 'demo-5', uid: 'demo-c', score: 3, name: '서연', review: '양이 조금 적어요' },
    { placeId: 'demo-7', uid: 'demo-a', score: 4, name: '민지' },
  ];
  // 점심 팟 — 동료 둘이 연 팟. 출발 시각은 지금 뒤로 잡아야 "출발했어요" 로 안 보인다.
  const first = defaultPartyTime();
  const later = Math.min(minutesOf(first) + 20, 23 * 60 + 50);
  const second = `${String(Math.floor(later / 60)).padStart(2, '0')}:${String(later % 60).padStart(2, '0')}`;
  const now = Date.now();
  const parties: Record<DayId, Party[]> = {
    [today]: [
      {
        id: 'demo-a',
        hostUid: 'demo-a',
        category: '면',
        time: first,
        max: 4,
        memo: '국물 땡기는 날',
        status: 'open',
        members: [
          { uid: 'demo-a', at: now - 600_000 },
          { uid: 'demo-c', at: now - 300_000 },
        ],
        game: null,
      },
      {
        id: 'demo-b',
        hostUid: 'demo-b',
        category: '고기',
        time: second,
        max: 3,
        memo: '',
        status: 'open',
        members: [
          { uid: 'demo-b', at: now - 900_000 },
          { uid: 'demo-d', at: now - 800_000 },
          { uid: 'demo-e', at: now - 700_000 },
        ],
        game: null,
      },
    ],
  };
  return { places, visits, office: { ...ORIGIN }, votes, ratings, parties };
}

/** 처음 상태 — 가게·기록 없이, 회사 위치도 정하기 전. */
function empty(): DemoState {
  return { places: [], visits: {}, office: null, votes: {}, ratings: [], parties: {} };
}

let memory: DemoState | null = null;
const listeners = new Set<() => void>();

export function readDemo(): DemoState {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as DemoState;
  } catch {
    // 막힌 창이면 빈 상태로 시작한다.
  }
  memory ??= empty();
  memory.ratings ??= [];
  memory.parties ??= {};
  return memory;
}

export function writeDemo(update: (s: DemoState) => DemoState): void {
  memory = update(readDemo());
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    // 저장이 막혀도 이번 방문 동안은 메모리로 돈다.
  }
  listeners.forEach((fn) => fn());
}

export function onDemoChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** 처음 상태에서 무엇이라도 바뀌었는가. 지울 게 없으면 "처음부터 다시" 를 숨긴다. */
export function hasDemoData(): boolean {
  const s = readDemo();
  return (
    s.places.length > 0 ||
    Object.keys(s.visits).length > 0 ||
    s.office !== null ||
    Object.values(s.votes).some((v) => v.length > 0) ||
    (s.ratings?.length ?? 0) > 0 ||
    Object.values(s.parties ?? {}).some((p) => p.length > 0)
  );
}

/** 데모를 처음 상태로. 화면은 새로 읽어야 하므로 부른 쪽이 새로고침한다. */
export function resetDemo(): void {
  memory = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 지울 것이 없거나 막혔다.
  }
}

/** 예시 가게·기록으로 바꾼다. 화면은 새로 읽어야 하므로 부른 쪽이 새로고침한다. */
export function loadDemoSample(): void {
  writeDemo(() => sample());
}

/** 네트워크처럼 한 박자 늦게 돌려준다. 바로 돌려주면 불러오는 중 화면이 깜빡이기만 한다. */
export const tick = () => new Promise<void>((r) => setTimeout(r, 120));
