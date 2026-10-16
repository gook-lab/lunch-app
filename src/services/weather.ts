/**
 * Open-Meteo 날씨 정보 조회 (무료, API 키 불필요).
 * 회사 좌표 기반으로 현재 기상과 당일 강수 예측을 가져온다.
 *
 * sessionStorage 에 약 15분 캐싱해서 반복 요청을 줄인다.
 * 네트워크 오류나 타임아웃은 조용히 null 로 돌려 UI 에 영향을 주지 않는다.
 */

export interface WeatherData {
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    rain: number;
    snowfall: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  hourly?: {
    precipitation_probability: number[];
    temperature_2m: number[];
    weather_code: number[];
    time: string[];
  };
}

const CACHE_KEY_PREFIX = 'lunch-app:weather:';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15분
const FAILURE_CACHE_MS = 60 * 1000; // 장애 중 재마운트가 외부 API를 연속 호출하지 않게 1분 쉰다.
const failedAt = new Map<string, number>();
const inflight = new Map<string, Promise<WeatherData | null>>();

function getCacheKey(lat: number, lng: number): string {
  // 반올림해서 캐시 키 만들기 — 약간의 좌표 변화는 같은 캐시를 쓴다.
  const roundedLat = Math.round(lat * 100) / 100;
  const roundedLng = Math.round(lng * 100) / 100;
  return `${CACHE_KEY_PREFIX}${roundedLat},${roundedLng}`;
}

function readCache(key: string): WeatherData | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (!cached) return null;
    const { data, time } = JSON.parse(cached);
    if (Date.now() - time > CACHE_DURATION_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: WeatherData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, time: Date.now() }));
  } catch {
    // localStorage 가득 찼으면 조용히 실패
  }
}

export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherData | null> {
  const cacheKey = getCacheKey(lat, lng);
  const cached = readCache(cacheKey);
  if (cached) return cached;
  if (Date.now() - (failedAt.get(cacheKey) ?? 0) < FAILURE_CACHE_MS) return null;

  const running = inflight.get(cacheKey);
  if (running) return running;

  const request = (async () => {
    try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5초 타임아웃

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m');
    url.searchParams.set('hourly', 'precipitation_probability,temperature_2m,weather_code');
    url.searchParams.set('timezone', 'Asia/Seoul');
    url.searchParams.set('forecast_days', '1');

      const res = await fetch(url.toString(), { signal: controller.signal }).finally(() => clearTimeout(timeout));

      if (!res.ok) {
        failedAt.set(cacheKey, Date.now());
        return null;
      }
      const data = (await res.json()) as WeatherData;
      failedAt.delete(cacheKey);
      writeCache(cacheKey, data);
      return data;
    } catch {
      // 네트워크 오류, 타임아웃, JSON 파싱 실패 — 모두 무시하되 잠깐 쉬어 장애를 증폭하지 않는다.
      failedAt.set(cacheKey, Date.now());
      return null;
    } finally {
      inflight.delete(cacheKey);
    }
  })();
  inflight.set(cacheKey, request);
  return request;
}
