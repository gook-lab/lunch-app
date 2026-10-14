// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

// 오프라인으로 열어 익명 로그인이 한 번 실패하면, 예전엔 그 거절된 Promise 를 모두가 계속
// await 해서 연결된 뒤 "다시 시도" 를 눌러도 로그인 요청이 다시 나가지 않았다(10/15 팀 사이트).
const auth = vi.hoisted(() => {
  let listener: ((user: unknown) => void) | null = null;
  let calls = 0;
  return {
    initializeAuth: vi.fn(() => ({})),
    signInAnonymously: vi.fn(() => {
      calls += 1;
      if (calls === 1) return Promise.reject(new Error('Firebase: Error (auth/network-request-failed).'));
      const user = { uid: 'u1' };
      listener?.(user);
      return Promise.resolve({ user });
    }),
    onAuthStateChanged: vi.fn((_auth: unknown, next: (user: unknown) => void) => {
      listener = next;
      return () => {
        if (listener === next) listener = null;
      };
    }),
    connectAuthEmulator: vi.fn(),
    indexedDBLocalPersistence: 'idb',
    browserLocalPersistence: 'local',
    browserSessionPersistence: 'session',
  };
});
vi.mock('firebase/auth', () => auth);
vi.mock('firebase/app', () => ({ initializeApp: vi.fn(() => ({})) }));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(() => ({})), connectFirestoreEmulator: vi.fn() }));

describe('익명 로그인 — 실패한 뒤 다시 시도', () => {
  it('첫 로그인이 실패해도 다음 호출이 로그인을 새로 보내고 붙는다', async () => {
    const { ensureAuth } = await import('../firebase');
    // 모듈을 불러올 때 한 번 시작한 로그인이 실패한다.
    await new Promise((r) => setTimeout(r, 0));
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(1);

    // 연결된 뒤 다시 시도 — 새 요청이 나가고 uid 를 받는다.
    await expect(ensureAuth()).resolves.toEqual({ uid: 'u1' });
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(2);

    // 붙은 뒤에는 더 보내지 않는다.
    await ensureAuth();
    expect(auth.signInAnonymously).toHaveBeenCalledTimes(2);
  });
});
