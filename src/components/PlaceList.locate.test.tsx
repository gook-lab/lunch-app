// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlaceList } from './PlaceList';
import type { Place } from '../lib/candidates';
import { updatePlace } from '../services/lunch';
import { searchPlacesNear } from '../services/placeSearch';

afterEach(cleanup);
vi.mock('../services/lunch', () => ({ updatePlace: vi.fn(async () => {}) }));
vi.mock('../services/placeSearch', () => ({ searchPlacesNear: vi.fn() }));

const NONE = { recentlyVisitedCount: 0, releasedCount: 0, excludedRecent: true };
const place: Place = {
  id: 'a', name: '가집', category: '밥', lat: 37.56, lng: 126.97, walkMin: 5, kakaoPlaceId: 'a', active: true, createdBy: 'u',
};

function openEdit() {
  render(<PlaceList places={[place]} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
  fireEvent.keyDown(screen.getAllByRole('button', { name: /더 보기$/ })[0], { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: '고치기' }));
}

describe('고치기 — 위치', () => {
  it('좌표 칸은 고급 안에 접혀 있고, 이름으로 찾아 고른 곳의 좌표를 저장한다', async () => {
    vi.mocked(searchPlacesNear).mockResolvedValueOnce([
      { id: 'k1', name: '가집 본점', address: '서울 중구 세종대로 1', lat: 37.5651, lng: 126.9781 },
    ]);
    openEdit();
    expect((screen.getByText('좌표 직접 넣기 (고급)').closest('details') as HTMLDetailsElement).open).toBe(false);
    expect((screen.getByRole('textbox', { name: '가게 이름·주소로 찾기' }) as HTMLInputElement).value).toBe('가집');
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));
    fireEvent.click(await screen.findByRole('button', { name: /가집 본점/ }));
    expect(screen.getByText(/가집 본점 · 서울 중구 세종대로 1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '저장' }));
    await vi.waitFor(() =>
      expect(updatePlace).toHaveBeenCalledWith('a', expect.objectContaining({ lat: 37.5651, lng: 126.9781 })),
    );
  });

  it('검색을 못 쓰는 곳이면 알리고 고급 칸을 펼친다', async () => {
    vi.mocked(searchPlacesNear).mockRejectedValueOnce(new Error('no-key'));
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));
    expect((await screen.findByRole('status')).textContent).toMatch(/검색을 쓸 수 없어요/);
    expect((screen.getByText('좌표 직접 넣기 (고급)').closest('details') as HTMLDetailsElement).open).toBe(true);
  });
});
