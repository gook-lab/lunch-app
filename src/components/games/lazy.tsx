/**
 * 게임 코드 나눠 받기 — 고른 게임만 받는다.
 *
 * 열 가지 게임(특히 핀볼 물리)을 한 번들에 넣으면 첫 화면 JS 가 960KB 였고, 그중
 * 180KB 를 첫 화면에서 안 썼다(Lighthouse 10/13, 모바일 성능 66). React.lazy 대신
 * 직접 만든 이유: 이미 받은 게임은 다음 렌더에 바로 그려야 한다. React.lazy 는 모듈이
 * 받아져 있어도 첫 렌더에 한 번은 멈춰서, 탭·방식 전환과 테스트가 한 틱씩 밀렸다.
 * 첫 화면을 그린 뒤 쉬는 시간에 나머지를 미리 받아 둔다(preloadGames).
 */
import { useEffect, useState, type ComponentType } from 'react';

type Loader<P> = () => Promise<ComponentType<P>>;

export interface LazyGame<P> {
  (props: P): React.JSX.Element;
  preload: () => Promise<void>;
}

export function lazyGame<P extends object>(load: Loader<P>): LazyGame<P> {
  let Comp: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  const preload = () =>
    (pending ??= load().then((c) => {
      Comp = c;
    }));
  function Lazy(props: P) {
    const [, setReady] = useState(Comp !== null);
    useEffect(() => {
      if (Comp) return;
      let live = true;
      preload().then(() => live && setReady(true));
      return () => {
        live = false;
      };
    }, []);
    if (Comp) return <Comp {...props} />;
    return <div className="game-loading" aria-busy="true" aria-label="게임을 준비하고 있어요" />;
  }
  Lazy.preload = preload;
  return Lazy;
}
