/**
 * 게임 하나가 그리다 터져도 앱 전체가 흰 화면이 되지 않게 막는다.
 * 핀볼 색 계산이 NaN 이 되어 앱이 통째로 내려간 적이 있다(10/14). 게임은 연출일 뿐이라
 * 게임판만 안내로 바꾸고 칩·탭·결과는 그대로 쓸 수 있게 둔다.
 * resetKey(방식·판·후보)가 바뀌면 다시 그려 본다.
 */
import { Component, type ReactNode } from 'react';

interface Props {
  resetKey: string;
  children: ReactNode;
}

interface State {
  failedAt: string | null;
}

export class GameBoundary extends Component<Props, State> {
  state: State = { failedAt: null };

  static getDerivedStateFromError(): Partial<State> {
    return { failedAt: '' };
  }

  componentDidCatch(error: unknown) {
    this.setState({ failedAt: this.props.resetKey });
    console.error('[GameBoundary]', error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failedAt !== null && prev.resetKey !== this.props.resetKey) this.setState({ failedAt: null });
  }

  render() {
    if (this.state.failedAt === null) return this.props.children;
    return (
      <div className="game-failed" role="alert">
        <p>게임을 그리다 문제가 생겼어요.</p>
        <button type="button" className="linkish" onClick={() => this.setState({ failedAt: null })}>
          다시 그리기
        </button>
      </div>
    );
  }
}
