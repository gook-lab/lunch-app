/**
 * 화면 전체를 차지하는 상태 — 불러오는 중 · 불러오기 실패 · 가게 0곳 · 없는 주소.
 *
 * 예전엔 문구 한 줄만 화면 가운데 떠 있었다. 무엇이 일어나는지, 다음에 뭘 하면
 * 되는지가 안 보였다(docs/handoff/6 · 5a~5d). 그림 하나, 제목 하나, 설명, 단추 하나로 맞춘다.
 */
import type { ReactNode } from 'react';

interface Props {
  /** 그림. 장식이라 화면낭독기는 건너뛴다. */
  art: ReactNode;
  title: string;
  /** 설명. 줄마다 끊어 읽히게 배열로 받는다. */
  lines?: string[];
  /** 개발자용 원문(오류 코드 등). 고정폭 상자에 따로 둔다. */
  code?: string;
  action?: ReactNode;
  /** 불러오는 중이면 status, 실패면 alert 로 읽힌다. */
  role?: 'status' | 'alert';
  /** 탭 안에 들어가면 화면 높이를 다 쓰지 않는다. */
  inline?: boolean;
}

export function StatusScreen({ art, title, lines = [], code, action, role, inline = false }: Props) {
  return (
    <section className={inline ? 'status status--inline' : 'status'} role={role} aria-live={role === 'status' ? 'polite' : undefined}>
      <div className="status__art" aria-hidden="true">
        {art}
      </div>
      <h2 className="status__title">{title}</h2>
      {code && <p className="status__code">{code}</p>}
      {lines.length > 0 && (
        <p className="status__lines">
          {lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </p>
      )}
      {action}
    </section>
  );
}

/** 없는 주소. 라우터가 없는 한 화면 앱이라 경로가 붙어 오면 여기로 온다. */
export function NotFound() {
  return (
    <main className="app app--center">
      <StatusScreen
        art={
          <span className="status__404">
            4<span className="status__plate">🍽</span>4
          </span>
        }
        title="이런 주소는 없어요"
        lines={['점심은 한 화면에서 정해요.', '링크 뒤에 붙은 경로는 필요 없어요.']}
        action={
          <a className="status__btn" href="/">
            오늘 점심으로 가기
          </a>
        }
      />
    </main>
  );
}

/** 이 앱이 받는 주소인가. 루트와 index.html 만 받는다(쿼리·해시는 상관없다). */
export function isKnownPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/index.html';
}
