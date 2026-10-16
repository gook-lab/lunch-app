/**
 * 계절 소품 하나 — 봄 벚나무, 여름 파라솔, 가을 단풍나무, 겨울 눈사람.
 * 무대 가장자리에 놓아 같은 장소가 계절을 타게 한다. 연출 전용.
 */
import type { AmbienceSeason } from '../../../lib/ambience';
import './scene.css';

export function SeasonProp({ season, className }: { season: AmbienceSeason; className?: string }) {
  return (
    <svg className={['scene-prop', className].filter(Boolean).join(' ')} viewBox="0 0 40 40" aria-hidden="true">
      {season === 'spring' && (
        <>
          <rect x="18.5" y="22" width="3" height="16" rx="1" className="scene-prop__trunk" />
          <circle cx="14" cy="18" r="9" className="scene-prop__blossom" />
          <circle cx="26" cy="17" r="9" className="scene-prop__blossom" />
          <circle cx="20" cy="10" r="9" className="scene-prop__blossom" />
          {[[12, 14], [22, 8], [27, 19], [17, 21], [24, 13]].map(([x, y], k) => (
            <circle key={k} cx={x} cy={y} r="1.6" className="scene-prop__blossom2" />
          ))}
        </>
      )}
      {season === 'summer' && (
        <>
          <rect x="19.2" y="10" width="1.6" height="28" className="scene-prop__trunk" />
          <path d="M4 14 Q20 -2 36 14 Z" className="scene-prop__umbrella" />
          <path d="M14.7 14 Q20 2 25.3 14 Z" className="scene-prop__umbrella2" />
        </>
      )}
      {season === 'autumn' && (
        <>
          <rect x="18.5" y="22" width="3" height="16" rx="1" className="scene-prop__trunk" />
          <circle cx="14" cy="18" r="9" className="scene-prop__maple" />
          <circle cx="26" cy="17" r="9" className="scene-prop__maple2" />
          <circle cx="20" cy="10" r="9" className="scene-prop__maple" />
          <circle cx="9" cy="37" r="1.6" className="scene-prop__maple" />
          <circle cx="30" cy="38" r="1.4" className="scene-prop__maple2" />
        </>
      )}
      {season === 'winter' && (
        <>
          <circle cx="20" cy="29" r="9" className="scene-prop__snow" />
          <circle cx="20" cy="15" r="6.5" className="scene-prop__snow" />
          <path d="M14 19.5 Q20 23 26 19.5 L26 21.5 Q20 25 14 21.5 Z" className="scene-prop__scarf" />
          <circle cx="17.8" cy="13.5" r="0.9" className="scene-prop__coal" />
          <circle cx="22.2" cy="13.5" r="0.9" className="scene-prop__coal" />
          <path d="M20 15 l5 1.2 l-5 1 z" className="scene-prop__carrot" />
          <circle cx="20" cy="27" r="0.9" className="scene-prop__coal" />
          <circle cx="20" cy="31" r="0.9" className="scene-prop__coal" />
        </>
      )}
    </svg>
  );
}
