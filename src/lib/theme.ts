/**
 * 화면 테마 — 자동(기기 설정 따름)·밝게·어둡게.
 * MODUL 은 <html data-theme="dark"> 로 다크 토큰을 켠다. 고른 값은 이 브라우저에만 남는다.
 */
export type ThemeMode = 'auto' | 'light' | 'dark';

const KEY = 'lunch-app:theme';

export function savedTheme(): ThemeMode {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const systemDark = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** 지금 실제로 쓰는 테마. */
export function resolvedTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'auto' ? (systemDark() ? 'dark' : 'light') : mode;
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  const dark = resolvedTheme(mode) === 'dark';
  if (dark) root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  root.style.colorScheme = dark ? 'dark' : 'light';
}

export function saveTheme(mode: ThemeMode): void {
  try {
    if (mode === 'auto') window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, mode);
  } catch {
    // 사생활 보호 모드 — 이번 방문 동안만 적용된다.
  }
  applyTheme(mode);
}

/** 첫 그리기 전에 한 번. 자동이면 기기 설정이 바뀔 때 따라간다. */
export function initTheme(): void {
  applyTheme(savedTheme());
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (savedTheme() === 'auto') applyTheme('auto');
  });
}
