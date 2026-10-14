import { afterEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error — 서버 함수는 JS(Vercel). 타입 없이 동작만 확인한다.
import handler, { inKorea, photoQuery, pickPhoto } from '../../../api/photo.js';

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
    expect(pickPhoto([{ thumbnail_url: 'http://x' }, { thumbnail_url: 'https://y', display_sitename: '블로그' }])).toEqual({
      thumb: 'https://y',
      source: '블로그',
    });
    expect(pickPhoto([])).toBeNull();
    expect(inKorea(37.5, 127)).toBe(true);
    expect(inKorea(0, 0)).toBe(false);
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

  it('동 이름을 붙여 검색하고 결과를 30일 캐시한다', async () => {
    vi.stubEnv('KAKAO_REST_KEY', 'k');
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ region_type: 'B' }, { region_type: 'H', region_3depth_name: '명동' }] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ documents: [{ thumbnail_url: 'https://t', display_sitename: 'S' }] })));
    vi.stubGlobal('fetch', f);
    const r = await call('name=%EA%B0%80%EA%B2%8C&lat=37.5&lng=127');
    expect(decodeURIComponent(String(f.mock.calls[1][0]))).toContain('query=가게 명동');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('KakaoAK k');
    expect(r.body).toEqual({ thumb: 'https://t', source: 'S' });
    expect(r.headers['Cache-Control']).toContain('s-maxage=2592000');
  });
});
