/**
 * 카카오 지도 SDK 동적 로더 (엔지니어링 리뷰 D7).
 *
 * 결정 화면은 이 파일을 건드리지 않는다. 지도 탭에 처음 들어갈 때만
 * 스크립트를 꽂는다 — 첫 화면 성공 기준이 응답 중앙값 3초이고, SDK 는
 * 그 예산에 들어갈 크기가 아니다.
 *
 * 규칙 셋:
 *  1. 한 번만 받는다. 탭을 오가도 스크립트 요청은 최초 1회다.
 *  2. 실패는 지도 탭에서 끝난다. 돌림판은 계속 돌아간다.
 *  3. 실패한 약속은 남기지 않는다 — 다시 시도 버튼이 동작해야 한다.
 *
 * autoload=false 를 쓰는 이유: 기본값(autoload=true)은 document 로드 시점에
 * 스스로 초기화한다. 우리는 로드가 끝난 뒤에 스크립트를 꽂으므로 그 시점이
 * 이미 지나 있어 초기화가 영영 일어나지 않는다. 그래서 끄고 load() 를 직접 부른다.
 */
import type { KakaoMaps } from '../types/kakao';

const SDK_ORIGIN = 'https://dapi.kakao.com';
const SDK_PATH = '/v2/maps/sdk.js';
/** 스크립트는 받았는데 초기화 콜백이 안 오는 경우를 끊는다. */
const TIMEOUT_MS = 10_000;

export type KakaoLoadFailure = 'no-key' | 'script' | 'timeout';

export class KakaoLoadError extends Error {
  // 생성자 파라미터 프로퍼티는 erasableSyntaxOnly 가 막는다. 필드를 따로 쓴다.
  readonly kind: KakaoLoadFailure;

  constructor(kind: KakaoLoadFailure, message: string) {
    super(message);
    this.name = 'KakaoLoadError';
    this.kind = kind;
  }
}

/** 키는 env 에서만 온다. index.html 에 박지 않는다 (설계 D1). */
export function kakaoJsKey(): string {
  return (import.meta.env.VITE_KAKAO_JS_KEY ?? '').trim();
}

let pending: Promise<KakaoMaps> | null = null;
/**
 * 실패도 기억한다.
 *
 * 처음에는 실패하면 약속만 버렸다. 그러니 지도 탭에 들어갈 때마다 스크립트를
 * 새로 요청했다 — 탭 3번 왕복에 401 이 3번 났다. 도메인이 등록되지 않은 동안
 * 탭을 오가기만 해도 요청이 쌓이는 셈이다.
 *
 * 그래서 실패를 캐시하고, 사람이 "다시 시도" 를 누를 때만 지운다.
 * 이러면 탭 진입은 성공이든 실패든 요청 1회다.
 */
let failure: KakaoLoadError | null = null;

export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (pending) return pending;
  if (failure) return Promise.reject(failure);

  // 이미 붙어 있으면(HMR 등) 그걸 쓴다.
  if (window.kakao?.maps?.LatLng) {
    pending = Promise.resolve(window.kakao.maps);
    return pending;
  }

  const key = kakaoJsKey();
  if (!key) {
    // 요청을 보내지 않는다. 키 없이 부르면 콘솔만 더럽히고 결과는 같다.
    failure = new KakaoLoadError('no-key', 'VITE_KAKAO_JS_KEY 가 비어 있어요.');
    return Promise.reject(failure);
  }

  pending = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;

    const fail = (kind: KakaoLoadFailure, message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      // 다음 시도가 새 태그를 꽂을 수 있게 치운다.
      script.remove();
      pending = null;
      failure = new KakaoLoadError(kind, message);
      reject(failure);
    };

    const timer = window.setTimeout(
      () => fail('timeout', `SDK 초기화가 ${TIMEOUT_MS / 1000}초 안에 끝나지 않았어요.`),
      TIMEOUT_MS,
    );

    script.async = true;
    script.src =
      `${SDK_ORIGIN}${SDK_PATH}` +
      `?appkey=${encodeURIComponent(key)}&libraries=services&autoload=false`;

    script.onerror = () =>
      fail('script', 'SDK 스크립트를 받지 못했어요. 네트워크나 앱 키를 확인해 주세요.');

    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) {
        fail('script', 'SDK 를 받았지만 kakao.maps 가 없어요.');
        return;
      }
      maps.load(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        resolve(maps);
      });
    };

    document.head.appendChild(script);
  });

  return pending;
}

/**
 * 기억한 실패를 지운다. "다시 시도" 버튼만 부른다 —
 * 탭 진입에서 부르면 실패 캐시가 있으나 없으나 같아진다.
 */
export function clearKakaoLoadFailure(): void {
  failure = null;
}

/** 테스트용. 모듈 상태를 비운다. */
export function resetKakaoLoaderForTest(): void {
  pending = null;
  failure = null;
}
