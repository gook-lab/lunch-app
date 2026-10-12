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

  it('없는 주소는 제목과 오늘 점심으로 가는 링크를 보여 준다', () => {
    render(<NotFound />);
    expect(screen.getByRole('heading', { name: '이런 주소는 없어요' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '오늘 점심으로 가기' }).getAttribute('href')).toBe('/');
  });

  it('실패는 alert 로 읽히고 오류 원문을 따로 보여 준다', () => {
    render(<StatusScreen role="alert" art="!" title="목록을 불러오지 못했어요" code="FirebaseError: permission-denied" lines={['다시 시도해 주세요.']} />);
    expect(screen.getByRole('alert').textContent).toContain('permission-denied');
  });
});
