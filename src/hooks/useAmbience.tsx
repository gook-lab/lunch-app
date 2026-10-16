/**
 * 게임 분위기 공급자. App 이 한 번 감싸고, 게임은 useAmbience() 로 읽는다.
 * 계절 설정이 바뀌면(lunch-app:season 이벤트) 다시 계산한다.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { resolveAmbience, type Ambience } from '../lib/ambience';
import { fetchWeather } from '../services/weather';

const AmbienceContext = createContext<Ambience>(resolveAmbience(null));

export function AmbienceProvider({
  office,
  children,
}: {
  office: { lat: number; lng: number } | null;
  children: ReactNode;
}) {
  const [code, setCode] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const lat = office?.lat;
  const lng = office?.lng;

  useEffect(() => {
    if (lat == null || lng == null) return;
    let alive = true;
    fetchWeather(lat, lng).then((w) => {
      if (alive) setCode(w?.current.weather_code ?? null);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    window.addEventListener('lunch-app:season', bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener('lunch-app:season', bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  // tick 은 계절 설정이 바뀌었을 때 다시 계산하게 만드는 값이다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ambience = useMemo(() => resolveAmbience(code), [code, tick]);

  return <AmbienceContext.Provider value={ambience}>{children}</AmbienceContext.Provider>;
}

export function useAmbience(): Ambience {
  return useContext(AmbienceContext);
}
