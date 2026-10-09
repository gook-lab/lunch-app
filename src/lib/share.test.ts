// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharePlace, shareText } from './share';

const place = { name: '천수냉면', category: '면', walkMin: 3 };

afterEach(() => vi.unstubAllGlobals());

describe('shareText', () => {
  it('가게 이름·카테고리·도보 시간과 링크 한 줄', () => {
    expect(shareText(place, 'http://x')).toBe('🍱 오늘 점심은 천수냉면 (면 · 도보 3분)\nhttp://x');
  });
});

describe('sharePlace', () => {
  it('공유 시트가 없으면 클립보드로 복사한다', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    expect(await sharePlace('글')).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('글');
  });

  it('클립보드가 막혀 있으면 옛 복사로 한 번 더, 그것도 안 되면 실패', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    const exec = vi.fn(() => true);
    Object.defineProperty(document, 'execCommand', { value: exec, configurable: true });
    expect(await sharePlace('글')).toBe('copied');
    expect(exec).toHaveBeenCalledWith('copy');
    exec.mockReturnValue(false);
    expect(await sharePlace('글')).toBe('failed');
  });
});
