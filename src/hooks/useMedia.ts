import { useEffect, useState } from 'react';

/**
 * 미디어 쿼리가 맞는가. 화면 폭에 따라 DOM 구조가 달라질 때 쓴다(CSS 로만 숨기면
 * 같은 내용이 두 번 그려져 id 가 겹친다 — 오늘 탭 조건 패널).
 */
export function useMedia(query: string): boolean {
  const get = () => typeof window !== 'undefined' && window.matchMedia?.(query).matches === true;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [query]);
  return match;
}
