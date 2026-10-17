/**
 * 오늘 점심 팟 — 실시간 목록과 내 uid, 오늘 날짜에 묶은 동작, 그리고 알림.
 * 날이 바뀌면(useTodayKST) 새 날 목록으로 갈아탄다. 어제 팟은 규칙상 고칠 수도 없다.
 *
 * 알림은 두 가지다(lib/party.ts). 내가 연 팟에 누가 들어옴 — 목록이 올 때 바로 전 목록과 비교한다.
 * 내가 든 팟이 10분 안에 출발함 — 30초마다 본다. 같은 알림(key)은 닫아도 다시 띄우지 않는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DayId } from '../lib/date';
import { departingAlerts, joinAlerts, nowMinutesKST, partyAlertText, type PartyAlert } from '../lib/party';
import { askNotifyOnce, notifyIfHidden } from '../lib/notify';
import {
  cancelParty,
  guessParty,
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

const DEPART_CHECK_MS = 30_000;

export function useParties(day: DayId): {
  parties: Party[];
  uid: string | null;
  actions: PartyActions;
  alerts: PartyAlert[];
  dismissAlert: (key: string) => void;
} {
  // 받은 날짜와 같이 둔다. 날이 바뀐 직후 새 목록이 오기 전에는 어제 팟을 보여 주지 않는다.
  const [got, setGot] = useState<{ day: DayId; list: Party[] }>({ day, list: [] });
  const [uid, setUid] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<{ day: DayId; list: PartyAlert[] }>({ day, list: [] });
  // 콜백 안에서 쓰는 최신 값. 상태로 두면 구독을 다시 걸어야 한다.
  const uidRef = useRef<string | null>(null);
  const listRef = useRef<Party[] | null>(null);
  const seen = useRef(new Set<string>());

  const push = useCallback(
    (found: PartyAlert[]) => {
      const fresh = found.filter((a) => !seen.current.has(a.key));
      if (fresh.length === 0) return;
      for (const a of fresh) seen.current.add(a.key);
      // 다른 창을 보고 있으면 브라우저 알림으로도(허락했을 때만).
      notifyIfHidden(fresh.map((a) => ({ tag: a.key, text: `${a.type === 'joined' ? '🙌' : '⏰'} ${partyAlertText(a, day)}` })));
      setAlerts((prev) => ({ day, list: [...(prev.day === day ? prev.list : []), ...fresh] }));
    },
    [day],
  );

  useEffect(() => {
    let live = true;
    listRef.current = null; // 이 날의 첫 목록은 비교할 전 목록이 없다 — 알리지 않는다.
    seen.current = new Set();
    partyUid()
      .then((u) => {
        if (!live) return;
        uidRef.current = u;
        setUid(u);
      })
      .catch(() => {});
    const stop = subscribeParties(
      day,
      (list) => {
        setGot({ day, list });
        push(joinAlerts(listRef.current, list, uidRef.current));
        push(departingAlerts(list, uidRef.current, nowMinutesKST()));
        listRef.current = list;
      },
      () => setGot({ day, list: [] }),
    );
    const timer = window.setInterval(() => {
      if (listRef.current) push(departingAlerts(listRef.current, uidRef.current, nowMinutesKST()));
    }, DEPART_CHECK_MS);
    return () => {
      live = false;
      stop();
      window.clearInterval(timer);
    };
  }, [day, push]);

  const dismissAlert = useCallback((key: string) => {
    setAlerts((prev) => ({ ...prev, list: prev.list.filter((a) => a.key !== key) }));
  }, []);

  const actions = useMemo<PartyActions>(
    () => ({
      // 팟에 들어가거나 열 때 — 알림이 쓸모 있어지는 순간에 한 번만 허락을 묻는다.
      open: (input) => {
        askNotifyOnce();
        return openParty(day, input);
      },
      join: (id) => {
        askNotifyOnce();
        return joinParty(day, id);
      },
      leave: (id) => leaveParty(day, id),
      setStatus: (id, status) => setPartyStatus(day, id, status),
      cancel: (id) => cancelParty(day, id),
      saveGame: (id, game) => savePartyGame(day, id, game),
      guess: (id, placeId) => guessParty(day, id, placeId),
    }),
    [day],
  );
  return {
    parties: got.day === day ? got.list : [],
    uid,
    actions,
    alerts: alerts.day === day ? alerts.list : [],
    dismissAlert,
  };
}
