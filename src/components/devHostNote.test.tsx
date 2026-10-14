import { describe, expect, it } from 'vitest';
import { isDevHost } from '../lib/devHost';

describe('isDevHost', () => {
  it('숫자 IP 로 연 개발 서버만 안내한다', () => {
    expect(isDevHost('20.0.10.34')).toBe(true);
    expect(isDevHost('localhost')).toBe(false);
    expect(isDevHost('lunch-app-team.vercel.app')).toBe(false);
  });
});
