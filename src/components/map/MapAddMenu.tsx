/**
 * 지도를 한 번 누르면 그 자리에 뜨는 작은 메뉴.
 * 길게 눌러 넣기는 아무도 몰랐다(10/14 사용자: "검색만 지원하니"). 누른 자리 근처
 * 음식점을 먼저 보여 주고, 없으면 그 자리에 직접 넣는다.
 *
 * 카카오 CustomOverlay 안에 portal 로 그린다. 글자는 전부 React 가 넣는다(XSS).
 */
import { useEffect, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { Place } from '../../lib/candidates';
import type { NearbyHit } from './nearbyHits';
import type { KakaoPlace } from '../../types/kakao';
import './mapAdd.css';

interface Props {
  host: HTMLElement;
  /** null 이면 찾는 중. */
  hits: NearbyHit[] | null;
  onPick: (hit: KakaoPlace) => void;
  onGoTo: (place: Place) => void;
  onDirect: () => void;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function MapAddMenu({ host, hits, onPick, onGoTo, onDirect, onClose, returnFocusRef }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallback = returnFocusRef?.current;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      const target = before && before !== document.body && before.isConnected ? before : fallback;
      target?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  return createPortal(
    <div className="map-add" role="dialog" aria-label="이 자리에 가게 넣기">
      <div className="map-add__head">
        <strong>이 근처 밥집</strong>
        <button ref={closeRef} type="button" className="map-add__close" aria-label="닫기" onClick={onClose}>
          ✕
        </button>
      </div>
      {hits === null ? (
        <p className="map-add__muted">찾고 있어요…</p>
      ) : hits.length === 0 ? (
        <p className="map-add__muted">근처에서 음식점을 찾지 못했어요</p>
      ) : (
        <ul className="map-add__list">
          {hits.map(({ hit, meters, existing }) => (
            <li key={hit.id}>
              <button
                type="button"
                className="map-add__hit"
                onClick={() => (existing ? onGoTo(existing) : onPick(hit))}
              >
                <span className="map-add__name">{hit.place_name}</span>
                <span className="map-add__meta">{existing ? '이미 있어요' : `${meters}m`}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="map-add__direct" onClick={onDirect}>
        ＋ 여기에 직접 넣기
      </button>
    </div>,
    host,
  );
}
