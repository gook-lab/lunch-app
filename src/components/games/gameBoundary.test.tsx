// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GameBoundary } from './GameBoundary';

function Boom({ fail }: { fail: boolean }) {
  if (fail) throw new Error('boom');
  return <p>게임판</p>;
}

describe('GameBoundary', () => {
  it('게임이 터지면 게임판만 안내로 바꾸고, 판이 바뀌면 다시 그린다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { rerender } = render(
      <GameBoundary resetKey="a">
        <Boom fail />
      </GameBoundary>,
    );
    expect(screen.getByRole('alert').textContent).toContain('문제가 생겼어요');
    rerender(
      <GameBoundary resetKey="b">
        <Boom fail={false} />
      </GameBoundary>,
    );
    expect(screen.getByText('게임판')).toBeTruthy();
    spy.mockRestore();
  });
});
