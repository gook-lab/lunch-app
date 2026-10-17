import type { KakaoPlace } from '../types/kakao';
import type { Coord } from '../lib/walk';
import { loadKakaoMaps } from './kakao';

/** 가게 고치기에서 쓰는 장소 검색 결과. 좌표는 숫자로 바꿔 둔다. */
export interface PlaceHit {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export function toHit(p: KakaoPlace): PlaceHit {
  return {
    id: p.id,
    name: p.place_name,
    address: p.road_address_name || p.address_name,
    lat: Number(p.y),
    lng: Number(p.x),
  };
}

/**
 * 회사 근처(반경 3km)에서 가게 이름·주소로 찾는다. 카카오 지도를 못 부르는 곳(데모·키 없음)에선
 * 오류를 던진다 — 부르는 쪽이 "좌표 직접 넣기" 로 안내한다.
 */
export async function searchPlacesNear(query: string, center: Coord): Promise<PlaceHit[]> {
  const maps = await loadKakaoMaps();
  const Places = maps.services?.Places;
  if (!Places) throw new Error('장소 검색을 쓸 수 없어요.');
  return new Promise((resolve, reject) => {
    new Places().keywordSearch(
      query,
      (data, status) => {
        if (status === maps.services.Status.OK) resolve(data.slice(0, 5).map(toHit));
        else if (status === maps.services.Status.ZERO_RESULT) resolve([]);
        else reject(new Error('검색하지 못했어요.'));
      },
      { location: new maps.LatLng(center.lat, center.lng), radius: 3000, size: 5, sort: 'accuracy' },
    );
  });
}
