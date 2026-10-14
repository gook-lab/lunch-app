import { categoryIcon, categoryLabel } from '../../lib/category';
import type { Place } from '../../lib/candidates';

/**
 * 가게 핀. 기본 마커는 전부 같은 파란 물방울이라 무슨 가게인지 눌러 봐야 알았다.
 * 그림(카테고리)·이름·도보 시간을 핀에 바로 쓴다. textContent 로만 넣는다 —
 * 가게 이름은 사람이 입력한 값이다.
 */
/** average 가 있으면 도보 시간 앞에 ★ 평균을 붙인다. */
export function pinElement(place: Place, today: boolean, average?: number): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'map__pin';
  if (!place.active) el.classList.add('map__pin--off');
  if (today) el.classList.add('map__pin--today');
  const icon = document.createElement('span');
  icon.className = 'map__pinIcon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = today ? '⭐' : categoryIcon(place.sub ?? place.category);
  const name = document.createElement('span');
  name.className = 'map__pinName';
  name.textContent = place.name;
  const walk = document.createElement('span');
  walk.className = 'map__pinWalk';
  walk.textContent = (average ? `★${average.toFixed(1)} · ` : '') + `${place.walkMin}분`;
  el.append(icon, name, walk);
  el.setAttribute(
    'aria-label',
    `${place.name}, ${categoryLabel(place)}, 도보 ${place.walkMin}분` +
      (average ? `, 별점 ${average.toFixed(1)}점` : '') +
      (today ? ', 오늘 정한 곳' : '') +
      (place.active ? '' : ', 꺼 둔 가게'),
  );
  return el;
}
