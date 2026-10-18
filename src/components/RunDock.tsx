import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * 휴대폰 실행 단추 자리. 평소엔 게임판 바로 아래 제자리에 두고, 사용자가 그 자리를 지나 아래로
 * 내려갔을 때만 화면 아래(탭 바 위)에 띄운다. 늘 띄우면 쉬는 화면에서 게임판 윗부분을 가렸다(10/18 리뷰).
 * 띄우는 동안에도 이 상자가 단추 높이만큼 자리를 지켜 화면이 출렁이지 않는다.
 */
export function RunDock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      // 제자리가 화면 위로 지나갔을 때만. 아직 아래에 있으면(판을 보는 중) 띄우지 않는다.
      setDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={docked ? 'run-dock run-dock--on' : 'run-dock'}>
      {children}
    </div>
  );
}
