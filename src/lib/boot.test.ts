// @vitest-environment jsdom
/**
 * index.html 의 인라인 로딩 화면(#boot) 계약. 그 스크립트를 jsdom 에서 그대로 돌려 본다.
 * - 15초가 지나면 느린 망 안내와 다시 불러오기, 진입 스크립트를 못 받으면 실패 안내
 * - 앱이 첫 화면을 그리면(hideBoot) 걷히고, 그 뒤엔 안내가 다시 뜨지 않는다
 * - 웹 글꼴 이름을 쓰지 않는다(쓰면 글꼴 파일이 index.js 와 대역폭을 나눠 첫 화면이 늦었다, 11/27)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hideBoot } from './boot';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)![1];
const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
const markup = html.match(/<div id="boot"[\s\S]*?\n {4}<\/div>/)![0];

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = markup;
  new Function(script)();
  document.dispatchEvent(new Event('DOMContentLoaded'));
});

afterEach(() => {
  vi.useRealTimers();
  delete window.__lunchBoot;
  document.body.innerHTML = '';
});

const boot = () => document.getElementById('boot');

describe('index.html 로딩 화면', () => {
  it('앱 이름과 진행 고리를 JS 없이도 담고, JS 꺼짐 안내가 있다', () => {
    expect(boot()?.textContent).toContain('오늘 점심');
    expect(markup).toContain('boot__ring');
    expect(markup).toMatch(/<noscript>[\s\S]*자바스크립트를 켜면/);
  });

  it('15초가 지나면 느린 망 안내와 다시 불러오기 단추를 보인다', () => {
    vi.advanceTimersByTime(14_999);
    expect(boot()?.className).toBe('');
    vi.advanceTimersByTime(1);
    expect(boot()?.className).toBe('boot--slow');
    expect(boot()?.querySelector('.boot__helpText')?.textContent).toContain('연결이 느려요');
    expect(boot()?.querySelector('button')?.textContent).toBe('다시 불러오기');
  });

  it('진입 스크립트를 못 받으면 실패 안내로 바꾼다', () => {
    const entry = document.createElement('script');
    entry.type = 'module';
    document.body.appendChild(entry);
    entry.dispatchEvent(new Event('error'));
    expect(boot()?.className).toBe('boot--fail');
    expect(boot()?.querySelector('.boot__helpText')?.textContent).toContain('앱 파일을 받지 못했어요');
  });

  it('앱이 첫 화면을 그리면 걷히고, 그 뒤엔 느린 망 안내가 뜨지 않는다', () => {
    hideBoot();
    vi.advanceTimersByTime(16); // 다음 프레임
    expect(boot()?.className).toBe('boot--out');
    vi.advanceTimersByTime(300);
    expect(boot()).toBeNull();
    vi.advanceTimersByTime(20_000);
    expect(document.querySelector('.boot--slow')).toBeNull();
  });

  it('웹 글꼴(Archivo · 나눔고딕코딩) 이름을 쓰지 않는다', () => {
    expect(style).not.toMatch(/Archivo|Nanum/);
  });

  it('저장한 테마 · 계절을 첫 그리기 전에 html 에 건다', () => {
    localStorage.setItem('lunch-app:theme', 'dark');
    localStorage.setItem('lunch-app:season', 'winter');
    new Function(script)();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-season')).toBe('winter');
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-season');
  });
});
