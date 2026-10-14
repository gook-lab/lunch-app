/**
 * 공개 데모 안내 — 데모 빌드(VITE_DEMO=1)에서만 머리말 아래에 뜬다.
 * 누르는 사람이 "이게 진짜 회사 기록인가" 헷갈리지 않게, 저장이 어디로 가는지 먼저 말한다.
 */
import { resetDemo } from '../services/demoStore';

export function DemoNote() {
  return (
    <p className="demo-note">
      <span aria-hidden="true">🧪 </span>
      {/* 휴대폰에서 두 줄을 먹어 첫 화면이 밀렸다(10/14). 한 줄로. 가게가 예시라는 건 "데모" 로 충분하다. */}
      체험 중에 넣은 가게와 기록은 이 브라우저에만 남아요.{' '}
      <button
        type="button"
        className="linkish"
        onClick={() => {
          resetDemo();
          window.location.reload();
        }}
      >
        처음부터 다시
      </button>
    </p>
  );
}
