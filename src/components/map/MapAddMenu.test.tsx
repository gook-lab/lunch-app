// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapAddMenu } from './MapAddMenu';

afterEach(cleanup);

describe('지도 가게 추가 메뉴 초점', () => {
  it('열리면 닫기 단추에 초점을 두고, 닫히면 지도로 돌려보낸다', () => {
    const host = document.createElement('div');
    const map = document.createElement('div');
    map.tabIndex = -1;
    document.body.append(host, map);

    const view = render(
      <MapAddMenu
        host={host}
        hits={[]}
        onPick={vi.fn()}
        onGoTo={vi.fn()}
        onDirect={vi.fn()}
        onClose={vi.fn()}
        returnFocusRef={{ current: map }}
      />,
    );

    expect(document.activeElement).toBe(view.getByRole('button', { name: '닫기' }));
    view.unmount();
    expect(document.activeElement).toBe(map);
    host.remove();
    map.remove();
  });
});
