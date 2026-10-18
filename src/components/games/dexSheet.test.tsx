// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DexSheet, type DexGroup } from './DexSheet';

afterEach(cleanup);
// jsdom 엔 dialog.showModal 이 없다(parties.test 와 같은 대역).
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};

const groups: DexGroup[] = [
  {
    id: 'spring',
    label: '봄',
    hint: '아직 못 찾았어요',
    complete: false,
    entries: [
      { id: 'spring-a', icon: '👑', name: '벚꽃 왕관', found: true },
      { id: 'spring-b', icon: '💎', name: '꽃잎 루비', found: false },
    ],
  },
  { id: 'fri', label: '✨ 불금', hint: '금요일에 나와요', complete: true, entries: [{ id: 'fri-a', icon: '👑', name: '불금 왕관', found: true }] },
];

describe('DexSheet', () => {
  it('찾은 칸만 이름이 보이고, 못 찾은 칸은 ? 와 줄마다의 안내를 쓴다', () => {
    render(<DexSheet open onClose={() => {}} title="보물 도감" summary="2개 중 1개" noun="보물" groups={groups} />);
    const spring = screen.getByRole('region', { name: '봄 보물' });
    expect(within(spring).getByText('벚꽃 왕관')).toBeTruthy();
    expect(within(spring).queryByText('꽃잎 루비')).toBeNull();
    expect(within(spring).getByText('아직 못 찾았어요')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: '✨ 불금 보물' })).getByText(/다 모았어요/)).toBeTruthy();
    expect(screen.getByText('2개 중 1개')).toBeTruthy();
  });

  it('닫기 단추와 dialog 닫힘(Esc)이 onClose 를 부른다', () => {
    const onClose = vi.fn();
    const { container } = render(<DexSheet open onClose={onClose} title="낚시 도감" summary="" noun="물고기" groups={groups} />);
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent(container.ownerDocument.querySelector('dialog')!, new Event('close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
