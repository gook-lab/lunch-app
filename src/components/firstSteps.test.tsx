// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FirstSteps } from './FirstSteps';

afterEach(cleanup);

describe('첫 게임까지 세 칸', () => {
  it('회사 위치를 정하기 전에는 첫 칸이 지금 단계다', () => {
    render(<FirstSteps officeSaved={false} />);
    const steps = screen.getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0].getAttribute('aria-current')).toBe('step');
    expect(steps[0].textContent).toContain('회사 위치 정하기');
    expect(screen.queryByText('(끝냄)', { exact: false })).toBeNull();
  });

  it('회사 위치를 정했으면 첫 칸은 끝냄, 가게 넣기가 지금 단계다', () => {
    render(<FirstSteps officeSaved />);
    const steps = screen.getAllByRole('listitem');
    expect(steps[0].textContent).toContain('(끝냄)');
    expect(steps[1].getAttribute('aria-current')).toBe('step');
    expect(steps[2].getAttribute('aria-current')).toBeNull();
  });
});
