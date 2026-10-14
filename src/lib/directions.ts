/**
 * 회사 → 가게 도보 길찾기. 카카오맵 웹 링크라 SDK·키가 필요 없고, 휴대폰에선
 * 카카오맵 앱이 있으면 앱으로 열린다. 이름의 쉼표·빗금은 링크 구분자라 공백으로 바꾼다.
 */
import type { Coord } from './walk';

const clean = (name: string) => name.replace(/[,/]/g, ' ').trim() || '목적지';

export function walkRouteUrl(to: { name: string; lat: number; lng: number }, from: Coord): string {
  const end = `${encodeURIComponent(clean(to.name))},${to.lat},${to.lng}`;
  return `https://map.kakao.com/link/by/walk/${encodeURIComponent('회사')},${from.lat},${from.lng}/${end}`;
}

/**
 * 카카오맵 장소 페이지(메뉴·사진·영업시간·전화). 영업시간·메뉴는 공개 API 로 못 받아 링크로 넘긴다.
 * 검색으로 넣은 가게는 카카오 장소 id 가 있어 그 페이지로, 지도에 손으로 꽂은 가게는 그 자리 핀으로 연다.
 */
export function kakaoPlaceUrl(place: { name: string; lat: number; lng: number; kakaoPlaceId?: string }): string {
  if (place.kakaoPlaceId) return `https://place.map.kakao.com/${encodeURIComponent(place.kakaoPlaceId)}`;
  return `https://map.kakao.com/link/map/${encodeURIComponent(clean(place.name))},${place.lat},${place.lng}`;
}
