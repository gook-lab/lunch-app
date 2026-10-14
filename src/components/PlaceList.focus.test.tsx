// @vitest-environment jsdom
/**
 * 목록 동작 뒤 초점과 최근 방문 머리말(10/15 리뷰).
 * 빼기·되돌리기 뒤 그 줄이 다른 묶음으로 옮겨 가면 초점이 <body> 로 떨어졌다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PlaceList } from './PlaceList';
import type { Place } from '../lib/candidates';

vi.mock('../services/lunch', () => ({ updatePlace: vi.fn(async () => {}) }));
afterEach(cleanup);

const NONE = { recentlyVisitedCount: 0, releasedCount: 0, excludedRecent: true };
const place = (id: string, name: string, walkMin = 5): Place => ({
  id, name, category: '밥', lat: 37.56, lng: 126.97, walkMin, kakaoPlaceId: id, active: true, createdBy: 'u',
});
const three = () => [place('a', '가집', 5), place('b', '나집', 6), place('c', '다집', 7)];
const frame = () => new Promise((done) => requestAnimationFrame(() => done(null)));

function hide(name: string) {
  fireEvent.keyDown(screen.getByRole('button', { name: `${name} 더 보기` }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: '잠시 빼기' }));
}

describe('빼기·되돌리기 뒤 초점', () => {
  it('뺀 줄 바로 아래 줄의 ⋯ 단추로 간다. 다시 읽어 줄이 옮겨 가도 그대로다', async () => {
    const places = three();
    const r = render(<PlaceList places={places} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    hide('가집');
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '나집 더 보기' })));
    // 다시 읽기가 끝나 가집이 "잠시 뺀 가게" 로 옮겨 간다.
    r.rerender(
      <PlaceList
        places={places.map((p) => (p.id === 'a' ? { ...p, active: false } : p))}
        visits={[]}
        today="20261009"
        onChanged={() => {}}
        recent={NONE}
      />,
    );
    await frame();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '나집 더 보기' }));
  });

  it('맨 끝 줄이면 바로 위 줄로 간다', async () => {
    render(<PlaceList places={three()} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    hide('다집');
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '나집 더 보기' })));
  });

  it('혼자 남은 줄이면 목록 제목으로 간다', async () => {
    render(<PlaceList places={[place('a', '가집')]} visits={[]} today="20261009" onChanged={() => {}} recent={NONE} />);
    hide('가집');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: /넣어 둔 가게/ })),
    );
  });
});

describe('최근 방문 머리말', () => {
  it('목록이 따로 세지 않고 App 이 넘긴 후보 산출 숫자를 쓴다', () => {
    // 최근 방문 기록은 둘이지만 하나는 5곳을 채우려고 다시 넣었다. 그건 App 만 안다.
    render(
      <PlaceList
        places={[place('a', '가집'), place('b', '나집')]}
        visits={[{ id: '20261008', placeId: 'a' }, { id: '20261007', placeId: 'b' }]}
        today="20261009"
        onChanged={() => {}}
        recent={{ recentlyVisitedCount: 2, releasedCount: 1, excludedRecent: true }}
      />,
    );
    expect(screen.getByText('최근 1주에 간 1곳은 오늘 고르지 않아요 · 1곳은 다시 넣었어요')).toBeTruthy();
  });
});
