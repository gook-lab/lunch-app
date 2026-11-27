// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotFound, StatusScreen, isKnownPath } from './StatusScreen';

afterEach(cleanup);

describe('공통 상태 화면', () => {
  it('루트와 index.html 만 앱 주소다', () => {
    expect(isKnownPath('/')).toBe(true);
    expect(isKnownPath('/index.html')).toBe(true);
    expect(isKnownPath('/menu')).toBe(false);
    expect(isKnownPath('/a/b')).toBe(false);
  });

  it('없는 주소는 제목 · 받은 경로 · 처음 화면으로 가는 링크를 보여 준다', () => {
    window.history.pushState({}, '', '/menu/%EC%98%A4%EB%8A%98');
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: '이 주소엔 점심이 없어요' })).toBeTruthy();
    expect(screen.getByText('/menu/오늘')).toBeTruthy();
    expect(screen.getByRole('link', { name: '처음 화면으로' }).getAttribute('href')).toBe('/');
    window.history.pushState({}, '', '/');
  });

  it('없는 주소는 응답이 200 이라 noindex 와 탭 제목으로 알리고, 떠나면 되돌린다', () => {
    document.title = '오늘 점심';
    const { unmount } = render(<NotFound />);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
    expect(document.title).toBe('없는 주소 · 오늘 점심');
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    expect(document.title).toBe('오늘 점심');
  });

  it('없는 주소도 index.html 의 로딩 화면을 걷는다', async () => {
    let done = 0;
    window.__lunchBoot = { done: () => void done++ };
    render(<NotFound />);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(done).toBe(1);
    delete window.__lunchBoot;
  });

  it('실패는 alert 로 읽히고 오류 원문을 따로 보여 준다', () => {
    render(<StatusScreen role="alert" art="!" title="목록을 불러오지 못했어요" code="FirebaseError: permission-denied" lines={['다시 시도해 주세요.']} />);
    expect(screen.getByRole('alert').textContent).toContain('permission-denied');
  });
});
