// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharePlace, shareMessage, type ShareMessage } from './share';

const place = { name: '천수냉면', category: '면', walkMin: 3, lat: 37.5, lng: 126.9, kakaoPlaceId: '26338954' };
const msg = (text: string): ShareMessage => ({ text, sheet: { title: '오늘 점심', text, url: 'http://x' } });

afterEach(() => vi.unstubAllGlobals());

describe('shareMessage', () => {
  it('팀용은 가게 이름·카테고리·도보 시간, 카카오맵 가게 링크, 앱 주소를 함께 보낸다', () => {
    const m = shareMessage(place, 'http://x');
    expect(m.text).toBe('🍱 오늘 점심은 천수냉면 (면 · 도보 3분)\n가게: https://place.map.kakao.com/26338954\nhttp://x');
    expect(m.sheet).toEqual({
      title: '오늘 점심',
      text: '🍱 오늘 점심은 천수냉면 (면 · 도보 3분)\n가게: https://place.map.kakao.com/26338954',
      url: 'http://x',
    });
  });

  it('데모는 앱 주소를 빼고 가게 링크만 — 받은 사람 브라우저엔 데모 가게가 없다', () => {
    const m = shareMessage({ ...place, kakaoPlaceId: '' }, null);
    expect(m.text).not.toContain('http://x');
    expect(m.sheet.url).toBe('https://map.kakao.com/link/map/%EC%B2%9C%EC%88%98%EB%83%89%EB%A9%B4,37.5,126.9');
    expect(m.text.endsWith(m.sheet.url)).toBe(true);
  });
});

describe('sharePlace', () => {
  it('공유 시트가 없으면 클립보드로 복사한다', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await sharePlace(msg('글'))).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('글');
  });

  it('클립보드가 막혀 있으면 옛 복사로 한 번 더, 그것도 안 되면 실패', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    expect(await sharePlace(msg('글'))).toBe('copied');
    expect(exec).toHaveBeenCalledWith('copy');
    exec.mockReturnValue(false);
    expect(await sharePlace(msg('글'))).toBe('failed');
  });
});
