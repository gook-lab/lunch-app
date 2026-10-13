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
