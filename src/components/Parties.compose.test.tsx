// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Parties, type PartyActions } from './Parties';

afterEach(cleanup);
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

const actions: PartyActions = {
  open: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  setStatus: vi.fn(),
  cancel: vi.fn(),
  saveGame: vi.fn(),
};

describe('결과에서 점심 팟 만들기', () => {
  it('새 요청이 들어오면 팟 만들기 폼을 연다', () => {
    const props = {
      day: '20261016' as const,
      parties: [],
      myUid: 'me',
      places: [],
      candidatesFor: () => [],
      preferredMode: 'wheel' as const,
      actions,
    };
    const view = render(<Parties {...props} composeRequest={0} />);
    expect(view.container.querySelector('.party-form')).toBeNull();
    view.rerender(<Parties {...props} composeRequest={1} />);
    expect(view.container.querySelector('.party-form')).toBeTruthy();
  });
});
