import { useLayoutEffect, useRef } from 'react';

/**
 * 가장 최근 렌더의 값을 ref 로 읽는다. 효과나 타이머가 오래된 클로저 대신 지금 값을 쓸 때 쓴다.
 * 값은 화면을 그린 뒤 레이아웃 효과에서 갱신되므로, 일반 효과와 그 뒤의 타이머는 최신 값을 본다.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
