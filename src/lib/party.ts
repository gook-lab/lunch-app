/**
 * 점심 팟 — "오늘 밥 갈 사람?" 을 모으는 규칙. 서비스·화면과 떼어 테스트한다.
 *
 * 같은 검사를 Firestore 규칙(firestore.rules 의 parties)도 한다. 규칙이 최종 방어선이고,
 * 여기는 보내기 전에 사람이 읽을 말로 알려 주는 쪽이다. 숫자(2~10명·40자·HH:MM)는 둘이 같아야 한다.
 */
import type { Place } from './candidates';
import { CATEGORIES } from './category';
import { GAME_MODES, type GameMode } from '../components/games/types';
import type { Party, PartyGame, PartyInput, PartyMember } from '../services/types';
import { avatarOf } from './avatar';
import type { DayId } from './date';

export const PARTY_MIN = 2;
export const PARTY_MAX = 10;
export const PARTY_DEFAULT_MAX = 4;
export const PARTY_MEMO_MAX = 40;
export const PARTY_DEFAULT_TIME = '11:50';
/** 게임 후보 상한. 규칙의 ids/names 크기 상한과 같다. */
export const PARTY_GAME_MAX = 30;

/**
 * 팟에서 돌릴 수 있는 게임. 모인 사람이 각자 같은 연출을 다시 봐야 하므로
 * candidates·winnerIndex·run 만으로 그려지는 게임만 둔다.
 * 짝 맞추기(사람이 둔다)·사다리·카드(출발을 사람이 고른다)·핀볼(공 개수·자리 섞기)은 뺀다.
 */
export const PARTY_MODES: readonly GameMode[] = [
  'archery',
  'penalty',
  'bowling',
  'claw',
  'treasure',
  'fishing',
  'curling',
  'plane',
  'horse',
  'racing',
  'bomb',
  'balloon',
  'plinko',
  'wheel',
  'slot',
  'dice',
  'gacha',
  'tournament',
];

/** 게임 이름(칩 글자). 모르는 값이면 "게임". */
export function modeLabel(mode: string): string {
  return GAME_MODES.find((m) => m.id === mode)?.label ?? '게임';
}

const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

/** "11:50" → 710. */
export function minutesOf(time: string): number {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

const KST_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** 지금 KST 몇 분째인가(0~1439). 기기 시간대와 상관없다 — lib/date.ts 와 같은 이유. */
export function nowMinutesKST(now: Date = new Date()): number {
  return minutesOf(KST_CLOCK.format(now));
}

/** 처음 고를 출발 시각. 11:50 이 지났으면 지금부터 10분 뒤 칸(10분 단위)으로. */
export function defaultPartyTime(now: Date = new Date()): string {
  const m = nowMinutesKST(now);
  if (m < minutesOf(PARTY_DEFAULT_TIME)) return PARTY_DEFAULT_TIME;
  const next = Math.min(Math.ceil((m + 10) / 10) * 10, 23 * 60 + 50);
  return `${String(Math.floor(next / 60)).padStart(2, '0')}:${String(next % 60).padStart(2, '0')}`;
}

/**
 * 출발 시각 칸. 브라우저 시간 입력칸은 기기 언어에 따라 "06:20 PM" 처럼 나와(10/15) 단추로 고르게 한다.
 * 점심 전(11:20 전)이면 11:30 부터, 아니면 지금부터 10분 뒤 칸부터 10분 간격. 23:50 을 넘지 않는다.
 * defaultPartyTime 이 늘 이 안에 있다.
 */
export function partyTimeSlots(now: Date = new Date(), count = 8): string[] {
  const m = nowMinutesKST(now);
  const first = m < 11 * 60 + 20 ? 11 * 60 + 30 : Math.ceil((m + 10) / 10) * 10;
  const out: string[] = [];
  for (let t = first; out.length < count && t <= 23 * 60 + 50; t += 10)
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  return out;
}

/** 보내기 전 검사. 문제가 없으면 null, 있으면 사람이 읽을 한 마디. */
export function partyInputProblem(input: PartyInput, now: Date = new Date()): string | null {
  if (!(CATEGORIES as readonly string[]).includes(input.category)) return '메뉴를 골라 주세요';
  if (!isValidTime(input.time)) return '출발 시각을 확인해 주세요';
  if (minutesOf(input.time) <= nowMinutesKST(now)) return '이미 지난 시각이에요';
  if (!Number.isInteger(input.max) || input.max < PARTY_MIN || input.max > PARTY_MAX)
    return `인원은 ${PARTY_MIN}~${PARTY_MAX}명이에요`;
  if (input.memo.trim().length > PARTY_MEMO_MAX) return `메모는 ${PARTY_MEMO_MAX}자까지예요`;
  return null;
}

/** 인원 단추(−/+)가 넘지 않게. */
export function clampMax(n: number): number {
  return Math.min(PARTY_MAX, Math.max(PARTY_MIN, Math.round(n)));
}

/**
 * 지금 이 팟이 어떤 처지인가. 출발이 가장 강하다 — 시각이 지나면 마감·만석은 의미가 없다.
 * open 만 참여할 수 있다.
 */
export type PartyPhase = 'open' | 'full' | 'closed' | 'departed';

export function partyPhase(
  party: Pick<Party, 'time' | 'status' | 'max' | 'members'>,
  now: Date = new Date(),
): PartyPhase {
  if (minutesOf(party.time) <= nowMinutesKST(now)) return 'departed';
  if (party.status === 'closed') return 'closed';
  if (party.members.length >= party.max) return 'full';
  return 'open';
}

export const PHASE_LABEL: Record<PartyPhase, string> = {
  open: '모집 중',
  full: '꽉 찼어요',
  closed: '마감',
  departed: '출발했어요',
};

export function isMember(party: Pick<Party, 'members'>, uid: string | null): boolean {
  return uid !== null && party.members.some((m) => m.uid === uid);
}

/** 모집 중인 것부터, 그다음 출발 시각 순. */
export function sortParties(parties: readonly Party[], now: Date = new Date()): Party[] {
  const rank = (p: Party) => (partyPhase(p, now) === 'open' ? 0 : partyPhase(p, now) === 'departed' ? 2 : 1);
  return [...parties].sort((a, b) => rank(a) - rank(b) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}

const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;

/**
 * 저장된 게임 값을 믿을 수 있는 모양으로. 규칙은 목록 안 원소의 형을 검사하지 못한다
 * (Firestore 규칙에 반복문이 없다). 모양이 틀리면 없는 것으로 본다 — 화면이 깨지는 것보다 낫다.
 */
export function readGame(raw: unknown): PartyGame | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const { mode, run, ids, names, winnerIndex } = g;
  if (!isStr(mode, 16) || !(PARTY_MODES as readonly string[]).includes(mode)) return null;
  if (typeof run !== 'number' || !Number.isFinite(run)) return null;
  if (!Array.isArray(ids) || !Array.isArray(names) || ids.length !== names.length) return null;
  if (ids.length < 2 || ids.length > PARTY_GAME_MAX) return null;
  if (!ids.every((v) => isStr(v, 64)) || !names.every((v) => isStr(v, 40))) return null;
  if (typeof winnerIndex !== 'number' || !Number.isInteger(winnerIndex) || winnerIndex < 0 || winnerIndex >= ids.length)
    return null;
  return { mode, run, ids: [...ids], names: [...names], winnerIndex };
}

/** 저장된 문서 → 화면이 쓰는 팟. 모양이 틀린 문서는 null(목록에서 뺀다). */
export function readParty(id: string, raw: Record<string, unknown>, memberTime: (v: unknown) => number): Party | null {
  const { hostUid, category, time, max, memo, status, members, game } = raw;
  if (!isStr(hostUid, 128) || !isStr(category, 20) || !isStr(time, 5) || !isValidTime(time)) return null;
  if (typeof max !== 'number' || !isStr(memo, PARTY_MEMO_MAX)) return null;
  if (status !== 'open' && status !== 'closed') return null;
  if (!members || typeof members !== 'object') return null;
  const list: PartyMember[] = Object.entries(members as Record<string, unknown>)
    .map(([uid, at]) => ({ uid, at: memberTime(at) }))
    // 방장이 늘 첫 사람. 나머지는 들어온 순서(서버 시각), 같으면 uid.
    .sort((a, b) => (a.uid === hostUid ? -1 : b.uid === hostUid ? 1 : a.at - b.at || a.uid.localeCompare(b.uid)));
  return { id, hostUid, category, time, max, memo, status, members: list, game: readGame(game) };
}

/**
 * 팟 게임 후보. 규칙이 30곳까지만 받으므로 넘치면 무작위로 30곳을 고른다.
 * 앞에서 30곳을 자르면 목록 뒤쪽 가게는 영영 안 뽑힌다. 섞어서 고르면 가게마다
 * 뽑힐 확률이 같고, 그다음 pickWinner 가 그 안에서 균등하게 정한다.
 */
export function partyCandidates<T>(list: readonly T[], random: () => number): T[] {
  if (list.length <= PARTY_GAME_MAX) return [...list];
  const pool = [...list];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, PARTY_GAME_MAX);
}

/**
 * 게임판에 올릴 가게. 저장된 id 로 지금 가게를 찾고(사진·카테고리), 없어진 가게는 저장된 이름으로 세운다.
 * 이름은 늘 저장된 것을 쓴다 — 그사이 누가 이름을 고쳐도 모두 같은 장면을 본다.
 */
export function gameBoard(game: PartyGame, places: readonly Place[], category: string): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  return game.ids.map((id, i) => ({
    ...(byId.get(id) ?? {
      id,
      category,
      lat: 0,
      lng: 0,
      walkMin: 0,
      kakaoPlaceId: '',
      active: false,
      createdBy: '',
    }),
    name: game.names[i],
  }));
}

/** 팟 알림. key 로 한 번만 띄운다(같은 사람·같은 팟의 출발 알림은 하루에 한 번). */
export interface PartyAlert {
  key: string;
  type: 'joined' | 'departing';
  partyId: string;
  category: string;
  /** joined 일 때 들어온 사람 uid. 화면에선 익명 아바타 이름으로 바꿔 보여 준다. */
  uid?: string;
}

/** 알림 한 줄 — 화면 안 알림과 브라우저 알림이 같은 말을 쓴다. */
export function partyAlertText(a: PartyAlert, day: DayId): string {
  return a.type === 'joined' && a.uid
    ? `${avatarOf(a.uid, day).label}님이 ${a.category} 팟에 들어왔어요`
    : `${a.category} 팟이 곧 출발해요`;
}

/** 출발 몇 분 전부터 "곧 출발" 로 알리나. */
export const DEPART_ALERT_MIN = 10;

/**
 * 내가 연 팟에 새로 들어온 사람. prev 가 null(첫 목록)이면 없다 — 열자마자 지난 참여를 다 알리면 시끄럽다.
 * 나간 뒤 다시 들어오면 다시 알린다(키에 참여 시각을 넣는다).
 */
export function joinAlerts(prev: readonly Party[] | null, next: readonly Party[], myUid: string | null): PartyAlert[] {
  if (prev === null || myUid === null) return [];
  const out: PartyAlert[] = [];
  for (const party of next) {
    if (party.hostUid !== myUid) continue;
    const before = new Set(prev.find((p) => p.id === party.id)?.members.map((m) => m.uid) ?? []);
    for (const m of party.members) {
      if (m.uid === myUid || before.has(m.uid)) continue;
      out.push({ key: `join-${party.id}-${m.uid}-${m.at}`, type: 'joined', partyId: party.id, category: party.category, uid: m.uid });
    }
  }
  return out;
}

/** 내가 든 팟 가운데 출발이 DEPART_ALERT_MIN 분 안으로 다가온 것(이미 출발한 팟은 빼고). */
export function departingAlerts(parties: readonly Party[], myUid: string | null, nowMinutes: number): PartyAlert[] {
  if (myUid === null) return [];
  return parties
    .filter((p) => isMember(p, myUid))
    .filter((p) => {
      const left = minutesOf(p.time) - nowMinutes;
      return left > 0 && left <= DEPART_ALERT_MIN;
    })
    .map((p) => ({ key: `depart-${p.id}`, type: 'departing' as const, partyId: p.id, category: p.category }));
}
