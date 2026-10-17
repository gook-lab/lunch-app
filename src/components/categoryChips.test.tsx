// @vitest-environment jsdom
/** 카테고리 칩 — 켜진 가게가 있는 카테고리만, 전체는 조건을 비운다. */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Place } from '../lib/candidates';
import { CategoryChips } from './CategoryChips';

afterEach(cleanup);

const place = (id: string, category: string, active = true, sub: string | null = null): Place => ({
  id,
  name: id,
  category,
  sub,
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
        places={[place('a', '밥'), place('b', '면'), place('c', '빵·양식', false)]}
        selected={['밥']}
        subs={[]}
        onToggle={onToggle}
        onToggleSub={() => {}}
        onClear={onClear}
        onClearSubs={() => {}}
      />,
    );
    const chips = [...r.container.querySelectorAll('button')];
    expect(chips.map((b) => b.textContent?.replace(/^\S+ /, ''))).toEqual(['전체', '밥', '면']);
    expect(chips[0].getAttribute('aria-pressed')).toBe('false');
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chips[2]);
    expect(onToggle).toHaveBeenCalledWith('면');
    fireEvent.click(chips[0]);
    expect(onClear).toHaveBeenCalled();
  });

  it('카테고리가 하나뿐이면 칩 줄을 안 그린다', () => {
    const r = render(
      <CategoryChips
        places={[place('a', '밥')]}
        selected={[]}
        subs={[]}
        onToggle={() => {}}
        onToggleSub={() => {}}
        onClear={() => {}}
        onClearSubs={() => {}}
      />,
    );
    expect(r.container.querySelector('.catbar')).toBeNull();
  });

  it('메뉴를 하나 고르면 가게가 있는 세부만 둘째 줄에 열린다', () => {
    const onToggleSub = vi.fn();
    const r = render(
      <CategoryChips
        places={[place('a', '면', true, '라멘·우동'), place('b', '면', true, '국수·냉면'), place('c', '밥')]}
        selected={['면']}
        subs={['라멘·우동']}
        onToggle={() => {}}
        onToggleSub={onToggleSub}
        onClear={() => {}}
        onClearSubs={() => {}}
      />,
    );
    const row = r.container.querySelector('.catbar--sub')!;
    const chips = [...row.querySelectorAll('button')];
    expect(chips.map((b) => b.textContent?.replace(/^\S+ /, ''))).toEqual(['전체', '국수·냉면', '라멘·우동']);
    expect(chips[2].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chips[1]);
    expect(onToggleSub).toHaveBeenCalledWith('국수·냉면');
  });
});

describe('메뉴 | 나라 전환', () => {
  const places = [
    place('a', '면', true, '짬뽕·짜장'),
    place('b', '면', true, '라멘·우동'),
    place('c', '밥', true, '국밥·찌개'),
    place('d', '밥', false, '덮밥·초밥'),
  ];

  it('onView 가 없으면 전환이 없다(지도 탭)', () => {
    const r = render(
      <CategoryChips places={places} selected={[]} subs={[]} onToggle={() => {}} onToggleSub={() => {}} onClear={() => {}} onClearSubs={() => {}} />,
    );
    expect(r.queryByRole('group', { name: '나눠 보기' })).toBeNull();
  });

  it('나라로 보면 켜진 가게가 있는 나라만 칩이 되고, 누르면 그 나라를 켜고 끈다', () => {
    const onToggleCuisine = vi.fn();
    const onView = vi.fn();
    const r = render(
      <CategoryChips
        places={places}
        selected={[]}
        subs={[]}
        onToggle={() => {}}
        onToggleSub={() => {}}
        onClear={() => {}}
        onClearSubs={() => {}}
        view="cuisine"
        onView={onView}
        cuisines={['중식']}
        onToggleCuisine={onToggleCuisine}
      />,
    );
    const group = r.getByRole('group', { name: '나라 고르기' });
    const chips = [...group.querySelectorAll(':scope > button')].map((b) => b.textContent?.replace(/^\S+ /, ''));
    // 덮밥·초밥(일식)은 꺼진 가게라 칩이 없다.
    expect(chips).toEqual(['전체', '한식', '중식', '일식']);
    expect(r.getByRole('button', { name: /중식/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(r.getByRole('button', { name: /한식/ }));
    expect(onToggleCuisine).toHaveBeenCalledWith('한식');
    fireEvent.click(r.getByRole('button', { name: '메뉴' }));
    expect(onView).toHaveBeenCalledWith('menu');
  });
});
