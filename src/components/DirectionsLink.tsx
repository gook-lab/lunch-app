import type { Place } from '../lib/candidates';
import { walkRouteUrl } from '../lib/directions';
import { officeCoord } from '../lib/walk';

/** 카카오맵 도보 길찾기를 새 탭으로. 회사 위치는 지금 정해 둔 값을 쓴다. */
export function DirectionsLink({ place, className }: { place: Pick<Place, 'name' | 'lat' | 'lng'>; className?: string }) {
  return (
    <a
      className={['dir-link', className].filter(Boolean).join(' ')}
      href={walkRouteUrl(place, officeCoord())}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span aria-hidden="true">🧭 </span>길찾기
      <span className="sr-only"> (카카오맵, 새 탭)</span>
    </a>
  );
}
