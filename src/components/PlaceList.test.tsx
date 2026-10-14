// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

afterEach(cleanup);
const NONE = { recentlyVisitedCount: 0, releasedCount: 0, excludedRecent: true };
import { PlaceList } from './PlaceList';
import type { Place } from '../lib/candidates';
import { updatePlace } from '../services/lunch';

vi.mock('../services/lunch', () => ({ updatePlace: vi.fn(async () => {}) }));

const place = (id: string, name: string): Place => ({
  id, name, category: '밥', lat: 37.56, lng: 126.97, walkMin: 5, kakaoPlaceId: id, active: true, createdBy: 'u',
});

/** 줄의 ⋯ 메뉴를 연다(Radix 는 키보드 Enter 로도 열린다). */
function openMenu() {
  const trigger = screen.getAllByRole('button', { name: /더 보기$/ })[0];
  fireEvent.keyDown(trigger, { key: 'Enter' });
}

describe('최근 다녀온 곳', () => {
  it('최근 방문이 위에서부터, 오늘·어제·N일 전으로 나온다. "지도" 는 그 가게로 간다', () => {
    const onShowOnMap = vi.fn();
    render(
      <PlaceList
        places={[place('a', '가집'), place('b', '나집')]}
        visits={[{ id: '20261006', placeId: 'b' }, { id: '20261009', placeId: 'a' }, { id: '20261008', placeId: 'b' }]}
        today="20261009"
        onChanged={() => {}}
        recent={NONE}
        onShowOnMap={onShowOnMap}
      />,
    );
    const section = screen.getByRole('region', { name: /최근 다녀온 곳/ });
    const items = within(section).getAllByRole('listitem').map((li) => li.querySelector('.history__when')?.textContent + ' ' + li.querySelector('.history__name')?.textContent);
    expect(items).toEqual(['오늘 가집', '어제 나집', '3일 전 나집']);
    fireEvent.click(within(section).getAllByRole('button', { name: '가집 지도에서 보기' })[0]);
    expect(onShowOnMap).toHaveBeenCalledWith('a');
  });

  it('방문이 없으면 보이지 않는다', () => {
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    expect(screen.queryByRole('region', { name: /최근 다녀온 곳/ })).toBeNull();
  });
});

describe('끄기 실패', () => {
  it('저장이 실패하면 알려 주고 목록을 다시 읽지 않는다', async () => {
    vi.mocked(updatePlace).mockRejectedValueOnce(new Error('denied'));
    const onChanged = vi.fn();
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={onChanged} recent={NONE} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '잠시 빼기' }));
    expect((await screen.findByRole('alert')).textContent).toBe('가집을 빼지 못했어요. 잠시 뒤 다시 해 주세요.');
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('고치기 — 카테고리', () => {
  it('메뉴를 고르고 세부까지 고르면 세부를 저장한다', async () => {
    vi.mocked(updatePlace).mockClear();
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '고치기' }));
    const menus = screen.getByRole('group', { name: '메뉴' });
    expect(within(menus).getByRole('button', { name: '밥' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(menus).getByRole('button', { name: '면' }));
    expect(within(menus).getByRole('button', { name: '면' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(screen.getByRole('group', { name: '면 세부' })).getByRole('button', { name: '라멘·우동' }));
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await vi.waitFor(() =>
      expect(updatePlace).toHaveBeenCalledWith('a', expect.objectContaining({ category: '라멘·우동' })),
    );
  });
});

describe('고치기 — 목록에 없는 옛 카테고리', () => {
  it('아무 칩도 켜지지 않은 채로 시작하고, 고르지 않으면 저장하지 않는다', () => {
    vi.mocked(updatePlace).mockClear();
    render(<PlaceList places={[{ ...place('a', '가집'), category: '국밥' }]} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: '고치기' }));
    const group = screen.getByRole('group', { name: '메뉴' });
    expect(within(group).queryAllByRole('button', { pressed: true })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    expect(screen.getByRole('alert').textContent).toBe('메뉴를 골라 주세요.');
    expect(updatePlace).not.toHaveBeenCalled();
    // 막힌 칸(첫 카테고리 칩)으로 초점이 간다.
    expect(document.activeElement).toBe(within(group).getAllByRole('button')[0]);
  });
});
