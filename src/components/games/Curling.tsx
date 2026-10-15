import { useEffect } from 'react';
import type { GameProps } from './types';

/** 컬링 — 자리만 잡아 둔 임시 판. 다음 커밋에서 연출을 채운다. 당첨은 App 이 정한 winnerIndex 그대로. */
export function Curling({ candidates, winnerIndex, spinning, run, onSpinEnd }: GameProps) {
  useEffect(() => {
    if (!spinning) return;
    const t = setTimeout(onSpinEnd, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinning, run]);
  return (
    <ol className="curling" aria-label="컬링">
      {candidates.map((p, i) => (
        <li key={p.id} aria-current={!spinning && i === winnerIndex ? 'true' : undefined}>
          {p.name}
        </li>
      ))}
    </ol>
  );
}
