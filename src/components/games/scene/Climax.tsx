/**
 * 긴박감 층 — 게임이 "마지막 순간"(남은 둘의 대결·마지막 기회·마지막 스톤 등)에 들어서면 켠다.
 * 가장자리 붉은 맥박 + 심장 소리(소리를 켠 사람만) + 짧은 배너 한 번. 연출 전용이라 당첨과 상관없다.
 * 쓰는 쪽은 무대(position: relative) 안에 넣는다. on 이 꺼지면 소리도 바로 멈춘다.
 */
import { useEffect } from 'react';
import { tournbalSfxLater } from '../../../lib/sfx';
import './climax.css';

/** 심장 소리는 최대 이만큼만 — 연출이 길어져도 계속 울리지 않게. */
const MAX_BEATS = 10;

export function Climax({ on, label, beatMs = 760 }: { on: boolean; label?: string; beatMs?: number }) {
  useEffect(() => {
    if (!on) return;
    return tournbalSfxLater(Array.from({ length: MAX_BEATS }, (_, i) => [i * beatMs, 'heartbeat'] as [number, 'heartbeat']));
  }, [on, beatMs]);
  if (!on) return null;
  return (
    <span className="climax" aria-hidden="true" style={{ '--beat': `${beatMs}ms` } as React.CSSProperties}>
      <span className="climax__edge" />
      {label && <span className="climax__banner">{label}</span>}
    </span>
  );
}
