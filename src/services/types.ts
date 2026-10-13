/** 데이터 쪽이 화면에 넘기는 모양. Firebase 와 데모 구현이 같이 쓴다. */
import type { DayId } from '../lib/date';

export interface TodayDecision {
  dayId: DayId;
  placeId: string;
}

export interface Vote {
  uid: string;
  placeId: string;
  name: string;
}

export type Unsubscribe = () => void;
