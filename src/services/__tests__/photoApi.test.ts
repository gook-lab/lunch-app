import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — 서버 함수는 JS(Vercel). 타입 없이 동작만 확인한다.
import handler, { inKorea, photoQueries, photoQuery, pickPhoto } from '../../../api/photo.js';

function call(qs: string) {
  const out: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    setHeader: (k: string, v: string) => (out.headers[k] = v),
    status(code: number) {
      out.status = code;
      return { json: (b: unknown) => (out.body = b) };
    },
  };
  return Promise.resolve(handler({ url: `/api/photo?${qs}` }, res)).then(() => out);
}

describe('/api/photo', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('검색어는 가게 이름 + 동, 썸네일은 https 인 첫 결과', () => {
    expect(photoQuery('골목 칼국수', '명동')).toBe('골목 칼국수 명동');
    expect(photoQuery('골목 칼국수', '')).toBe('골목 칼국수');
    expect(
      pickPhoto([{ thumbnail_url: 'http://x' }, { thumbnail_url: 'https://y', display_sitename: '블로그' }]),
    ).toEqual({
      thumb: 'https://y',
      source: '블로그',
      photos: ['https://y'],
    });
    const many = ['a', 'b', 'b', 'c', 'd', 'e'].map((x) => ({ thumbnail_url: `https://${x}` }));
    expect(pickPhoto(many)?.photos).toEqual(['https://a', 'https://b', 'https://c', 'https://d']);
    expect(pickPhoto([])).toBeNull();
    expect(inKorea(37.5, 127)).toBe(true);
    expect(inKorea(0, 0)).toBe(false);
  });

  it('행정동 → 법정동 → 구 → 이름만 순서, 짧은 이름은 이름만으로 찾지 않는다', () => {
    expect(photoQueries('불밥 집', { h: '신촌동', b: '대현동', gu: '서대문구' })).toEqual([
      '불밥 집 신촌동',
      '불밥 집 대현동',
      '불밥 집 서대문구',
      '불밥 집',
    ]);
    expect(photoQueries('유', { h: '신촌동', b: '신촌동', gu: '서대문구' })).toEqual(['유 신촌동', '유 서대문구']);
  });

  it('이름이 없거나 좌표가 한국 밖이면 400', async () => {
    expect((await call('name=&lat=37.5&lng=127')).status).toBe(400);
    expect((await call('name=a&lat=0&lng=0')).status).toBe(400);
  });

  it('키가 없으면 사진 없이 200 — 화면은 메뉴 그림으로 남는다', async () => {
    vi.stubEnv('KAKAO_REST_KEY', '');
    const r = await call('name=a&lat=37.5&lng=127');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ thumb: null });
  });

  it('카카오가 실패하면 없음과 구분해 retry 를 붙이고, CDN 은 10분만 기억한다', async () => {
    vi.stubEnv('KAKAO_REST_KEY', 'k');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })));
    const r = await call('name=a&lat=37.5&lng=127');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ thumb: null, retry: true });
    expect(r.headers['Cache-Control']).toBe('public, s-maxage=600');
  });

  it('동 이름을 붙여 검색하고, 넷이 안 차면 다음 지역으로 이어 모으고, 결과는 30일 캐시한다', async () => {
    vi.stubEnv('KAKAO_REST_KEY', 'k');
    const f = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            documents: [
              { region_type: 'B', region_2depth_name: '중구', region_3depth_name: '충무로' },
              { region_type: 'H', region_2depth_name: '중구', region_3depth_name: '명동' },
            ],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ documents: [] })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ documents: [{ thumbnail_url: 'https://t', display_sitename: 'S' }] })),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ thumbnail_url: 'https://u' }] })));
    vi.stubGlobal('fetch', f);
    const r = await call('name=%EA%B0%80%EA%B2%8C&lat=37.5&lng=127');
    expect(decodeURIComponent(String(f.mock.calls[1][0]))).toContain('query=가게 명동');
    // 행정동에서 못 찾으면 법정동으로 한 번 더
    expect(decodeURIComponent(String(f.mock.calls[2][0]))).toContain('query=가게 충무로');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('KakaoAK k');
    // 넷이 안 차서 구(중구)까지 이어 모은다. "가게" 는 두 글자라 이름만 검색은 안 한다.
    expect(decodeURIComponent(String(f.mock.calls[3][0]))).toContain('query=가게 중구');
    expect(f).toHaveBeenCalledTimes(4);
    expect(r.body).toEqual({ thumb: 'https://t', source: 'S', photos: ['https://t', 'https://u'] });
    expect(r.headers['Cache-Control']).toContain('s-maxage=2592000');
  });
});
