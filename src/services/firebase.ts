/**
 * Firebase 초기화 + 익명 로그인 (엔지니어링 리뷰 D2).
 *
 * 화면에는 로그인 UI 가 없다. 부팅할 때 조용히 익명 로그인을 붙여서
 * 기기당 uid 를 만들고, 그 uid 위에서 규칙이 필드 검사를 한다.
 *
 * 중요 — onSnapshot 의 permission-denied 는 재시도되지 않고 리스너를 영구
 * 종료시킨다. 토큰이 붙기 전에 구독을 걸면 신규 기기에서만 조용히 실패하고,
 * 캐시된 uid 가 있는 기존 기기에서는 재현되지 않아 디버깅이 오래 걸린다.
 * 그래서 구독은 반드시 ready 가 resolve 된 뒤에 건다.
 */
import { initializeApp } from 'firebase/app';
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  signInAnonymously,
  onAuthStateChanged,
  connectAuthEmulator,
  type User,
} from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(config);
export const db = getFirestore(app);
/**
 * getAuth 대신 initializeAuth 로 popupRedirectResolver 를 뺀다. getAuth 는 팝업·리디렉트
 * 로그인용 gapi(api.js·gapi_iframes 41KB)와 auth iframe(iframe.js 95KB)을 받고 그 iframe 을
 * 띄운 뒤에야 signUp 을 보냈다 — Slow 4G·CPU 4배에서 firebase 청크가 끝나고 signUp 까지
 * 1.1초가 비었다(10/15). 익명 로그인만 쓰니 리졸버가 필요 없다.
 * 저장 위치(persistence)는 getAuth 기본값과 같게 둬, 이미 로그인한 기기의 uid 를 그대로 읽는다.
 */
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
});

/**
 * 로컬 확인용 에뮬레이터. VITE_FIREBASE_EMULATOR=1 일 때만 붙는다.
 * 붙는 규칙은 firestore.rules 그대로라, 여기서 통과하면 실제 배포에서도
 * 같은 검사를 통과한다. 익명 로그인도 auth 에뮬레이터가 처리하므로
 * Firebase 콘솔 설정이 없어도 전체 흐름을 눌러볼 수 있다.
 *
 * 데이터는 에뮬레이터를 끄면 사라진다.
 */
if (import.meta.env.VITE_FIREBASE_EMULATOR === '1') {
  // 앱을 연 주소의 호스트로 붙는다. 사내망 IP(예: http://20.0.10.34:6173)로 동료 폰에서
  // 열면 127.0.0.1 은 그 폰 자신이라 데이터가 비었다. localhost 는 IPv6(::1)로 풀려
  // 에뮬레이터(IPv4)에 안 닿을 수 있어 127.0.0.1 로 둔다.
  const host = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
  // 포트는 기본 8080/9099. 띄워 둔 에뮬레이터와 따로 하나 더 띄워 테스트할 때만 바꾼다.
  const fsPort = Number(import.meta.env.VITE_EMULATOR_FS_PORT ?? 8080);
  const authPort = Number(import.meta.env.VITE_EMULATOR_AUTH_PORT ?? 9099);
  connectFirestoreEmulator(db, host, fsPort);
  connectAuthEmulator(auth, `http://${host}:${authPort}`, { disableWarnings: true });
  console.info(`[lunch-app] Firebase 에뮬레이터에 붙었습니다 (firestore ${fsPort} / auth ${authPort})`);
}

/**
 * 익명 로그인이 끝나면 resolve 한다. 여러 번 호출해도 로그인은 한 번만 일어난다.
 * 실패하면 reject 하고, 화면은 그 상태를 사용자에게 보여야 한다 — 조용히
 * 빈 화면으로 두면 "앱이 고장났다" 로 보고된다.
 *
 * 예전엔 모듈을 불러올 때 Promise 하나를 만들어 두고 모두가 그것을 await 했다. 오프라인으로
 * 열어 로그인이 한 번 실패하면 그 거절된 Promise 가 끝까지 남아, 연결된 뒤 "다시 시도" 를
 * 눌러도 signUp 요청이 다시 나가지 않았다(팀 사이트에서 차단 후 해제, 8초 동안 0건 · 10/15).
 * 그래서 실패하면 캐시를 비워 다음 호출이 로그인을 새로 시도하게 한다.
 */
let pending: Promise<User> | null = null;

export function ensureAuth(): Promise<User> {
  if (pending) return pending;
  const attempt = new Promise<User>((resolve, reject) => {
    const stop = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          stop();
          resolve(user);
        }
      },
      (error) => {
        stop();
        reject(error);
      },
    );

    signInAnonymously(auth).catch((error) => {
      stop();
      reject(error);
    });
  });
  pending = attempt;
  attempt.catch(() => {
    if (pending === attempt) pending = null;
  });
  return attempt;
}

// 첫 화면이 기다리지 않게 모듈을 불러오자마자 로그인을 시작한다. 실패는 실제로 기다리는 쪽이 받는다.
ensureAuth().catch(() => {});
