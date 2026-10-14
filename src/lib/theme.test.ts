// @vitest-environment jsdom
/** 화면 테마 — 고른 값을 기억하고, 자동이면 기기 설정을 따른다. MODUL 다크는 <html data-theme="dark">. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, resolvedTheme, savedTheme, saveTheme } from './theme';

function systemPrefersDark(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: dark && q.includes('dark'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.removeItem('lunch-app:theme');
  document.documentElement.removeAttribute('data-theme');
});

describe('화면 테마', () => {
  it('처음엔 자동이고, 자동은 기기 설정을 따른다', () => {
    expect(savedTheme()).toBe('auto');
    systemPrefersDark(true);
    expect(resolvedTheme('auto')).toBe('dark');
    systemPrefersDark(false);
    expect(resolvedTheme('auto')).toBe('light');
  });

  it('어둡게를 고르면 html 에 data-theme 를 붙이고 기억한다', () => {
    systemPrefersDark(false);
    saveTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(savedTheme()).toBe('dark');
  });

  it('자동으로 돌리면 저장값을 지우고, 기기가 밝으면 data-theme 를 뗀다', () => {
    systemPrefersDark(false);
    saveTheme('dark');
    saveTheme('auto');
    expect(localStorage.getItem('lunch-app:theme')).toBeNull();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('밝게를 고르면 기기가 어두워도 밝게', () => {
    systemPrefersDark(true);
    applyTheme('light');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
