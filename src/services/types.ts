/** 데이터 쪽이 화면에 넘기는 모양. Firebase 와 데모 구현이 같이 쓴다. */
import type { DayId } from '../lib/date';

export interface TodayDecision {
  dayId: DayId;
  placeId: string;
  /** 어떤 게임으로 뽑았는지(10/14 부터). */
  mode?: string;
}

export interface Vote {
  uid: string;
  placeId: string;
  name: string;
}

export type Unsubscribe = () => void;

/** 한 사람(익명 uid)이 한 가게에 남긴 별점. places/{placeId}/ratings/{uid}. */
export interface PlaceVote {
  placeId: string;
  uid: string;
  score: number;
  review?: string;
  name?: string;
}

/** 점심 팟 상태. 취소는 문서를 지운다(방장만). */
export type PartyStatus = 'open' | 'closed';

/**
 * 팟에서 방장이 한 번 돌린 게임. 당첨은 방장 기기의 pickWinner 가 한 번만 정하고,
 * 모인 사람은 이 값으로 같은 연출을 다시 그린다. 가게가 지워져도 그리게 이름을 같이 둔다.
 */
export interface PartyGame {
  mode: string;
  run: number;
  ids: string[];
  names: string[];
  winnerIndex: number;
}

/** 한 사람의 참여. at 은 참여 순서를 정하는 데만 쓴다(ms). */
export interface PartyMember {
  uid: string;
  at: number;
}

/** parties/{오늘}/list/{방장 uid}. 방장 한 사람이 하루 한 팟. */
export interface Party {
  /** 문서 id = 방장 uid. */
  id: string;
  hostUid: string;
  /** 메뉴(대분류) — lib/category.ts 의 CATEGORIES. */
  category: string;
  /** 출발 시각 "HH:MM"(KST). */
  time: string;
  max: number;
  memo: string;
  status: PartyStatus;
  /** 참여 순. 방장이 첫 사람이다. */
  members: PartyMember[];
  game: PartyGame | null;
}

/** 팟을 열 때 고르는 값. */
export interface PartyInput {
  category: string;
  time: string;
  max: number;
  memo: string;
}
