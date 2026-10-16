/**
 * 계절·요일·날씨 장식 제공자.
 * 게임이 이 컴포넌트를 쓰면 useAmbience() 로 계절 장식을 그릴 수 있다.
 */
import { useAmbience } from '../../hooks/useAmbience';

export interface GameDecorProps {
  /** 장식을 놓을 위치('center', 'top', 'bottom', 'corners'). */
  position?: 'center' | 'top' | 'bottom' | 'corners';
  /** 세로(px). 기본값 40 */
  size?: number;
}

/** 계절 아이콘 SVG — 원판 중심·가운데 허브 장식 등으로 쓰인다. */
export function SeasonIcon({ size = 40 }: { size?: number }) {
  const { season } = useAmbience();

  switch (season) {
    case 'spring':
      // 벚꽃 / 튤립
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* 중심 줄기 */}
          <line x1="20" y1="10" x2="20" y2="30" stroke="currentColor" strokeWidth="1.5" />
          {/* 꽃잎 5개 — 중심 원주 */}
          {[0, 1, 2, 3, 4].map((i) => {
            const angle = (i * 72 * Math.PI) / 180;
            const x = 20 + 8 * Math.cos(angle);
            const y = 16 + 8 * Math.sin(angle);
            return (
              <circle key={i} cx={x} cy={y} r="3" fill="currentColor" fillOpacity="0.6" />
            );
          })}
          {/* 중심 노란색 꽃술 */}
          <circle cx="20" cy="16" r="2.5" fill="currentColor" />
        </svg>
      );
    case 'summer':
      // 해
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="8" fill="currentColor" fillOpacity="0.7" />
          {[0, 45, 90, 135].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x1 = 20 + 10 * Math.cos(rad);
            const y1 = 20 + 10 * Math.sin(rad);
            const x2 = 20 + 14 * Math.cos(rad);
            const y2 = 20 + 14 * Math.sin(rad);
            return (
              <line key={angle} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="2" />
            );
          })}
        </svg>
      );
    case 'autumn':
      // 단풍잎
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* 중심 줄기 */}
          <path d="M 20 25 L 20 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
          {/* 다섯 갈래 */}
          {[-2, -1, 0, 1, 2].map((offset) => {
            const angle = (90 + offset * 30) * (Math.PI / 180);
            const endX = 20 + (8 + Math.abs(offset) * 1.5) * Math.cos(angle);
            const endY = 18 + (8 + Math.abs(offset) * 1.5) * Math.sin(angle);
            return (
              <path key={offset} d={`M 20 18 L ${endX} ${endY}`} stroke="currentColor" strokeWidth="1.2" fill="none" />
            );
          })}
        </svg>
      );
    case 'winter':
      // 눈송이
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* 중심 */}
          <circle cx="20" cy="20" r="1.5" fill="currentColor" />
          {/* 6개 가지 */}
          {[0, 60, 120, 180, 240, 300].map((angle) => {
            const rad = (angle * Math.PI) / 180;
            const x = 20 + 9 * Math.cos(rad);
            const y = 20 + 9 * Math.sin(rad);
            return (
              <g key={angle}>
                <line x1="20" y1="20" x2={x} y2={y} stroke="currentColor" strokeWidth="1" />
                {/* 가지 끝 */}
                <circle cx={x} cy={y} r="1" fill="currentColor" />
                {/* 곁가지 */}
                {[30, -30].map((offset) => {
                  const subAngle = (angle + offset) * (Math.PI / 180);
                  const subX = x + 3 * Math.cos(subAngle);
                  const subY = y + 3 * Math.sin(subAngle);
                  return (
                    <line key={offset} x1={x} y1={y} x2={subX} y2={subY} stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
                  );
                })}
              </g>
            );
          })}
        </svg>
      );
    default:
      return null;
  }
}

/** 게임 판의 CSS 클래스명 조합. */
export function getGameAmbienceClasses(season: string, weather: string, weekday: number): string {
  const classes = [`game--season-${season}`, `game--weather-${weather}`];
  if (weekday === 5) classes.push('game--friday');
  return classes.join(' ');
}

/** 게임 판 주변에 붙는 장식 요소. */
export function GameDecorContainer({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: '100%' }}>
      {children}
    </div>
  );
}
