// @vitest-environment jsdom
/** 고를 가게 칩 — 많으면 접고 "N곳 더 보기" 로 편다. 뽑힌 곳은 접혀 있어도 보인다. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CandidateChips, CHIPS_FOLDED } from './CandidateChips';
import type { CandidateResult, Place } from '../lib/candidates';

afterEach(cleanup);

const places = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `가게${i}`, category: '밥', walkMin: 3 }) as Place);
const result = { candidates: places, released: [] } as unknown as CandidateResult;

describe('CandidateChips', () => {
  it(`${CHIPS_FOLDED}곳만 보이고, 더 보기로 전부 편다`, () => {
    render(<CandidateChips result={result} />);
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('cands__item'))).toHaveLength(CHIPS_FOLDED);
    fireEvent.click(screen.getByRole('button', { name: '4곳 더 보기' }));
    expect(screen.getAllByRole('listitem').filter((li) => li.className.includes('cands__item'))).toHaveLength(12);
    expect(screen.getByRole('button', { name: '접기' })).toBeTruthy();
  });

  it('뽑힌 곳이 접힌 쪽에 있어도 보인다', () => {
    render(<CandidateChips result={result} winnerId="p11" />);
    expect(screen.getByText('가게11')).toBeTruthy();
    expect(screen.getByRole('button', { name: '3곳 더 보기' })).toBeTruthy();
  });
});
