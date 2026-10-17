/**
 * 지금 시각(KST) — 초까지 돌아가는 시계. 머리말에 날씨와 같이 둔다(10/17 사용자).
 * 1초마다 이 컴포넌트만 다시 그린다(App 전체를 흔들지 않게). 낭독기에는 매초 읽히지 않는다(aria-live 없음).
 */
import { useEffect, useState } from 'react';

const fmt = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** KST "HH:MM:SS". */
export function kstClock(now: Date): string {
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * 숫자 한 자씩 같은 폭 칸에. 글꼴(Archivo → 대체 글꼴)마다 1 과 0 의 폭이 달라
 * 초가 바뀔 때마다 옆 글자가 좌우로 밀렸다(10/17 사용자). 자리 수가 같으니 칸 폭을 고정한다.
 */
const digits = (two: string) =>
  [...two].map((c, i) => (
    <span key={i} className="clock__d">
      {c}
    </span>
  ));

/** 바늘 각도(도). 시침은 분만큼, 분침은 초만큼 같이 움직인다. */
export function handAngles(hms: string): { h: number; m: number; s: number } {
  const [h, m, sec] = hms.split(':').map(Number);
  return { h: ((h % 12) + m / 60) * 30, m: (m + sec / 60) * 6, s: sec * 6 };
}

/** 작은 시계판. 눈금 12개(3·6·9·12 는 길게), 시침·분침·초침. 그림이라 낭독기엔 숨긴다. */
function Dial({ hms }: { hms: string }) {
  const a = handAngles(hms);
  return (
    <svg className="clock__dial" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="15" className="clock__face" />
      {Array.from({ length: 12 }, (_, i) => (
        <line key={i} x1="16" y1={i % 3 === 0 ? 3 : 4} x2="16" y2="6" transform={`rotate(${i * 30} 16 16)`} className="clock__tick" />
      ))}
      <line x1="16" y1="16" x2="16" y2="9" transform={`rotate(${a.h} 16 16)`} className="clock__hand clock__hand--h" />
      <line x1="16" y1="16" x2="16" y2="5.5" transform={`rotate(${a.m} 16 16)`} className="clock__hand clock__hand--m" />
      <line x1="16" y1="18.5" x2="16" y2="4.5" transform={`rotate(${a.s} 16 16)`} className="clock__hand clock__hand--s" />
      <circle cx="16" cy="16" r="1.4" className="clock__pin" />
    </svg>
  );
}

export function LiveClock({ className, analog = false }: { className?: string; analog?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // 초가 바뀌는 순간에 맞춰 돈다. setInterval(1000) 만 쓰면 시작 시점만큼 늘 늦게 바뀐다.
    let id = 0;
    const tick = () => {
      const d = new Date();
      setNow(d);
      id = window.setTimeout(tick, 1000 - d.getMilliseconds() + 5);
    };
    id = window.setTimeout(tick, 1000 - new Date().getMilliseconds() + 5);
    return () => window.clearTimeout(id);
  }, []);
  const text = kstClock(now);
  // 시:분은 크게, 초는 작게 — 초만 바뀌는 게 눈에 들어오게. 가운데 쌍점은 1초에 한 번 숨쉰다(움직임 줄이기면 멈춤).
  return (
    <time className={className ? `clock ${className}` : 'clock'} dateTime={now.toISOString()} aria-label={`지금 ${text}`}>
      {analog && <Dial hms={text} />}
      <span className="clock__hm" aria-hidden="true">
        {digits(text.slice(0, 2))}
        <span className="clock__colon">:</span>
        {digits(text.slice(3, 5))}
      </span>
      <span className="clock__s" aria-hidden="true">
        {digits(text.slice(6))}
      </span>
    </time>
  );
}
