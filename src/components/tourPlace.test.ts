import { describe, expect, it } from 'vitest';
import { placeCard } from './Tour';

const view = { width: 1440, height: 900 };
const card = { width: 360, height: 200 };
const inside = (p: { top: number; left: number }) =>
  p.top >= 12 && p.left >= 12 && p.top + card.height <= view.height - 12 && p.left + card.width <= view.width - 12;

describe('안내 카드 자리', () => {
  it('아래가 넉넉하면 아래', () => {
    const p = placeCard({ top: 100, left: 600, width: 200, height: 40 }, card, view);
    expect(p.top).toBe(152);
    expect(inside(p)).toBe(true);
  });

  it('아래가 모자라면 위', () => {
    const p = placeCard({ top: 700, left: 600, width: 200, height: 60 }, card, view);
    expect(p.top).toBe(700 - 12 - 200);
  });

  it('화면만큼 긴 왼쪽 레일 — 위·아래 다 모자라면 오른쪽, 화면 밖으로 안 나간다', () => {
    const p = placeCard({ top: 140, left: 40, width: 200, height: 740 }, card, view);
    expect(p.left).toBe(40 + 200 + 12);
    expect(inside(p)).toBe(true);
  });

  it('어디에도 안 들어가면 화면 안 아래에 겹쳐 둔다', () => {
    const small = { width: 390, height: 500 };
    const p = placeCard({ top: 20, left: 10, width: 370, height: 460 }, { width: 358, height: 200 }, small);
    expect(p.top).toBe(500 - 200 - 12);
    expect(p.left).toBeGreaterThanOrEqual(12);
  });
});
