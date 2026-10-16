/**
 * 게임 무대 날씨 층 — 비 줄기·눈송이·안개 띠·흐린 하늘.
 * 연출 전용이다. 누를 수 없고(pointer-events none) 화면 읽기에서 빠진다.
 * 자리·속도는 번호로 정해 두어 다시 그려도 같은 그림이다(Math.random 금지 — 공정성 테스트가 시드를 고정한다).
 *
 * 쓰는 쪽은 무대(position: relative) 안에 넣고, 이름표보다 아래 층에 두면 된다.
 * band 를 주면 그 높이(%) 안에만 안개를 깐다(하늘 쪽만 흐리게).
 */
import type { AmbienceWeather } from '../../../lib/ambience';
import './scene.css';

const DROPS = 36;
const FLAKES = 30;

export function SceneWeather({ weather, band, className }: { weather: AmbienceWeather; band?: [number, number]; className?: string }) {
  if (weather === 'clear') return null;
  const cls = ['scene-wx', `scene-wx--${weather}`, className].filter(Boolean).join(' ');
  return (
    <span className={cls} aria-hidden="true" style={band ? ({ '--band-top': `${band[0]}%`, '--band-h': `${band[1] - band[0]}%` } as React.CSSProperties) : undefined}>
      {weather === 'rain' &&
        Array.from({ length: DROPS }, (_, i) => (
          <i
            key={i}
            style={{ '--x': `${(i * 29 + 7) % 100}%`, '--d': `${0.55 + ((i * 7) % 5) * 0.08}s`, '--delay': `${-((i * 0.37) % 1.2)}s`, '--l': `${10 + ((i * 13) % 9)}%` } as React.CSSProperties}
          />
        ))}
      {weather === 'snow' &&
        Array.from({ length: FLAKES }, (_, i) => (
          <i
            key={i}
            style={{ '--x': `${(i * 37 + 3) % 100}%`, '--d': `${5 + ((i * 7) % 6)}s`, '--delay': `${-((i * 1.7) % 9)}s`, '--s': `${3 + ((i * 5) % 4)}px`, '--sway': `${(i % 2 ? 1 : -1) * (6 + ((i * 3) % 10))}px` } as React.CSSProperties}
          />
        ))}
      {weather === 'fog' && (
        <>
          <i className="scene-wx__fog scene-wx__fog--a" />
          <i className="scene-wx__fog scene-wx__fog--b" />
        </>
      )}
    </span>
  );
}
