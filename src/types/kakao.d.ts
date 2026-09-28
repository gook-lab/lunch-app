/**
 * 카카오 지도 SDK 타입 — 우리가 실제로 쓰는 것만 선언한다.
 *
 * 전부 선언하려 들면 SDK 판올림마다 여기가 깨진다. 쓰는 것만 적고,
 * 새로 쓰기 시작할 때 추가한다.
 */

export interface KakaoLatLng {
  getLat: () => number;
  getLng: () => number;
}

/** keywordSearch 가 돌려주는 장소. 좌표가 문자열로 온다 — x=경도, y=위도. */
export interface KakaoPlace {
  id: string;
  place_name: string;
  category_name: string;
  category_group_name: string;
  address_name: string;
  road_address_name: string;
  /** 경도(lng). 문자열이다. */
  x: string;
  /** 위도(lat). 문자열이다. */
  y: string;
}

export interface KakaoMap {
  setCenter: (latlng: KakaoLatLng) => void;
  setBounds: (bounds: KakaoLatLngBounds, ...padding: number[]) => void;
  relayout: () => void;
}

export interface KakaoLatLngBounds {
  extend: (latlng: KakaoLatLng) => void;
}

export interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void;
}

export interface KakaoCustomOverlay {
  setMap: (map: KakaoMap | null) => void;
}

export interface KakaoMaps {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (options: { position: KakaoLatLng; title?: string; map?: KakaoMap }) => KakaoMarker;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: string | HTMLElement;
    map?: KakaoMap;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  event: {
    addListener: (target: unknown, type: string, handler: () => void) => void;
  };
  services: {
    Places: new () => {
      keywordSearch: (
        keyword: string,
        callback: (data: KakaoPlace[], status: string) => void,
        options?: { location?: KakaoLatLng; radius?: number; size?: number },
      ) => void;
    };
    Status: { OK: string; ZERO_RESULT: string; ERROR: string };
  };
  /** autoload=false 로 받았을 때 초기화를 여는 함수. */
  load: (callback: () => void) => void;
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}
