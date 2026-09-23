/**
 * 지금의 KST 날짜. 탭이 살아 있는 동안 계속 맞게 유지한다.
 *
 * 마운트 때 한 번만 계산하면 이런 일이 난다 — 사무실 데스크톱에 탭을 켜둔 채
 * 퇴근하고, 다음 날 12시에 그 탭은 여전히 어제 문서를 구독 중이다. 결정 버튼은
 * 어제 id 로 쓰려다 "지난 날짜는 불변" 규칙에 걸려 거부되고, 그 사람은
 * "앱이 고장났다" 고 보고한다. 삭제도 막혀 있어 되돌릴 수도 없다.
 *
 * 그래서 탭이 다시 보일 때와 포커스를 받을 때, 그리고 1분마다 다시 잰다.
 */
import { useEffect, useState } from 'react';
import { todayKST, type DayId } from '../lib/date';

const RECHECK_MS = 60_000;

export function useTodayKST(): DayId {
  const [day, setDay] = useState<DayId>(() => todayKST());

  useEffect(() => {
    const check = () => setDay((prev) => {
      const now = todayKST();
      return now === prev ? prev : now;
    });

    const timer = window.setInterval(check, RECHECK_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return day;
}
