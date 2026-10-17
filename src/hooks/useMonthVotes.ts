/**
 * 이번 달 날마다의 예측 표 — 예측왕(주·달) 계산용, 표시 전용.
 * 오늘 표는 실시간으로 듣고, 지난 날 표는 한 번만 읽는다(지난 날은 규칙상 바뀌지 않는다).
 * 읽은 지난 날 표는 이 기기에 둔다 — lib/votesCache.ts. 월말엔 화면을 열 때마다 20번 넘게 읽었다.
 */
import { useEffect, useState } from 'react';
import { monthDaysUpTo } from '../lib/report';
import { fetchVotes, subscribeVotes, type Vote } from '../services/predictions';
import type { DayId } from '../lib/date';
import { pruneCachedVotes, readCachedVotes, writeCachedVotes } from '../lib/votesCache';

/** 데모와 실제 표를 한 출처(로컬 개발)에서 섞지 않는다. */
const SCOPE = import.meta.env.VITE_DEMO === '1' ? 'demo' : 'live';

export type VotesByDay = Partial<Record<DayId, Vote[]>>;

export function useMonthVotes(today: DayId): VotesByDay {
  const [byDay, setByDay] = useState<VotesByDay>({});
  useEffect(() => {
    let alive = true;
    const put = (day: DayId, votes: Vote[]) => {
      if (alive) setByDay((s) => ({ ...s, [day]: votes }));
    };
    const days = monthDaysUpTo(today);
    pruneCachedVotes(SCOPE, days);
    for (const day of days) {
      if (day === today) continue;
      const cached = readCachedVotes(SCOPE, day);
      if (cached) {
        put(day, cached);
        continue;
      }
      fetchVotes(day).then(
        (votes) => {
          writeCachedVotes(SCOPE, day, today, votes);
          put(day, votes);
        },
        () => {
          // 못 읽은 날은 빼고 센다.
        },
      );
    }
    const stop = subscribeVotes(
      today,
      (votes) => put(today, votes),
      () => {},
    );
    return () => {
      alive = false;
      stop();
    };
  }, [today]);
  return byDay;
}
