/**
 * 화면이 쓰는 데이터 한 덩어리.
 *
 * places 와 최근 31일 visits 는 1회 읽기, 오늘 문서만 실시간 구독한다.
 * 오늘 결정이 바뀌면 그 값을 31일 목록에 머지해서 후보 산출이 바로 반영되게 한다
 * (같은 날 재결정하면 후보에서 그 가게가 빠져야 한다).
 *
 * day 가 바뀌면(자정 롤오버) 구독을 갈아끼우고 이력을 다시 읽는다.
 *
 * 첫 로드와 새로고침을 구분한다. 새로고침에서도 state 를 'loading' 으로 내리면
 * App 이 화면 전체를 자리표시자로 바꾸고, 그러면 지도 탭이 언마운트돼 지도가
 * 통째로 다시 만들어진다 — 중심·배율·열어둔 정보 카드가 전부 날아간다.
 * 목록에서 가게 하나를 끄기만 해도 화면이 깜빡였다.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DayId } from '../lib/date';
import type { Place, Visit } from '../lib/candidates';
import { setOfficeOverride, walkMinutesBetween } from '../lib/walk';
import {
  fetchOffice,
  fetchPlaces,
  fetchRecentVisits,
  subscribeToday,
  type TodayDecision,
} from '../services/lunch';

export type LoadState = 'loading' | 'ready' | 'error';

export interface LunchData {
  state: LoadState;
  error: unknown;
  places: Place[];
  /** 최근 31일 + 오늘 결정이 머지된 목록. */
  visits: Visit[];
  today: TodayDecision | null;
  /** 이미 화면이 떠 있는 상태에서 데이터를 다시 읽는 중. 화면을 가리지 않는다. */
  refreshing: boolean;
  reload: () => void;
  /** 회사 위치가 바뀌면 달라지는 값. 지도처럼 회사 좌표로 그린 것을 새로 만들 때 쓴다. */
  officeKey: string;
}

/**
 * 도보 시간은 가게 문서에 저장돼 있지만, 그건 저장한 날의 회사 기준이다.
 * 회사 위치를 옮기면 전부 틀어지므로 읽을 때 지금 회사 기준으로 다시 잰다.
 * 회사 좌표가 아예 없으면(설정 전) 저장된 값을 그대로 쓴다.
 */
function withCurrentWalk(place: Place): Place {
  try {
    return { ...place, walkMin: walkMinutesBetween(place.lat, place.lng) };
  } catch {
    return place;
  }
}

export function useLunchData(day: DayId): LunchData {
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<unknown>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [history, setHistory] = useState<Visit[]>([]);
  const [today, setToday] = useState<TodayDecision | null>(null);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [officeKey, setOfficeKey] = useState('env');

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    // 이미 한 번 떠 있으면 화면을 유지한 채 데이터만 갈아 끼운다.
    setState((s) => (s === 'ready' ? 'ready' : 'loading'));
    setRefreshing(true);
    setError(null);

    // 회사 위치를 못 읽어도 가게·기록은 보여야 한다. 그때는 .env 값으로 간다.
    Promise.all([fetchPlaces(), fetchRecentVisits(day), fetchOffice().catch(() => null)])
      .then(([p, v, office]) => {
        if (!alive) return;
        setOfficeOverride(office);
        setOfficeKey(office ? `${office.lat},${office.lng}` : 'env');
        setPlaces(p.map(withCurrentWalk));
        setHistory(v);
        setState('ready');
      })
      .catch((e) => {
        if (!alive) return;
        setError(e);
        setState('error');
      })
      .finally(() => {
        if (alive) setRefreshing(false);
      });

    return () => {
      alive = false;
    };
  }, [day, nonce]);

  useEffect(() => {
    // 구독은 익명 로그인이 붙은 뒤에 걸린다 — subscribeToday 안에서 기다린다.
    // 에러가 나면 리스너가 죽은 것이므로 화면을 에러 상태로 내린다. 조용히
    // 두면 오늘 결정이 이미 있어도 "아직 안 정했습니다" 로 보인다.
    return subscribeToday(day, setToday, (e) => {
      setError(e);
      setState('error');
    });
  }, [day, nonce]);

  const visits = useMemo(() => {
    const withoutToday = history.filter((v) => v.id !== day);
    return today ? [...withoutToday, { id: day, placeId: today.placeId }] : withoutToday;
  }, [history, today, day]);

  return { state, error, places, visits, today, refreshing, reload, officeKey };
}
