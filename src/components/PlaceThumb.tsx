/**
 * 가게 사진 칸. 자리는 처음부터 잡아 두고(메뉴 그림) 사진이 오면 바꿔 끼운다 —
 * 늦게 온 사진이 글자를 밀어내지 않게. 사진은 검색 결과라 누르면 카카오맵 장소 페이지로 간다.
 */
import { useState } from 'react';
import type { Place } from '../lib/candidates';
import { categoryIcon } from '../lib/category';
import { kakaoPlaceUrl } from '../lib/directions';
import { markPhotoBroken, usePlacePhotos } from '../services/placePhoto';

type Props = {
  place: Pick<Place, 'id' | 'name' | 'lat' | 'lng' | 'category' | 'sub' | 'kakaoPlaceId'>;
  size?: 'md' | 'lg';
  className?: string;
};

export function PlaceThumb({ place, size = 'md', className }: Props) {
  // 깨진 사진은 서비스가 기억하고 빼 준다. 대표가 깨지면 살아 있는 다음 사진이 맨 앞에 온다.
  const photo = usePlacePhotos(place).urls[0];
  const [loaded, setLoaded] = useState<string | null>(null);
  const icon = categoryIcon(place.sub ?? place.category);

  const cls = ['thumb', `thumb--${size}`, className].filter(Boolean).join(' ');
  if (!photo) {
    return (
      <span className={cls} aria-hidden="true">
        {icon}
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
      {/* 사진이 다 올 때까지는 메뉴 그림을 보인다. 받는 동안 빈 회색 칸만 있으면 고장 난 줄 알았다(10/15). */}
      <span className="thumb__icon" aria-hidden="true">
        {icon}
      </span>
      <img
        key={photo}
        className={loaded === photo ? 'is-loaded' : undefined}
        src={photo}
        alt={`${place.name} 사진`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(photo)}
        onError={() => markPhotoBroken(photo)}
      />
      <span className="sr-only"> (카카오맵에서 보기, 새 탭)</span>
    </a>
  );
}

/**
 * 대표 사진 말고 더 찾은 사진(최대 셋)을 한 줄로. 없으면 아무것도 그리지 않는다.
 * 대표 사진과 같은 요청에서 오므로 대개 함께 나타난다.
 *
 * 처음 그릴 때 사진이 있는지 아직 모르면 한 줄 자리를 비워 두고, 이 화면이 떠 있는 동안은
 * 사진이 없다고 밝혀져도 자리를 거두지 않는다. 늦게 온 줄이 "여기로 결정" 을 51px 밀었다(10/15).
 * 한 번 물어본 가게는 기억돼 있어, 다음부턴 처음부터 있는 만큼만 그린다.
 */
export function PlacePhotoStrip({ place, className }: Omit<Props, 'size'>) {
  const { known, urls } = usePlacePhotos(place);
  const [reserve] = useState(!known);
  const rest = urls.slice(1, 4);
  if (rest.length === 0 && !reserve) return null;
  const cls = ['photos', className].filter(Boolean).join(' ');
  if (rest.length === 0) {
    // 빈 칸은 보이지 않게 — 사진이 없는데 회색 칸이 서면 사진이 깨진 것처럼 보인다.
    return (
      <ul className={cls} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i}>
            <span className="photos__slot" />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={cls} aria-label={`${place.name} 사진 더 보기`}>
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
              onError={() => markPhotoBroken(url)}
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
