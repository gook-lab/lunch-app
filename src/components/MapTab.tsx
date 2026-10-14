/**
 * 지도 탭 — 진짜 좌표 위에서 보고, 넣고, 고친다 (§3).
 *
 * 이 파일은 App 에서 lazy 로 불린다. 결정 화면 첫 페인트에 지도 코드가
 * 섞이지 않아야 하고(D7), SDK 는 여기 들어올 때 처음 요청된다.
 *
 * 지도를 다시 만들지 않는다. 처음 한 번 만들고 가게가 바뀌면 마커만 갈아 끼운다 —
 * 통째로 다시 만들면 사람이 옮겨 둔 중심과 배율이 매번 되돌아간다.
 *
 * 실패는 이 탭에서 끝난다. 좌표 env 누락까지 전부 잡아 화면 상태로 바꾼다.
 * 여기서 던지면 로드맵까지 같이 죽는다.
 */
import { Spinner } from '@gook-lab/motion';
import { ChipPicker } from './ChipPicker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, Input, Textarea } from '@gook-lab/ui';
import { PRICE_BANDS, WALK_STEPS, type Place, type PriceBand } from '../lib/candidates';
import { kakaoPlaceUrl } from '../lib/directions';
import { DirectionsLink } from './DirectionsLink';
import { CATEGORIES, categoryIcon, categoryLabel } from '../lib/category';
import { CategoryChips } from './CategoryChips';
import { matchesCategory } from '../lib/candidates';
import { CategoryPicker } from './CategoryPicker';
import { metersForWalkMinutes, officeCoord, officeSource, type Coord } from '../lib/walk';
import { OfficeCard } from './map/OfficeCard';
import { SearchField } from './map/SearchField';
import { RemovePlaceSheet } from './RemovePlace';
import { pinElement } from './map/pin';
import type { RatingSummary } from '../lib/ratings';
import { RatingBadge, RatingEditor, RatingReviews } from './Rating';
import { clearKakaoLoadFailure, KakaoLoadError, kakaoJsKey, loadKakaoMaps } from '../services/kakao';
import { updatePlace } from '../services/lunch';
import type {
  KakaoCustomOverlay,
  KakaoMap,
  KakaoMarkerClusterer,
  KakaoMaps,
  KakaoMarker,
  KakaoPlace,
} from '../types/kakao';
import { PlaceForm, type PlaceDraft } from './map/PlaceForm';
import { MapAddMenu } from './map/MapAddMenu';
import { nearbyHits, TAP_RADIUS_M, type NearbyHit } from './map/nearbyHits';

/** 이만큼 누르고 있으면 핀을 꽂는다. */
const LONG_PRESS_MS = 500;
/** 이보다 많이 움직이면 지도를 끌고 있는 것이다. 핀을 꽂지 않는다. */
const DRAG_TOLERANCE_PX = 10;
/** 회사 기준 검색 반경. 도보 60분(직선 약 3.1km)보다 넉넉하게 둔다. */
const SEARCH_RADIUS_M = 5000;
const MAX_RESULTS = 10;

interface Props {
  places: Place[];
  onChanged: () => void;
  /** 회사 위치를 바꾼 뒤. 데이터를 다시 읽고 지도를 새 기준으로 다시 만든다. */
  onOfficeChanged: () => void;
  /** 오늘 정한 가게. 지도 핀에 "오늘" 표시를 단다. */
  todayId?: string | null;
  /** 최근 1주에 다녀온 가게. 핀을 흐리게 그린다. */
  recentIds?: ReadonlySet<string>;
  /** 목록에서 "지도" 를 눌러 들어왔으면 그 가게. 처음 한 번 그 핀으로 간다. */
  focusId?: string | null;
  /** 가게별 별점 요약. 핀·카드·옆 목록에 평균을 단다. */
  ratings?: Map<string, RatingSummary>;
}

/** 이 배율보다 멀리 보면 핀에서 이름을 빼고 그림만 남긴다. 이름끼리 겹친다. */
const LABEL_MAX_LEVEL = 5;
/** 이 레벨부터(더 멀리 보면) 몰린 핀을 묶는다. */
const CLUSTER_MIN_LEVEL = 3;

interface Pin {
  overlay: KakaoCustomOverlay;
  el: HTMLButtonElement;
  zIndex: number;
}

type Phase = 'loading' | 'ready' | 'error';

interface Trouble {
  title: string;
  detail: string;
  retryable: boolean;
}

function troubleOf(error: unknown): Trouble {
  if (error instanceof KakaoLoadError) {
    if (error.kind === 'no-key') {
      return {
        title: '지도를 쓸 수 없어요',
        // 설정 방법은 개발 중에만 보여 준다. 배포 화면에 환경변수 이름이 뜨면 사용자는 할 수 있는 게 없다.
        detail: import.meta.env.DEV
          ? '.env.local 파일에 VITE_KAKAO_JS_KEY를 넣고 개발 서버를 다시 실행해 주세요. 점심 고르기와 가게 목록은 그대로 쓸 수 있어요.'
          : '지도 설정이 아직 안 돼 있어요. 점심 고르기와 가게 목록은 그대로 쓸 수 있어요.',
        retryable: false,
      };
    }
    return {
      title: '지도를 불러오지 못했어요',
      detail: import.meta.env.DEV
        ? '도메인이 등록되지 않았을 수 있어요. 카카오 개발자 콘솔의 앱 > 플랫폼 > Web 사이트 도메인에 ' +
          `${window.location.origin} 이 있는지 확인해 주세요.`
        : '잠시 뒤 다시 시도해 주세요. 점심 고르기와 가게 목록은 그대로 쓸 수 있어요.',
      retryable: true,
    };
  }
  console.error(error);
  return {
    title: '지도를 그리지 못했어요',
    // 원인 문구는 개발자용 영어라 화면엔 할 일만 쓰고, 원문은 콘솔에 남긴다(10/14).
    detail: '잠시 뒤 다시 해 볼까요? 점심 고르기와 가게 목록은 그대로 쓸 수 있어요.',
    retryable: true,
  };
}

export default function MapTab({
  places,
  onChanged,
  onOfficeChanged,
  todayId = null,
  recentIds,
  focusId = null,
  ratings,
}: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  // 꺼 둔 가게 핀을 보일지. 기본은 숨긴다 — 꺼 둔 샘플 가게가 시청 근처에
  // 몰려 진짜 후보 핀을 가리고 화면 맞춤까지 넓혔다(10/9 실측). 켜진 가게가
  // 하나도 없으면 다시 켤 가게를 찾아야 하니 보인다.
  // 목록에서 꺼 둔 가게를 보러 왔으면 그 핀이 보여야 한다.
  // 지도에서만 쓰는 카테고리 거르기. 오늘 탭 조건과는 따로다(보기만 바꾼다).
  const [mapCats, setMapCats] = useState<{ categories: string[]; subs: string[] }>({ categories: [], subs: [] });
  const [showOff, setShowOff] = useState(
    () => !places.some((p) => p.active) || places.some((p) => p.id === focusId && !p.active),
  );
  const [far, setFar] = useState(false);
  // 끄기·켜기 실패. 어느 가게 것인지 같이 들고 있어야 다른 핀을 골랐을 때 안 남는다.
  const [toggleProblem, setToggleProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [editing, setEditing] = useState(false);
  /** 지도를 한 번 누른 자리의 메뉴. hits 가 null 이면 근처를 찾는 중. */
  const [tapMenu, setTapMenu] = useState<{ at: Coord; hits: NearbyHit[] | null; host: HTMLElement } | null>(null);
  const tapOverlayRef = useRef<KakaoCustomOverlay | null>(null);
  const tapMenuOpenRef = useRef(false);
  // 리스너 effect 는 phase 로만 다시 걸린다. 최신 가게 목록·여는 함수는 ref 로 읽는다.
  const openTapMenuRef = useRef<(at: Coord, px: number, py: number) => void>(() => {});

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const searchSeq = useRef(0);
  const [searching, setSearching] = useState(false);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  // 회사 위치를 지도에서 찍는 중이면, 짧게 누른 자리를 이 함수로 넘긴다.
  const pickRef = useRef<((coord: Coord) => void) | null>(null);
  const clustererRef = useRef<KakaoMarkerClusterer | null>(null);
  const [removing, setRemoving] = useState<Place | null>(null);
  const officePinRef = useRef<{ setMap: (map: KakaoMap | null) => void } | null>(null);
  // 회사를 아직 안 정했으면 OfficeCard 가 여기에 "누른 자리를 회사 후보로" 를 걸어 둔다.
  /** 회사 후보 자리에 "새 회사" 핀을 꽂는다. 찾기로 고른 자리면 지도를 그리로 옮긴다. */
  const dropOfficePin = useCallback((coord: Coord, pan: boolean) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    const position = new maps.LatLng(coord.lat, coord.lng);
    officePinRef.current?.setMap(null);
    officePinRef.current = new maps.CustomOverlay({
      position,
      content: '<div class="map__office map__office--new">새 회사</div>',
      map,
      yAnchor: 0.5,
      zIndex: 8,
    });
    if (pan) map.panTo(position);
  }, []);
  const officeTapRef = useRef<((coord: Coord) => void) | null>(null);
  // 회사를 정하기 전에는 가게 찾기·넣기를 숨긴다. 기준이 없으면 도보 시간이 다 틀린다.
  const officeSet = officeSource() === 'saved';
  const [picking, setPicking] = useState(false);
  const markersRef = useRef<Map<string, Pin>>(new Map());
  const placesRef = useRef(places);
  placesRef.current = places;
  const tempMarkerRef = useRef<KakaoMarker | null>(null);
  const fittedRef = useRef(false);
  const resizeRef = useRef<ResizeObserver | null>(null);

  // 지도에 그려진 가게(꺼짐·카테고리 거르기 반영), 가까운 순.
  const nearby = useMemo(
    () =>
      places
        .filter((p) => (p.active || showOff) && matchesCategory(p, mapCats))
        .sort((a, b) => a.walkMin - b.walkMin || a.name.localeCompare(b.name, 'ko')),
    [places, showOff, mapCats],
  );

  // 지금 지도에 그릴 수 있는 가게들의 카테고리. 없는 카테고리 칩은 안 만든다.
  // 지도에 그릴 수 있는 가게. 칩은 이 가게들이 가진 메뉴·세부만 만든다.
  const mapPool = useMemo(
    () => places.filter((p) => p.active || showOff).map((p) => ({ ...p, active: true })),
    [places, showOff],
  );

  const selected = useMemo(() => places.find((p) => p.id === selectedId) ?? null, [places, selectedId]);
  const pickMapCats = (next: { categories: string[]; subs: string[] }) => {
    setMapCats(next);
    // 고른 가게 핀이 숨으면 정보 카드만 덩그러니 남는다.
    if (selected && !matchesCategory(selected, next)) setSelectedId(null);
  };

  const retry = useCallback(() => {
    // 기억한 실패를 여기서만 지운다. 탭 진입은 요청을 다시 내지 않는다.
    clearKakaoLoadFailure();
    setAttempt((n) => n + 1);
  }, []);

  /* 1. SDK 를 받아 지도를 한 번 만든다. */
  useEffect(() => {
    let cancelled = false;
    let unlistenZoom = () => {};
    setPhase('loading');
    setTrouble(null);
    fittedRef.current = false;

    loadKakaoMaps()
      .then((maps) => {
        if (cancelled) return;
        const el = containerRef.current;
        if (!el) return;

        const office = officeCoord();

        // StrictMode 는 이펙트를 두 번 돌린다. 지우지 않으면 지도가 두 장 쌓인다.
        el.innerHTML = '';
        markersRef.current.clear();

        const center = new maps.LatLng(office.lat, office.lng);
        const map = new maps.Map(el, { center, level: 4 });
        mapsRef.current = maps;
        mapRef.current = map;
        // 가게가 몰린 동네(대학가 등)는 핀이 서로 덮였다. 가까이(레벨 2 이하) 보면 다 펼치고,
        // 그보다 멀면 50px 안 세 곳 이상을 "N곳" 하나로 묶는다. 누르면 그 자리로 확대한다.
        // 동그라미 모양은 카카오가 인라인 스타일로만 받는다 — 지도 위라 테마와 상관없이 어두운 색.
        clustererRef.current = maps.MarkerClusterer
          ? new maps.MarkerClusterer({
              map,
              averageCenter: true,
              minLevel: CLUSTER_MIN_LEVEL,
              gridSize: 50,
              minClusterSize: 3,
              texts: (count) => `${count}곳`,
              calculator: [1000],
              styles: [
                {
                  minWidth: '44px',
                  height: '32px',
                  padding: '0 10px',
                  lineHeight: '28px',
                  borderRadius: '999px',
                  border: '2px solid #ffffff',
                  background: '#1f1f1f',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: '700',
                  textAlign: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,.3)',
                },
              ],
            })
          : null;
        // 묶음 동그라미가 회사 표시·도보 원 라벨 밑에 깔려 "6곳" 이 안 보였다. 그려질 때마다 위로 올린다.
        if (clustererRef.current) {
          maps.event.addListener(
            clustererRef.current,
            'clustered',
            (clusters: { getClusterMarker: () => KakaoCustomOverlay }[]) => {
              for (const c of clusters) c.getClusterMarker().setZIndex(6);
            },
          );
        }

        new maps.CustomOverlay({
          position: center,
          content: '<div class="map__office">🏢 회사</div>',
          map,
          yAnchor: 0.5,
          zIndex: 5,
        });

        // 도보 눈금. 반지름은 도보 산식의 역산이고, 판정선이 아니라 눈금이다.
        for (const step of WALK_STEPS) {
          new maps.Circle({
            center,
            radius: metersForWalkMinutes(step),
            // 1px·0.35 로는 카카오 지도 위에서 안 보인다. 실제로 안 보였다.
            strokeWeight: 2,
            // 지도 타일은 다크 모드에서도 밝다. --color-text 를 꺼내 쓰면 다크에서 흰 선이 되어
            // 원이 사라졌다(10/14). 타일 위 선이라 테마와 상관없이 어두운 색으로 고정한다.
            strokeColor: '#1f1f1f',
            strokeOpacity: 0.6,
            strokeStyle: 'shortdash',
            fillOpacity: 0,
            map,
          });
          // 원 위쪽 끝에 몇 분짜리 원인지 쓴다. 지도 아래 안내 한 줄로는 어느 원이
          // 어느 것인지 안 읽혔다(15회차 리뷰). 위도 1도 ≈ 111.32km.
          new maps.CustomOverlay({
            position: new maps.LatLng(office.lat + metersForWalkMinutes(step) / 111_320, office.lng),
            content: `<span class="map__ring">도보 ${step}분</span>`,
            map,
            yAnchor: 0.5,
            zIndex: 1,
          });
        }

        /*
         * 카카오는 만들 때의 컨테이너 크기를 기억한다. 그 뒤에 폭이 바뀌면
         * 타일이 예전 크기만큼만 깔려 오른쪽이 비어 보인다 — 실제로 그랬다.
         * 검색 결과가 위에 붙고 빠질 때마다 높이가 바뀌므로 한 번 부르고 마는
         * 걸로는 부족하다. 컨테이너를 계속 지켜본다.
         */
        // 멀리 보면 이름이 서로 덮는다. 배율을 지켜보고 이름을 접는다.
        setFar(map.getLevel() > LABEL_MAX_LEVEL);
        const onZoom = () => setFar(map.getLevel() > LABEL_MAX_LEVEL);
        maps.event.addListener(map, 'zoom_changed', onZoom);
        unlistenZoom = () => maps.event.removeListener(map, 'zoom_changed', onZoom);

        const observer = new ResizeObserver(() => map.relayout());
        observer.observe(el);
        resizeRef.current = observer;
        map.relayout();

        setPhase('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setTrouble(troubleOf(error));
        setPhase('error');
      });

    return () => {
      cancelled = true;
      unlistenZoom();
      resizeRef.current?.disconnect();
      resizeRef.current = null;
    };
  }, [attempt]);

  /* 2. 가게가 바뀌면 마커만 갈아 끼운다. */
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (phase !== 'ready' || !maps || !map) return;

    for (const pin of markersRef.current.values()) pin.overlay.setMap(null);
    markersRef.current.clear();
    clustererRef.current?.clear();
    const clustered: KakaoCustomOverlay[] = [];

    const bounds = new maps.LatLngBounds();
    const office = officeCoord();
    bounds.extend(new maps.LatLng(office.lat, office.lng));

    for (const place of places) {
      const position = new maps.LatLng(place.lat, place.lng);
      if (place.active || showOff) bounds.extend(position);
      const today = place.id === todayId;
      const el = pinElement(place, today, ratings?.get(place.id)?.average, recentIds?.has(place.id));
      el.addEventListener('click', () => {
        closeTapMenuRef.current();
        setSelectedId(place.id);
        setEditing(false);
      });
      // 켜진 가게가 꺼진 가게를 덮고, 오늘 정한 곳이 맨 위.
      const zIndex = today ? 4 : place.active ? 3 : 2;
      // 올린 핀은 겹친 핀들 위로 올라와야 이름이 다 보인다(10/14 사용자: 지도에 반응이 없다).
      el.addEventListener('mouseenter', () => markersRef.current.get(place.id)?.overlay.setZIndex(7));
      el.addEventListener('mouseleave', () => markersRef.current.get(place.id)?.overlay.setZIndex(zIndex));
      const shown = (place.active || showOff) && matchesCategory(place, mapCats);
      // 오늘 정한 곳은 묶지 않는다. 멀리 봐도 어디인지 보여야 한다.
      const cluster = shown && !today && clustererRef.current !== null;
      const overlay = new maps.CustomOverlay({
        position,
        content: el,
        map: shown && !cluster ? map : undefined,
        // 핀 위에서 누른 것은 지도로 넘기지 않는다. 안 그러면 핀을 누르다 지도가 끌린다.
        clickable: true,
        yAnchor: 1,
        zIndex,
      });
      markersRef.current.set(place.id, { overlay, el, zIndex });
      if (cluster) clustered.push(overlay);
    }
    clustererRef.current?.addMarkers(clustered);

    // 목록에서 골라 들어왔으면 화면 맞춤 대신 그 가게로 가까이 간다. 처음 한 번만.
    const focus = places.find((p) => p.id === focusId);
    if (!fittedRef.current && focus) {
      fittedRef.current = true;
      map.setLevel(3);
      map.panTo(new maps.LatLng(focus.lat, focus.lng));
      // 휴대폰에선 지도가 회사 카드·검색 아래에 있다. 고른 핀이 화면에 들어오게.
      containerRef.current?.scrollIntoView?.({ block: 'center' });
    }

    // 처음 한 번만 맞춘다. 매번 맞추면 가게를 넣을 때마다 화면이 튄다.
    if (!fittedRef.current && places.length > 0) {
      fittedRef.current = true;
      map.setBounds(bounds, 48, 32, 48, 32);
    }
  }, [places, phase, todayId, recentIds, showOff, focusId, mapCats, ratings]);

  /* 고른 가게 핀을 강조하고 맨 위로 올린다. */
  useEffect(() => {
    for (const [id, pin] of markersRef.current) {
      const on = id === selectedId;
      pin.el.classList.toggle('map__pin--on', on);
      pin.el.setAttribute('aria-pressed', String(on));
      pin.overlay.setZIndex(on ? 6 : pin.zIndex);
    }
  }, [selectedId, places, phase, todayId, recentIds, showOff, mapCats, ratings]);

  /* 3. 길게 눌러 핀 꽂기. */
  useEffect(() => {
    const el = containerRef.current;
    if (phase !== 'ready' || !el) return;

    let timer = 0;
    let start: { x: number; y: number } | null = null;

    const clear = () => {
      window.clearTimeout(timer);
      timer = 0;
      start = null;
    };

    const onDown = (e: PointerEvent) => {
      const maps = mapsRef.current;
      const map = mapRef.current;
      if (!maps || !map) return;
      // 핀을 누른 건 가게 고르기다. 길게 눌러도 새 가게를 꽂지 않는다.
      if (e.target instanceof Element && e.target.closest('.map__pin, .map-add')) return;
      start = { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // 회사 위치를 찍는 중에는 길게 눌러 가게 넣기를 끈다. 짧은 탭은 onUp 이 받는다.
      if (pickRef.current) return;

      timer = window.setTimeout(() => {
        const coords = map.getProjection().coordsFromContainerPoint(new maps.Point(px, py));
        const lat = coords.getLat();
        const lng = coords.getLng();

        tempMarkerRef.current?.setMap(null);
        tempMarkerRef.current = new maps.Marker({
          position: coords,
          map,
          zIndex: 9,
        });

        setSelectedId(null);
        setDraft({ lat, lng, name: '' });
        closeTapMenuRef.current();
        clear();
      }, LONG_PRESS_MS);
    };

    const onMove = (e: PointerEvent) => {
      if (!start) return;
      // 지도를 끌고 있는 중이면 핀을 꽂지 않는다.
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_TOLERANCE_PX) clear();
    };

    // 캡처로 받는다. 카카오가 안쪽에서 전파를 끊어도 여기는 먼저 지난다.
    el.addEventListener('pointerdown', onDown, { capture: true });
    el.addEventListener('pointermove', onMove, { capture: true });
    // 회사 위치 찍기: 끌지 않고 눌렀다 뗀 자리. 끌었으면 onMove 가 start 를 지웠다.
    const onUp = (e: PointerEvent) => {
      const maps = mapsRef.current;
      const map = mapRef.current;
      const pick = pickRef.current ?? officeTapRef.current;
      if (pick && start && maps && map) {
        const rect = el.getBoundingClientRect();
        const coords = map
          .getProjection()
          .coordsFromContainerPoint(new maps.Point(e.clientX - rect.left, e.clientY - rect.top));
        dropOfficePin({ lat: coords.getLat(), lng: coords.getLng() }, false);
        pickRef.current = null;
        setPicking(false);
        pick({ lat: coords.getLat(), lng: coords.getLng() });
      } else if (start && timer && maps && map) {
        // 끌지 않고 짧게 누르고 뗐다. 메뉴가 떠 있으면 닫기만, 아니면 그 자리에 메뉴를 연다.
        if (tapMenuOpenRef.current) {
          closeTapMenuRef.current();
        } else {
          const rect = el.getBoundingClientRect();
          const coords = map
            .getProjection()
            .coordsFromContainerPoint(new maps.Point(e.clientX - rect.left, e.clientY - rect.top));
          openTapMenuRef.current(
            { lat: coords.getLat(), lng: coords.getLng() },
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
        }
      }
      clear();
    };

    el.addEventListener('pointerup', onUp, { capture: true });
    el.addEventListener('pointercancel', clear, { capture: true });
    el.addEventListener('pointerleave', clear, { capture: true });

    return () => {
      clear();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', onUp, { capture: true });
      el.removeEventListener('pointercancel', clear, { capture: true });
      el.removeEventListener('pointerleave', clear, { capture: true });
    };
  }, [phase, dropOfficePin]);

  const closeTapMenu = useCallback(() => {
    tapOverlayRef.current?.setMap(null);
    tapOverlayRef.current = null;
    tapMenuOpenRef.current = false;
    setTapMenu(null);
  }, []);
  const closeTapMenuRef = useRef(closeTapMenu);

  const openTapMenu = (at: Coord, px: number, py: number) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    tapOverlayRef.current?.setMap(null);
    // 빈 상자로 만들어 두고 React 가 채운다. 카카오는 만들 때 크기로 anchor 를 잡으므로
    // 상자는 크기 0 인 점으로 두고, 메뉴는 CSS 로 그 점 위에 띄운다(mapAdd.css).
    const host = document.createElement('div');
    host.className = 'map-add__anchor';
    const position = new maps.LatLng(at.lat, at.lng);
    tapOverlayRef.current = new maps.CustomOverlay({ position, content: host, map, clickable: true, zIndex: 10 });
    // 메뉴(폭 220, 높이 최대 약 250)가 지도 밖으로 나가지 않게 지도를 살짝 민다.
    const box = containerRef.current?.getBoundingClientRect();
    if (box) {
      const dx = px < 120 ? px - 120 : px > box.width - 120 ? px - (box.width - 120) : 0;
      const dy = py < 260 ? py - 260 : 0;
      if (dx || dy) (map as KakaoMap & { panBy?: (x: number, y: number) => void }).panBy?.(dx, dy);
    }
    tapMenuOpenRef.current = true;
    setTapMenu({ at, hits: null, host });
    // 데모 등 장소 검색이 없으면 "직접 넣기" 만 남긴다.
    const Places = maps.services?.Places;
    if (!Places) return setTapMenu((m) => (m?.host === host ? { ...m, hits: [] } : m));
    const places = new Places() as InstanceType<typeof Places> & {
      categorySearch?: (
        code: string,
        cb: (data: KakaoPlace[], status: string) => void,
        opts: { location: unknown; radius: number; sort?: string },
      ) => void;
    };
    if (!places.categorySearch) return setTapMenu((m) => (m?.host === host ? { ...m, hits: [] } : m));
    places.categorySearch(
      'FD6',
      (data, status) => {
        const hits = status === maps.services.Status.OK ? nearbyHits(placesRef.current, at, data) : [];
        setTapMenu((m) => (m?.host === host ? { ...m, hits } : m));
      },
      { location: position, radius: TAP_RADIUS_M, sort: 'distance' },
    );
  };
  // 지도 이벤트 리스너는 한 번만 걸고, 늘 최신 함수를 부르도록 ref 로 넘긴다. 렌더 중엔 ref 를 바꾸지 않는다.
  useEffect(() => {
    closeTapMenuRef.current = closeTapMenu;
    openTapMenuRef.current = openTapMenu;
  });

  // 메뉴가 떠 있으면 Esc 로 닫는다.
  useEffect(() => {
    if (!tapMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTapMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tapMenu, closeTapMenu]);
  // 지도가 다시 만들어지거나 탭을 떠나면 메뉴도 걷는다.
  useEffect(() => () => tapOverlayRef.current?.setMap(null), [attempt]);

  const dropTempPin = useCallback(() => {
    tempMarkerRef.current?.setMap(null);
    tempMarkerRef.current = null;
  }, []);

  const closeDraft = useCallback(() => {
    setDraft(null);
    dropTempPin();
  }, [dropTempPin]);

  // 폼이 열리면 화면 안으로. 휴대폰에선 지도 아래라 안 보일 수 있다.
  const draftRef = useRef<HTMLElement>(null);
  // 목록에서 가게를 고르면 단추가 사라지므로 초점을 그 가게 카드로 옮긴다.
  const selCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (draft) draftRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [draft]);

  const goTo = useCallback(
    (place: Place) => {
      const maps = mapsRef.current;
      const map = mapRef.current;
      setDraft(null);
      dropTempPin();
      setSelectedId(place.id);
      setEditing(false);
      if (maps && map) {
        // 묶인 동그라미 속에 있으면 고른 핀이 안 보인다. 묶음이 풀리는 데까지 다가간다.
        if (map.getLevel() >= CLUSTER_MIN_LEVEL) map.setLevel(CLUSTER_MIN_LEVEL - 1);
        map.panTo(new maps.LatLng(place.lat, place.lng));
      }
    },
    [dropTempPin],
  );

  const search = useCallback(async () => {
    const q = keyword.trim();
    if (!q) return;
    // 늦게 온 이전 응답이 최신 결과를 덮지 않게 순번을 붙인다(Combobox RADIO).
    const seq = ++searchSeq.current;
    setSearchProblem(null);
    setSearching(true);
    try {
      const maps = await loadKakaoMaps();
      const office = officeCoord();
      new maps.services.Places().keywordSearch(
        q,
        (data, status) => {
          if (seq !== searchSeq.current) return;
          setSearching(false);
          if (status === maps.services.Status.OK) {
            setResults(data.slice(0, MAX_RESULTS));
            return;
          }
          if (status === maps.services.Status.ZERO_RESULT) {
            setResults([]);
            setSearchProblem('회사 근처에서 찾지 못했어요. 지점 이름까지 넣어 볼까요?');
            return;
          }
          // 대개 카카오 콘솔에 이 도메인이 없어서다. 쓰는 사람에겐 할 일만, 원인은 콘솔에.
          console.warn(
            `카카오 장소 검색 실패(${status}). 콘솔 사이트 도메인에 ${window.location.origin} 이 있는지 확인하세요.`,
          );
          setSearchProblem('지금은 검색이 안 돼요. 잠시 뒤 다시 해 볼까요?');
        },
        {
          location: new maps.LatLng(office.lat, office.lng),
          radius: SEARCH_RADIUS_M,
          size: MAX_RESULTS,
        },
      );
    } catch (error) {
      setSearching(false);
      console.error(error);
      setSearchProblem('지금은 검색이 안 돼요. 잠시 뒤 다시 해 볼까요?');
    }
  }, [keyword]);

  const pickResult = useCallback((hit: KakaoPlace) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const lat = Number(hit.y);
    const lng = Number(hit.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setSearchProblem('좌표를 읽지 못했어요. 다른 결과를 골라 주세요.');
      return;
    }
    setResults([]);
    setKeyword('');
    setSelectedId(null);
    if (maps && map) {
      const position = new maps.LatLng(lat, lng);
      tempMarkerRef.current?.setMap(null);
      tempMarkerRef.current = new maps.Marker({ position, map, zIndex: 9 });
      map.panTo(position);
    }
    setDraft({
      lat,
      lng,
      name: hit.place_name,
      kakaoCategory: hit.category_name,
      kakaoPlaceId: hit.id,
      address: hit.road_address_name || hit.address_name,
    });
  }, []);

  const hoverPin = (id: string, on: boolean) => {
    const pin = markersRef.current.get(id);
    if (!pin) return;
    pin.el.classList.toggle('map__pin--hover', on);
    pin.overlay.setZIndex(on ? 7 : pin.zIndex);
  };

  const goOffice = () => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) return;
    const office = officeCoord();
    map.setLevel(4);
    map.panTo(new maps.LatLng(office.lat, office.lng));
  };

  const startPick = (onPick: (coord: Coord) => void) => {
    pickRef.current = onPick;
    setPicking(true);
  };
  const cancelPick = () => {
    pickRef.current = null;
    setPicking(false);
    officePinRef.current?.setMap(null);
    officePinRef.current = null;
  };

  const getMapCenter = (): Coord | null => {
    const c = mapRef.current?.getCenter();
    return c ? { lat: c.getLat(), lng: c.getLng() } : null;
  };

  if (phase === 'error' && trouble) {
    return (
      <section className="map map--trouble">
        {/* 지도가 없어도 GPS 로는 회사 위치를 정할 수 있다. */}
        <OfficeCard onSaved={onOfficeChanged} />
        {/* 지도 자리에 같은 크기의 점선 상자를 두고 안에서 알린다(docs/handoff/6 · 5e). */}
        <div className="map__troubleBox" role="alert">
          <span className="map__troubleArt" aria-hidden="true">
            🗺️
          </span>
          <p className="map__troubleTitle">{trouble.title}</p>
          <p className="muted small">{trouble.detail}</p>
          {trouble.retryable && (
            <Button variant="secondary" onClick={retry}>
              다시 시도
            </Button>
          )}
        </div>
        <p className="muted small">
          {kakaoJsKey()
            ? '지도가 없어도 점심 고르기와 가게 목록은 그대로 쓸 수 있어요.'
            : '지도 키가 없어도 점심 고르기와 가게 목록은 쓸 수 있어요. 지도는 나중에 설정해도 돼요.'}
        </p>
      </section>
    );
  }

  return (
    <section className="map">
      {/* 오른쪽 칸 위 — 회사 위치·찾기. 휴대폰에선 display: contents 라 순서만 그대로. */}
      <div className="map__side map__side--head">
        <OfficeCard
          getMapCenter={phase === 'ready' ? getMapCenter : undefined}
          onStartPick={phase === 'ready' ? startPick : undefined}
          onCancelPick={cancelPick}
          picking={picking}
          onPreview={phase === 'ready' ? (c) => dropOfficePin(c, true) : undefined}
          tapRef={officeTapRef}
          onSaved={onOfficeChanged}
        />
        {officeSet && (
          <>
            <SearchField
              value={keyword}
              onChange={setKeyword}
              onSearch={() => void search()}
              loading={searching}
              placeholder="가게 이름이나 지점으로 찾기"
              label="가게 이름이나 지점으로 찾기"
            />
            {searchProblem && (
              <p className="notice notice--empty" role="alert">
                {searchProblem}
              </p>
            )}
            {/* 결과 수는 화면에 따로 안 쓰지만 화면 낭독기에는 알린다. 늘 있어야 바뀐 걸 읽는다. */}
            <p className="sr-only" role="status">
              {!searching && results.length > 0 ? `${results.length}곳 찾았어요` : ''}
            </p>

            {results.length > 0 && (
              <ul className="add__results">
                {results.map((hit) => (
                  <li key={hit.id}>
                    <button type="button" className="add__hit" onClick={() => pickResult(hit)}>
                      <strong>{hit.place_name}</strong>
                      <span className="muted small">{hit.road_address_name || hit.address_name}</span>
                      <span className="muted small">{hit.category_name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* 데스크톱에서는 지도가 왼쪽 큰 칸을 차지하고, 나머지는 오른쪽에 쌓인다. */}
      <div className="map__main">
        {phase === 'ready' && (
          // 오늘 탭과 같은 메뉴 > 세부 칩. 지도에서는 보기만 거른다(오늘 후보 조건과 따로다).
          <CategoryChips
            places={mapPool}
            selected={mapCats.categories}
            subs={mapCats.subs}
            onToggle={(c) =>
              pickMapCats({
                categories: mapCats.categories.includes(c)
                  ? mapCats.categories.filter((x) => x !== c)
                  : [...mapCats.categories, c],
                subs: [],
              })
            }
            onToggleSub={(sub) =>
              pickMapCats({
                ...mapCats,
                subs: mapCats.subs.includes(sub) ? mapCats.subs.filter((x) => x !== sub) : [...mapCats.subs, sub],
              })
            }
            onClear={() => pickMapCats({ categories: [], subs: [] })}
            onClearSubs={() => pickMapCats({ ...mapCats, subs: [] })}
          />
        )}
        {phase === 'ready' && places.some((p) => !p.active) && (
          <Checkbox
            className="map__toggle"
            layout="inline"
            label="꺼 둔 가게도 보기"
            checked={showOff}
            onCheckedChange={(v) => setShowOff(v === true)}
          />
        )}
        <div
          className={['map__frame', picking && 'map__frame--picking', far && 'map__frame--far']
            .filter(Boolean)
            .join(' ')}
        >
          <div className="map__canvas" ref={containerRef} aria-label="점심 지도" />
          {/* "지도 가운데로" 의 가운데가 어디인지 보여 주는 십자. 지도 조작은 막지 않는다. */}
          <span className="map__crosshair" aria-hidden="true" />
          {/* 지도를 끌다 보면 회사가 어디였는지 잃는다. 한 번에 돌아온다. */}
          {phase === 'ready' && (
            <button type="button" className="map__home" onClick={goOffice}>
              <span aria-hidden="true">🏢 </span>회사로
            </button>
          )}
          {/* SDK·타일을 받는 동안 빈 회색 칸만 보이면 고장 난 것 같았다 — 스피너를 지도 위에 띄운다. */}
          {phase === 'loading' && (
            <div className="map__loading">
              <Spinner size={32} style={{ borderRadius: '50%' }} aria-label="지도를 불러오고 있어요" />
              <span className="muted small">지도를 불러오고 있어요</span>
            </div>
          )}
        </div>

        {phase === 'ready' && (
          <p className="muted small">
            원은 도보 {WALK_STEPS.join('·')}분 거리예요.{' '}
            {officeSet ? '지도를 누르면 가게를 넣을 수 있어요.' : '지도를 누르면 그 자리를 회사로 정할 수 있어요.'}
          </p>
        )}
      </div>

      {/* 오른쪽 칸 아래 — 고른 가게·근처 목록·넣기 폼. 데스크톱에선 이 칸만 넘긴다. */}
      <div className="map__side map__side--body">
        {selected && !draft && (
          <div className="mp__card" ref={selCardRef} tabIndex={-1} role="region" aria-label={selected.name}>
            {editing ? (
              <PlaceEdit
                place={selected}
                onDone={() => {
                  setEditing(false);
                  onChanged();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="mp__head">
                  <div>
                    <strong>{selected.name}</strong>
                    <p className="muted small">
                      {categoryLabel(selected)} · 도보 {selected.walkMin}분
                      {selected.price ? ` · ${selected.price}` : ''}
                    </p>
                  </div>
                  <button type="button" className="linkish" onClick={() => setSelectedId(null)}>
                    닫기
                  </button>
                </div>
                <RatingBadge summary={ratings?.get(selected.id)} />
                <RatingReviews summary={ratings?.get(selected.id)} />
                {selected.memo && <p className="muted small">{selected.memo}</p>}
                {!selected.active && <span className="badge">꺼짐</span>}
                {toggleProblem === selected.id && (
                  <p className="notice notice--empty" role="alert">
                    바꾸지 못했어요. 잠시 뒤 다시 해 주세요.
                  </p>
                )}
                <div className="row">
                  <Button block size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    고치기
                  </Button>
                  <Button
                    block
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setToggleProblem(null);
                      updatePlace(selected.id, { active: !selected.active })
                        .then(onChanged)
                        .catch(() => setToggleProblem(selected.id));
                    }}
                  >
                    {selected.active ? '끄기' : '켜기'}
                  </Button>
                  <Button block size="sm" variant="secondary" tone="danger" onClick={() => setRemoving(selected)}>
                    지우기
                  </Button>
                </div>
                <div className="mp__links">
                  <DirectionsLink place={selected} />
                  <a className="dir-link" href={kakaoPlaceUrl(selected)} target="_blank" rel="noopener noreferrer">
                    <span aria-hidden="true">📍 </span>카카오맵에서 보기
                    <span className="sr-only"> (메뉴·사진·영업시간, 새 탭)</span>
                  </a>
                </div>
                <RatingEditor key={selected.id} placeId={selected.id} summary={ratings?.get(selected.id)} />
              </>
            )}
          </div>
        )}

        {/*
         * 아무 핀도 안 고르면 데스크톱 오른쪽 칸이 회사 카드·검색창만 남아 텅 비었다(10/9 리뷰).
         * 지금 지도에 그려진 가게를 가까운 순으로 보여 주고, 누르면 그 핀으로 간다.
         * 휴대폰에서도 지도 아래에 둔다. 카카오 핀은 키보드로 못 고르니 이 목록이 그 대안이다(10/10 접근성 리뷰).
         */}
        {phase === 'ready' && !selected && !draft && results.length === 0 && nearby.length > 0 && (
          <section className="mp__card mp__nearby" aria-labelledby="nearby-title">
            <h3 id="nearby-title" className="mp__title">
              이 근처 가게 {nearby.length}곳
            </h3>
            <ul className="mp__nearList">
              {nearby.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="mp__near"
                    // 목록에 올리면 지도에서 그 핀이 어디인지 같이 보여 준다.
                    onMouseEnter={() => hoverPin(p.id, true)}
                    onMouseLeave={() => hoverPin(p.id, false)}
                    onFocus={() => hoverPin(p.id, true)}
                    onBlur={() => hoverPin(p.id, false)}
                    onClick={() => {
                      goTo(p);
                      requestAnimationFrame(() => {
                        selCardRef.current?.focus({ preventScroll: true });
                        selCardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
                      });
                    }}
                  >
                    <span className="mp__nearName">
                      <span aria-hidden="true">{categoryIcon(p.sub ?? p.category)} </span>
                      {p.name}
                      {p.id === todayId && <span className="badge">오늘</span>}
                    </span>
                    <span className="muted small">
                      {ratings?.get(p.id) && (
                        <>
                          <RatingBadge summary={ratings.get(p.id)} />
                          {' · '}
                        </>
                      )}
                      도보 {p.walkMin}분
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/*
         * 새 가게 폼. 예전엔 모달 시트였는데 지도를 덮어 방금 찍은 자리를 볼 수
         * 없었다(10/9 사용자). 데스크톱은 오른쪽 검색 아래, 휴대폰은 지도 아래에
         * 붙는다. 지도는 그대로 보이고 임시 핀도 남는다.
         */}
        {draft && (
          <section
            ref={draftRef}
            className="mp__card mp__card--form"
            aria-labelledby="draft-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeDraft();
            }}
          >
            <div className="mp__head">
              <h3 id="draft-title" className="mp__title">
                이 위치에 가게를 넣을까요?
              </h3>
              <button type="button" className="linkish" onClick={closeDraft}>
                닫기
              </button>
            </div>
            <PlaceForm
              key={`${draft.lat},${draft.lng},${draft.name}`}
              draft={draft}
              places={places}
              onSaved={() => {
                closeDraft();
                onChanged();
              }}
              onCancel={closeDraft}
              onGoTo={goTo}
            />
          </section>
        )}
      </div>
      {tapMenu && (
        <MapAddMenu
          host={tapMenu.host}
          hits={tapMenu.hits}
          onClose={closeTapMenu}
          onPick={(hit) => {
            closeTapMenu();
            pickResult(hit);
          }}
          onGoTo={(place) => {
            closeTapMenu();
            goTo(place);
          }}
          onDirect={() => {
            const { at } = tapMenu;
            closeTapMenu();
            const maps = mapsRef.current;
            const map = mapRef.current;
            if (maps && map) {
              tempMarkerRef.current?.setMap(null);
              tempMarkerRef.current = new maps.Marker({ position: new maps.LatLng(at.lat, at.lng), map, zIndex: 9 });
            }
            setSelectedId(null);
            setDraft({ lat: at.lat, lng: at.lng, name: '' });
          }}
        />
      )}
      <RemovePlaceSheet
        place={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          setSelectedId(null);
          onChanged();
        }}
      />
    </section>
  );
}

/**
 * 정보 카드 안의 수정. 좌표는 여기서 못 고친다 — 목록 탭이 맡는다.
 * 지도에서 좌표를 숫자로 치게 하면 아무도 안 쓰고, 핀을 옮기는 UI 는
 * 새로 꽂는 것과 구분이 안 된다.
 */
function PlaceEdit({ place, onDone, onCancel }: { place: Place; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState<string | null>(
    (CATEGORIES as readonly string[]).includes(place.category) ? (place.sub ?? place.category) : null,
  );
  const [price, setPrice] = useState<PriceBand | null>(place.price ?? null);
  const [memo, setMemo] = useState(place.memo ?? '');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setProblem('이름을 넣어 주세요.');
    if (!category) return setProblem('카테고리를 골라 주세요.');
    setSaving(true);
    setProblem(null);
    try {
      await updatePlace(place.id, {
        name: trimmed,
        category,
        price: price ?? undefined,
        memo: memo.trim() || undefined,
      });
      onDone();
    } catch (error) {
      setProblem(String((error as Error)?.message ?? error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pf">
      <Input
        label="이름"
        fieldProps={{ className: 'pf__field' }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        aria-required="true"
        autoFocus
      />
      <div className="pf__field">
        <span className="filters__label">카테고리</span>
        <CategoryPicker value={category} onPick={setCategory} />
      </div>
      <div className="pf__field">
        <span className="filters__label">가격대</span>
        <ChipPicker label="가격대" options={PRICE_BANDS} value={price} onPick={setPrice} allowNone />
      </div>
      <Textarea
        label="메모"
        fieldProps={{ className: 'pf__field' }}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={120}
        rows={2}
      />
      <p className="muted small">좌표와 도보 시간은 가게 목록에서 고칠 수 있어요.</p>
      {problem && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}
      <div className="row">
        <Button block onClick={() => void save()} loading={saving}>
          저장
        </Button>
        <Button block variant="secondary" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
