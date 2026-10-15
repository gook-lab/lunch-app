/**
 * 오늘 점심 팟 — 실시간 목록과 내 uid, 오늘 날짜에 묶은 동작.
 * 날이 바뀌면(useTodayKST) 새 날 목록으로 갈아탄다. 어제 팟은 규칙상 고칠 수도 없다.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DayId } from '../lib/date';
import { nowMinutesKST, partyAlerts, type PartyAlert } from '../lib/party';
import {
  cancelParty,
  joinParty,
  leaveParty,
  openParty,
  partyUid,
  savePartyGame,
  setPartyStatus,
  subscribeParties,
  type Party,
} from '../services/parties';
import type { PartyActions } from '../components/Parties';

export function useParties(day: DayId): {
  parties: Party[];
  uid: string | null;
  alerts: PartyAlert[];
  actions: PartyActions;
} {
  // 받은 날짜와 같이 둔다. 날이 바뀐 직후 새 목록이 오기 전에는 어제 팟을 보여 주지 않는다.
  const [got, setGot] = useState<{ day: DayId; list: Party[] }>({ day, list: [] });
  const [uid, setUid] = useState<string | null>(null);
  const [prevParties, setPrevParties] = useState<Party[] | null>(null);
  const [alerts, setAlerts] = useState<PartyAlert[]>([]);

  useEffect(() => {
    let live = true;
    partyUid()
      .then((u) => live && setUid(u))
      .catch(() => {});
    const stop = subscribeParties(
      day,
      (list) => {
        setGot({ day, list });
        // 팟 목록이 업데이트되면 새 알림 감지
        if (live && uid !== null) {
          const nowMin = nowMinutesKST();
          const newAlerts = partyAlerts(prevParties, list, uid, nowMin);
          if (newAlerts.length > 0) {
            setAlerts(newAlerts);
          }
          setPrevParties(list);
        }
      },
      () => setGot({ day, list: [] }),
    );
    return () => {
      live = false;
      stop();
    };
  }, [day, uid, prevParties]);

  const actions = useMemo<PartyActions>(
    () => ({
      open: (input) => openParty(day, input),
      join: (id) => joinParty(day, id),
      leave: (id) => leaveParty(day, id),
      setStatus: (id, status) => setPartyStatus(day, id, status),
      cancel: (id) => cancelParty(day, id),
      saveGame: (id, game) => savePartyGame(day, id, game),
    }),
    [day],
  );

  return { parties: got.day === day ? got.list : [], uid, alerts, actions };
}
