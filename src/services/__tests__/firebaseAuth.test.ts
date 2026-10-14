// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// getAuth 는 팝업·리디렉트용 gapi 와 auth iframe 을 받은 뒤에야 익명 로그인을 보냈다(Slow 4G 에서 1초, 10/15).
// 익명 로그인만 쓰니 리졸버 없이 초기화하는지, 저장 위치는 getAuth 기본값 그대로인지 지킨다.
const auth = vi.hoisted(() => ({
  initializeAuth: vi.fn((..._args: unknown[]) => ({})),
  getAuth: vi.fn(() => ({})),
  signInAnonymously: vi.fn(() => new Promise(() => {})),
  onAuthStateChanged: vi.fn(() => () => {}),
  connectAuthEmulator: vi.fn(),
  indexedDBLocalPersistence: 'idb',
  browserLocalPersistence: 'local',
  browserSessionPersistence: 'session',
}));
vi.mock('firebase/auth', () => auth);
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(() => ({})), connectFirestoreEmulator: vi.fn() }));

describe('Firebase 익명 로그인 초기화', () => {
  it('popupRedirectResolver 없이 initializeAuth 로 만들고, 저장 위치는 getAuth 기본값과 같다', async () => {
    await import('../firebase');
    expect(auth.getAuth).not.toHaveBeenCalled();
    expect(auth.initializeAuth).toHaveBeenCalledTimes(1);
    const deps = auth.initializeAuth.mock.calls[0][1] as Record<string, unknown>;
    expect(deps).not.toHaveProperty('popupRedirectResolver');
    expect(deps.persistence).toEqual(['idb', 'local', 'session']);
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);
  });
});
