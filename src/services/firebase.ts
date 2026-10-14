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
  connectFirestoreEmulator(db, host, 8080);
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  console.info('[lunch-app] Firebase 에뮬레이터에 붙었습니다 (firestore 8080 / auth 9099)');
}

/**
 * 익명 로그인이 끝나면 resolve 한다. 여러 번 호출해도 로그인은 한 번만 일어난다.
 * 실패하면 reject 하고, 화면은 그 상태를 사용자에게 보여야 한다 — 조용히
 * 빈 화면으로 두면 "앱이 고장났다" 로 보고된다.
 */
export const authReady: Promise<User> = new Promise((resolve, reject) => {
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
