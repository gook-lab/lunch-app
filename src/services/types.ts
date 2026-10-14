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
