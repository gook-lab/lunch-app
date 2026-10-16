/**
 * 이번 달 날마다의 예측 표 — 예측왕(주·달) 계산용, 표시 전용.
 * 오늘 표는 실시간으로 듣고, 지난 날 표는 한 번만 읽는다(지난 날은 규칙상 바뀌지 않는다).
 */
import { useEffect, useState } from 'react';
import { monthDaysUpTo } from '../lib/report';
import { fetchVotes, subscribeVotes, type Vote } from '../services/predictions';
import type { DayId } from '../lib/date';

export type VotesByDay = Partial<Record<DayId, Vote[]>>;

export function useMonthVotes(today: DayId): VotesByDay {
  const [byDay, setByDay] = useState<VotesByDay>({});
  useEffect(() => {
    let alive = true;
    const put = (day: DayId, votes: Vote[]) => {
      if (alive) setByDay((s) => ({ ...s, [day]: votes }));
    };
    for (const day of monthDaysUpTo(today)) {
      if (day === today) continue;
      fetchVotes(day).then(
        (votes) => put(day, votes),
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
