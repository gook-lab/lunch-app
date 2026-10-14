import { describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, retryLoad } from './retryLoad';

describe('불러오기 실패 — 다시 시도', () => {
  it('청크를 못 받은 오류는 페이지를 새로 연다(같은 페이지에선 실패한 import 가 남는다)', () => {
    const reload = vi.fn();
    const hard = vi.fn();
    retryLoad(new TypeError('Failed to fetch dynamically imported module: https://x/assets/lunch.firebase-1.js'), reload, hard);
    expect(hard).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('네트워크·로그인 오류는 데이터만 다시 읽는다', () => {
    const reload = vi.fn();
    const hard = vi.fn();
    retryLoad(new Error('Firebase: Error (auth/network-request-failed).'), reload, hard);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(hard).not.toHaveBeenCalled();
  });
});
