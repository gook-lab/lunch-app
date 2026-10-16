import { describe, expect, it } from 'vitest';
import { shouldShowRatePrompt } from './promptVisibility';

describe('초기 안내와 별점 요청 순서', () => {
  it('이 세션에서 첫 안내를 보여 줬다면 별점 요청을 다음 방문으로 미룬다', () => {
    expect(shouldShowRatePrompt(true, false)).toBe(false);
  });

  it('안내를 다시 연 동안만 별점 요청을 숨긴다', () => {
    expect(shouldShowRatePrompt(false, true)).toBe(false);
    expect(shouldShowRatePrompt(false, false)).toBe(true);
  });
});
