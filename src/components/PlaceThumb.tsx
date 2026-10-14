/**
 * 가게 사진 칸. 자리는 처음부터 잡아 두고(메뉴 그림) 사진이 오면 바꿔 끼운다 —
 * 늦게 온 사진이 글자를 밀어내지 않게. 사진은 검색 결과라 누르면 카카오맵 장소 페이지로 간다.
 */
import { useState } from 'react';
import type { Place } from '../lib/candidates';
import { categoryIcon } from '../lib/category';
import { kakaoPlaceUrl } from '../lib/directions';
import { usePlacePhoto } from '../services/placePhoto';

type Props = {
  place: Pick<Place, 'id' | 'name' | 'lat' | 'lng' | 'category' | 'sub' | 'kakaoPlaceId'>;
  size?: 'md' | 'lg';
  className?: string;
};

export function PlaceThumb({ place, size = 'md', className }: Props) {
  const photo = usePlacePhoto(place);
  const [broken, setBroken] = useState<string | null>(null);

  const cls = ['thumb', `thumb--${size}`, className].filter(Boolean).join(' ');
  if (!photo || broken === photo.thumb) {
    return (
      <span className={cls} aria-hidden="true">
        {categoryIcon(place.sub ?? place.category)}
      </span>
    );
  }
  return (
    <a
      className={`${cls} thumb--photo`}
      href={kakaoPlaceUrl(place)}
      target="_blank"
      rel="noreferrer"
      title="검색으로 찾은 사진이라 실제와 다를 수 있어요"
    >
      <img
        src={photo.thumb}
        alt={`${place.name} 사진`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(photo.thumb)}
      />
      <span className="sr-only"> (카카오맵에서 보기, 새 탭)</span>
    </a>
  );
}

/**
 * 대표 사진 말고 더 찾은 사진(최대 셋)을 한 줄로. 없으면 아무것도 그리지 않는다.
 * 대표 사진과 같은 요청에서 오므로 대개 함께 나타난다.
 */
export function PlacePhotoStrip({ place, className }: Omit<Props, 'size'>) {
  const photo = usePlacePhoto(place);
  const [broken, setBroken] = useState<string[]>([]);
  const rest = (photo?.photos ?? []).slice(1).filter((u) => !broken.includes(u));
  if (rest.length === 0) return null;
  return (
    <ul className={['photos', className].filter(Boolean).join(' ')} aria-label={`${place.name} 사진 더 보기`}>
      {rest.map((url, i) => (
        <li key={url}>
          <a
            href={kakaoPlaceUrl(place)}
            target="_blank"
            rel="noreferrer"
            title="검색으로 찾은 사진이라 실제와 다를 수 있어요"
          >
            <img
              src={url}
              alt={`${place.name} 사진 ${i + 2}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setBroken((b) => [...b, url])}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
