// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPlacePhoto, readCached } from '../placePhoto';

const place = { id: 'p1', name: '골목 칼국수', lat: 37.56, lng: 126.97 };

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('가게 사진 가져오기', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('찾은 썸네일을 돌려주고 이 브라우저에 기억해 다시 묻지 않는다', async () => {
    const f = vi.fn().mockResolvedValue(json({ thumb: 'https://search1.kakaocdn.net/a.jpg', source: '블로그' }));
    vi.stubGlobal('fetch', f);
    expect(await fetchPlacePhoto(place)).toEqual({ thumb: 'https://search1.kakaocdn.net/a.jpg', source: '블로그', photos: ['https://search1.kakaocdn.net/a.jpg'] });
    expect(await fetchPlacePhoto(place)).toEqual({ thumb: 'https://search1.kakaocdn.net/a.jpg', source: '블로그', photos: ['https://search1.kakaocdn.net/a.jpg'] });
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0][0])).toContain('name=%EA%B3%A8%EB%AA%A9');
  });

  it('개발 서버처럼 JSON 이 아닌 응답이면 사진 없음', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    expect(await fetchPlacePhoto(place)).toBeNull();
  });

  it('사진 없음은 하루만 기억한다 — 키를 넣은 뒤 다시 찾게', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ thumb: null })));
    await fetchPlacePhoto(place);
    expect(readCached(place)).toBeNull();
    expect(readCached(place, Date.now() + 2 * 24 * 60 * 60 * 1000)).toBeUndefined();
  });

  it('네트워크가 실패해도 던지지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchPlacePhoto(place)).toBeNull();
  });
});
