// @vitest-environment jsdom
/** 카테고리 고르기 — 메뉴를 먼저, 세부는 골라도 안 골라도 된다. 값은 저장할 문자열 하나. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CategoryPicker } from './CategoryPicker';

afterEach(cleanup);

describe('CategoryPicker', () => {
  it('아무것도 안 골랐으면 세부 줄이 없다', () => {
    render(<CategoryPicker value={null} onPick={() => {}} />);
    expect(screen.getByRole('group', { name: '메뉴' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: /세부/ })).toBeNull();
  });

  it('세부 값이면 그 메뉴와 세부가 켜져 있고, 세부를 끄면 메뉴만 남긴다', () => {
    const onPick = vi.fn();
    render(<CategoryPicker value="라멘·우동" onPick={onPick} />);
    const menus = screen.getByRole('group', { name: '메뉴' });
    expect(within(menus).getByRole('button', { name: '면' }).getAttribute('aria-pressed')).toBe('true');
    const subs = screen.getByRole('group', { name: '면 세부' });
    fireEvent.click(within(subs).getByRole('button', { name: '라멘·우동' }));
    expect(onPick).toHaveBeenCalledWith('면');
  });

  it('예전 값("일식")도 메뉴로 읽어 켠다', () => {
    render(<CategoryPicker value="일식" onPick={() => {}} />);
    expect(
      within(screen.getByRole('group', { name: '메뉴' }))
        .getByRole('button', { name: '밥' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
