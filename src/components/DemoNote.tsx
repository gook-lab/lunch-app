/**
 * 공개 데모 안내 — 데모 빌드(VITE_DEMO=1)에서만 머리말 아래에 뜬다.
 * 누르는 사람이 "이게 진짜 회사 기록인가" 헷갈리지 않게, 저장이 어디로 가는지 먼저 말한다.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { hasDemoData, onDemoChange, resetDemo } from '../services/demoStore';

export function DemoNote() {
  // 처음 상태에선 지울 게 없다. 단추를 눌러도 아무 일이 없어 고장처럼 보였다(10/15).
  const dirty = useSyncExternalStore(onDemoChange, hasDemoData);
  // 한 번 누르면 바로 다 지워져 되돌릴 수 없었다(10/15). 같은 자리에서 한 번 더 묻는다.
  const [asking, setAsking] = useState<boolean | null>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLButtonElement>(null);
  // 누른 단추가 사라지므로 초점을 바뀐 자리로 옮긴다. 처음 그릴 때(null)는 건드리지 않는다.
  useEffect(() => {
    if (asking === true) askRef.current?.focus();
    if (asking === false) resetRef.current?.focus();
  }, [asking]);

  return (
    <p className="demo-note">
      <span aria-hidden="true">🧪 </span>
      {/* 휴대폰에서 두 줄을 먹어 첫 화면이 밀렸다(10/14). 한 줄로. 가게가 예시라는 건 "데모" 로 충분하다. */}
      {asking ? '넣은 가게와 기록을 다 지울까요?' : '체험 중에 넣은 가게와 기록은 이 브라우저에만 남아요.'}
      {dirty &&
        (asking ? (
          <>
            {' '}
            <button
              type="button"
              className="linkish"
              onClick={() => {
                resetDemo();
                window.location.reload();
              }}
            >
              지우기
            </button>{' '}
            {/* 초점은 취소에 둔다. 엔터를 한 번 더 눌러 다 지워지는 일이 없게. */}
            <button ref={askRef} type="button" className="linkish" onClick={() => setAsking(false)}>
              취소
            </button>
          </>
        ) : (
          <>
            {' '}
            <button ref={resetRef} type="button" className="linkish" onClick={() => setAsking(true)}>
              처음부터 다시
            </button>
          </>
        ))}
    </p>
  );
}
