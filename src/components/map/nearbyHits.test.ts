import { describe, expect, it } from 'vitest';
import type { Place } from '../../lib/candidates';
import type { KakaoPlace } from '../../types/kakao';
import { nearbyHits, TAP_MAX_HITS } from './nearbyHits';

const hit = (id: string, name: string, lat: number, lng: number): KakaoPlace => ({
  id,
  place_name: name,
  category_name: '음식점 > 한식',
  category_group_name: '음식점',
  address_name: '',
  road_address_name: '',
  x: String(lng),
  y: String(lat),
});
const place = (name: string, lat: number, lng: number) => ({ id: name, name, lat, lng }) as unknown as Place;

describe('nearbyHits', () => {
  const at = { lat: 37.5663, lng: 126.9779 };
  it('가까운 순으로 최대 네 곳', () => {
    const data = [0.0004, 0.0001, 0.0003, 0.0002, 0.00005].map((d, i) =>
      hit(String(i), `가게${i}`, at.lat + d, at.lng),
    );
    const out = nearbyHits([], at, data);
    expect(out).toHaveLength(TAP_MAX_HITS);
    expect(out.map((h) => h.hit.id)).toEqual(['4', '1', '3', '2']);
  });
  it('같은 이름이거나 20m 안이면 이미 있는 가게를 붙인다', () => {
    const same = place('소오 시청점', 37.57, 126.99);
    const near = place('다른 이름', at.lat + 0.0001, at.lng);
    const out = nearbyHits([same, near], at, [
      hit('a', '소오시청점', at.lat, at.lng),
      hit('b', '처음 보는 집', at.lat + 0.0001, at.lng + 0.00001),
      hit('c', '먼 집', at.lat + 0.0004, at.lng),
    ]);
    expect(out.find((h) => h.hit.id === 'a')?.existing).toBe(same);
    expect(out.find((h) => h.hit.id === 'b')?.existing).toBe(near);
    expect(out.find((h) => h.hit.id === 'c')?.existing).toBeNull();
  });
});
