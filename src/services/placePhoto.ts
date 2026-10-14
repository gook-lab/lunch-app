/**
 * 가게 사진 — /api/photo(서버 함수)가 찾은 검색 썸네일. 없으면 null.
 * 같은 가게를 다시 묻지 않게 이 브라우저에 30일(없음은 1일) 기억한다.
 * 개발 서버엔 /api 가 없어 index.html 이 돌아오는데, JSON 이 아니면 null 로 본다.
 */
import { useEffect, useState } from 'react';
import type { Place } from '../lib/candidates';

export interface PlacePhoto {
  thumb: string;
  source: string | null;
  /** 대표(thumb) 포함 최대 넷. 예전 응답엔 없다. */
  photos: string[];
}

const DAY = 24 * 60 * 60 * 1000;
// v3: 사진 여러 장(photos). v2: 검색어를 행정동→법정동→구로 넓혔다(10/14). 예전 기억은 버린다.
const KEY = 'lunch-app:photo3:';

type Cached = { at: number; photo: PlacePhoto | null };

function cacheKey(place: Pick<Place, 'id' | 'name'>) {
  return `${KEY}${place.id}:${place.name}`;
}

export function readCached(place: Pick<Place, 'id' | 'name'>, now = Date.now()): PlacePhoto | null | undefined {
  try {
    const raw = localStorage.getItem(cacheKey(place));
    if (!raw) return undefined;
    const c = JSON.parse(raw) as Cached;
    const ttl = c.photo ? 30 * DAY : DAY;
    return now - c.at < ttl ? c.photo : undefined;
  } catch {
    return undefined;
  }
}

function writeCached(place: Pick<Place, 'id' | 'name'>, photo: PlacePhoto | null) {
  try {
    localStorage.setItem(cacheKey(place), JSON.stringify({ at: Date.now(), photo } satisfies Cached));
  } catch {
    // 저장소가 막혀도 사진만 다시 찾으면 된다.
  }
}

const inflight = new Map<string, Promise<PlacePhoto | null>>();

export function fetchPlacePhoto(place: Pick<Place, 'id' | 'name' | 'lat' | 'lng'>): Promise<PlacePhoto | null> {
  const cached = readCached(place);
  if (cached !== undefined) return Promise.resolve(cached);
  const k = cacheKey(place);
  const pending = inflight.get(k);
  if (pending) return pending;
  const qs = new URLSearchParams({ name: place.name, lat: String(place.lat), lng: String(place.lng) });
  const p = fetch(`/api/photo?${qs}`)
    .then(async (res) => {
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
      const body = (await res.json()) as Partial<PlacePhoto>;
      const photo =
        typeof body.thumb === 'string'
          ? {
              thumb: body.thumb,
              source: body.source ?? null,
              photos: Array.isArray(body.photos)
                ? body.photos.filter((u) => typeof u === 'string').slice(0, 4)
                : [body.thumb],
            }
          : null;
      writeCached(place, photo);
      return photo;
    })
    .catch(() => null)
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** 가게 사진 한 번만 묻기. 같은 가게를 여러 곳(머리 사진·사진 줄)에서 써도 요청은 하나다. */
export function usePlacePhoto(place: Pick<Place, 'id' | 'name' | 'lat' | 'lng'>): PlacePhoto | null {
  const [photo, setPhoto] = useState<PlacePhoto | null>(() => readCached(place) ?? null);
  useEffect(() => {
    let alive = true;
    void fetchPlacePhoto(place).then((p) => {
      if (alive) setPhoto(p);
    });
    return () => {
      alive = false;
    };
    // 같은 가게면 다시 묻지 않는다. 이름을 고치면 다른 사진을 찾는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, place.name]);
  return photo;
}
