// @vitest-environment jsdom
/**
 * 사진 줄 자리 잡기 — 사진이 있는지 아직 모르는 가게는 한 줄 자리를 먼저 비워 둔다.
 * 지도 카드·결과 모달은 같은 칸에서 가게만 바꿔 그린다. 자리 잡기가 첫 가게 값에 묶이면
 * 늦게 온 줄이 아래를 다시 밀었다(코드 리뷰 재현).
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../lib/candidates';
import { PlacePhotoStrip } from './PlaceThumb';

const place = (id: string) =>
  ({ id, name: id, lat: 37.5, lng: 127, category: '한식', kakaoPlaceId: `k${id}`, active: true, createdBy: 't', walkMin: 5 }) as Place;

let respond: (r: Response) => void = () => {};
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((r) => { respond = r; })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

const rows = (c: HTMLElement) => c.querySelectorAll('li').length;

describe('사진 줄 자리 잡기', () => {
  it('사진 없는 가게에서 아직 모르는 가게로 바꾸면 그 가게 몫의 자리를 새로 잡는다', async () => {
    // A 는 "사진 없음" 으로 기억돼 있다.
    localStorage.setItem('lunch-app:photo5:A:A', JSON.stringify({ at: Date.now(), photo: null }));
    const r = render(<PlacePhotoStrip place={place('A')} />);
    expect(rows(r.container)).toBe(0);

    r.rerender(<PlacePhotoStrip place={place('B')} />);
    expect(rows(r.container)).toBe(3);
    await act(async () => {
      respond(new Response(JSON.stringify({ thumb: 'a', photos: ['a', 'b', 'c', 'd'] }), { headers: { 'content-type': 'application/json' } }));
      await new Promise((x) => setTimeout(x, 0));
    });
    expect(rows(r.container)).toBe(3);
  });
});
