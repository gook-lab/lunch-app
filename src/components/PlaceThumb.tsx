/**
 * 가게 사진 칸. 자리는 처음부터 잡아 두고(메뉴 그림) 사진이 오면 바꿔 끼운다 —
 * 늦게 온 사진이 글자를 밀어내지 않게. 사진은 검색 결과라 누르면 카카오맵 장소 페이지로 간다.
 */
import { useEffect, useState } from 'react';
import type { Place } from '../lib/candidates';
import { categoryIcon } from '../lib/category';
import { kakaoPlaceUrl } from '../lib/directions';
import { fetchPlacePhoto, readCached, type PlacePhoto } from '../services/placePhoto';

type Props = {
  place: Pick<Place, 'id' | 'name' | 'lat' | 'lng' | 'category' | 'sub' | 'kakaoPlaceId'>;
  size?: 'md' | 'lg';
  className?: string;
};

export function PlaceThumb({ place, size = 'md', className }: Props) {
  const [photo, setPhoto] = useState<PlacePhoto | null>(() => readCached(place) ?? null);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    let alive = true;
    setBroken(false);
    void fetchPlacePhoto(place).then((p) => {
      if (alive) setPhoto(p);
    });
    return () => {
      alive = false;
    };
    // 같은 가게면 다시 묻지 않는다. 이름을 고치면 다른 사진을 찾는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id, place.name]);

  const cls = ['thumb', `thumb--${size}`, className].filter(Boolean).join(' ');
  if (!photo || broken) {
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
      <img src={photo.thumb} alt={`${place.name} 사진`} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      <span className="sr-only"> (카카오맵에서 보기, 새 탭)</span>
    </a>
  );
}
