// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

afterEach(cleanup);
import { PlaceList } from './PlaceList';
import type { Place } from '../lib/candidates';
import { updatePlace } from '../services/lunch';

vi.mock('../services/lunch', () => ({ updatePlace: vi.fn(async () => {}) }));

const place = (id: string, name: string): Place => ({
  id, name, category: '한식', lat: 37.56, lng: 126.97, walkMin: 5, kakaoPlaceId: id, active: true, createdBy: 'u',
});

describe('최근 다녀온 곳', () => {
  it('최근 방문이 위에서부터, 오늘·어제·N일 전으로 나온다. "지도" 는 그 가게로 간다', () => {
    const onShowOnMap = vi.fn();
    render(
      <PlaceList
        places={[place('a', '가집'), place('b', '나집')]}
        visits={[{ id: '20261006', placeId: 'b' }, { id: '20261009', placeId: 'a' }, { id: '20261008', placeId: 'b' }]}
        today="20261009"
        onChanged={() => {}}
        excludeRecent
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
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={() => {}} excludeRecent />);
    expect(screen.queryByRole('region', { name: /최근 다녀온 곳/ })).toBeNull();
  });
});

describe('끄기 실패', () => {
  it('저장이 실패하면 알려 주고 목록을 다시 읽지 않는다', async () => {
    vi.mocked(updatePlace).mockRejectedValueOnce(new Error('denied'));
    const onChanged = vi.fn();
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={onChanged} excludeRecent />);
    fireEvent.click(screen.getByRole('button', { name: '끄기' }));
    expect((await screen.findByRole('alert')).textContent).toBe('가집을 끄지 못했어요. 잠시 뒤 다시 해 주세요.');
    expect(onChanged).not.toHaveBeenCalled();
  });
});
