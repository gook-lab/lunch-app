// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askNotifyOnce, notifyIfHidden } from './notify';

type Perm = 'default' | 'granted' | 'denied';
const shown: { title: string; body?: string; tag?: string }[] = [];
let permission: Perm = 'default';
const requestPermission = vi.fn(async () => permission);

class FakeNotification {
  static get permission() {
    return permission;
  }
  static requestPermission = requestPermission;
  onclick: (() => void) | null = null;
  constructor(title: string, opts: { body?: string; tag?: string }) {
    shown.push({ title, ...opts });
  }
  close() {}
}

const setHidden = (hidden: boolean) =>
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });

describe('팟 브라우저 알림', () => {
  beforeEach(() => {
    vi.stubGlobal('Notification', FakeNotification);
    localStorage.clear();
    shown.length = 0;
    requestPermission.mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setHidden(false);
  });

  it('허락은 한 번만 묻는다', () => {
    permission = 'default';
    askNotifyOnce();
    askNotifyOnce();
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  it('이미 정했으면 묻지 않는다', () => {
    permission = 'denied';
    askNotifyOnce();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('탭이 가려져 있고 허락했을 때만 띄운다', () => {
    permission = 'granted';
    setHidden(false);
    notifyIfHidden([{ tag: 'depart-1', text: '⏰ 면 팟이 곧 출발해요' }]);
    expect(shown).toHaveLength(0);
    setHidden(true);
    notifyIfHidden([{ tag: 'depart-1', text: '⏰ 면 팟이 곧 출발해요' }]);
    expect(shown).toEqual([{ title: '오늘 점심', body: '⏰ 면 팟이 곧 출발해요', tag: 'depart-1', icon: '/favicon.svg' }]);
  });

  it('허락하지 않았으면 가려져 있어도 안 띄운다', () => {
    permission = 'denied';
    setHidden(true);
    notifyIfHidden([{ tag: 'x', text: 'x' }]);
    expect(shown).toHaveLength(0);
  });
});
