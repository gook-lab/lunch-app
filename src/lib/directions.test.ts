import { describe, expect, it } from 'vitest';
import { walkRouteUrl } from './directions';

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
