import { describe, expect, it } from 'vitest';
import { kakaoPlaceUrl, walkRouteUrl } from './directions';

describe('walkRouteUrl', () => {
  it('회사에서 가게까지 도보 경로 링크를 만든다', () => {
    const url = walkRouteUrl({ name: '박가네', lat: 37.55, lng: 126.94 }, { lat: 37.56, lng: 126.95 });
    expect(url).toBe(
      `https://map.kakao.com/link/by/walk/${encodeURIComponent('회사')},37.56,126.95/${encodeURIComponent('박가네')},37.55,126.94`,
    );
  });

  it('이름의 쉼표·빗금은 구분자와 섞이지 않게 바꾼다', () => {
    const url = walkRouteUrl({ name: '김밥, 라면/분식', lat: 1, lng: 2 }, { lat: 3, lng: 4 });
    expect(decodeURIComponent(url.split('/').pop()!)).toBe('김밥  라면 분식,1,2');
  });
});

describe('kakaoPlaceUrl — 카카오맵 장소 페이지', () => {
  it('카카오 장소 id 가 있으면 장소 페이지로', () => {
    expect(kakaoPlaceUrl({ name: '유', lat: 37.5, lng: 127, kakaoPlaceId: '12345' })).toBe('https://place.map.kakao.com/12345');
  });
  it('손으로 꽂은 가게(id 없음)는 그 자리 핀으로, 이름의 쉼표는 지운다', () => {
    expect(kakaoPlaceUrl({ name: '김밥,천국', lat: 37.5, lng: 127, kakaoPlaceId: '' })).toBe(
      `https://map.kakao.com/link/map/${encodeURIComponent('김밥 천국')},37.5,127`,
    );
  });
});
