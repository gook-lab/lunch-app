/**
 * 첫 게임까지 남은 단계 — 가게가 하나도 없을 때(빈 화면) 보인다.
 *
 * 예전엔 "먼저 회사 위치를… 그다음 가게를 두 곳 이상…" 두 줄 글이었다. 처음 온 사람은 몇 단계가 남았는지,
 * 지금 어디쯤인지 읽지 못했다. 식권 칸처럼 세 칸을 두고 끝낸 칸 · 지금 칸 · 남은 칸을 나눈다.
 * 단계를 정하는 기준(회사 위치 저장 여부)과 단추는 빈 화면이 원래 쓰던 그대로다.
 */
interface Props {
  /** 회사 위치를 이 브라우저(또는 팀)에 정해 두었는가. */
  officeSaved: boolean;
}

const STEPS = ['회사 위치 정하기', '가게 두 곳 넣기', '게임 한 판 돌리기'] as const;

export function FirstSteps({ officeSaved }: Props) {
  const now = officeSaved ? 1 : 0;
  return (
    <ol className="firstSteps" aria-label="첫 게임까지">
      {STEPS.map((label, i) => {
        const state = i < now ? 'done' : i === now ? 'now' : 'next';
        return (
          <li key={label} className={`firstSteps__step firstSteps__step--${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="firstSteps__num" aria-hidden="true">
              {state === 'done' ? '✓' : i + 1}
            </span>
            <span className="firstSteps__label">
              {label}
              {state === 'done' && <span className="sr-only"> (끝냄)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
