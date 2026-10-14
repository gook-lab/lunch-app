// @vitest-environment jsdom
/**
 * 핀볼 공 개수 알림 — 한 곳에서 한 문장만(10/15 리뷰).
 * 줄마다 aria-live 가 있어 "모두 3개" 를 누르면 일곱 줄이 한꺼번에 읽혔다.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Place } from '../../lib/candidates';
import { Pinball } from './Pinball';

afterEach(cleanup);
beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'),
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

const places: Place[] = ['할머니 김치찌개', '라멘집', '분식집'].map((name, i) => ({
  id: `p${i}`, name, category: '한식', lat: 0, lng: 0, walkMin: 5, kakaoPlaceId: `k${i}`, active: true, createdBy: 't',
}));

function Harness() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  return (
    <Pinball
      candidates={places}
      winnerIndex={null}
      spinning={false}
      run={0}
      onSpinEnd={() => {}}
      balls={places.map((p) => counts[p.id] ?? 1)}
      onBallCounts={(update) => setCounts(update)}
    />
  );
}

describe('핀볼 공 개수 알림', () => {
  it('aria-live 는 목록 밖 한 곳뿐이고, 마지막 바뀐 것만 문장으로 읽는다', () => {
    const { container } = render(<Harness />);
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    const status = container.querySelectorAll('.pinball__ballList [role="status"]');
    expect(status).toHaveLength(0);
    const live = screen.getAllByRole('status').filter((el) => el.classList.contains('sr-only'));
    expect(live).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: '할머니 김치찌개 공 하나 더' }));
    fireEvent.click(screen.getByRole('button', { name: '할머니 김치찌개 공 하나 더' }));
    // 3 / (3 + 1 + 1) = 60%
    expect(live[0].textContent).toBe('할머니 김치찌개 공 3개, 60%');

    fireEvent.click(screen.getByRole('button', { name: '모두 2개' }));
    expect(live[0].textContent).toBe('모든 가게 공 2개');
  });
});
