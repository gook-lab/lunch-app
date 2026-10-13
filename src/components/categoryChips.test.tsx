// @vitest-environment jsdom
/** 카테고리 칩 — 켜진 가게가 있는 카테고리만, 전체는 조건을 비운다. */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../lib/candidates';
import { CategoryChips } from './CategoryChips';

afterEach(cleanup);

const place = (id: string, category: string, active = true): Place => ({
  id,
  name: id,
  category,
  lat: 0,
  lng: 0,
  walkMin: 3,
  kakaoPlaceId: '',
  active,
  createdBy: 'x',
});

describe('카테고리 칩', () => {
  it('켜진 가게가 있는 카테고리만 칩이 되고, 누르면 그 카테고리를 켜고 끈다', () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    const r = render(
      <CategoryChips
        places={[place('a', '한식'), place('b', '중식'), place('c', '양식', false)]}
        selected={['한식']}
        onToggle={onToggle}
        onClear={onClear}
      />,
    );
    const chips = [...r.container.querySelectorAll('button')];
    expect(chips.map((b) => b.textContent?.replace(/^\S+ /, ''))).toEqual(['전체', '한식', '중식']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chips[2]);
    expect(onToggle).toHaveBeenCalledWith('중식');
    fireEvent.click(chips[0]);
    expect(onClear).toHaveBeenCalled();
  });

  it('카테고리가 하나뿐이면 칩 줄을 안 그린다', () => {
    const r = render(
      <CategoryChips places={[place('a', '한식')]} selected={[]} onToggle={() => {}} onClear={() => {}} />,
    );
    expect(r.container.querySelector('.catbar')).toBeNull();
  });
});
