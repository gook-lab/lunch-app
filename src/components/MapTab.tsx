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
import { PRICE_BANDS, WALK_STEPS, type Place, type PriceBand, type Rating } from '../lib/candidates';
import { CATEGORIES, categoryIcon, type Category } from '../lib/category';
import { metersForWalkMinutes, officeCoord, type Coord } from '../lib/walk';
import { OfficeCard } from './map/OfficeCard';
import { pinElement } from './map/pin';
import {
  clearKakaoLoadFailure,
  KakaoLoadError,
  kakaoJsKey,
  loadKakaoMaps,
} from '../services/kakao';
import { updatePlace } from '../services/lunch';
import type { KakaoCustomOverlay, KakaoMap, KakaoMaps, KakaoMarker, KakaoPlace } from '../types/kakao';
import { PlaceForm, type PlaceDraft } from './map/PlaceForm';

/** 이만큼 누르고 있으면 핀을 꽂는다. */
const LONG_PRESS_MS = 500;
/** 이보다 많이 움직이면 지도를 끌고 있는 것이다. 핀을 꽂지 않는다. */
const DRAG_TOLERANCE_PX = 10;
/** 회사 기준 검색 반경. 도보 60분(직선 약 3.1km)보다 넉넉하게 둔다. */
const SEARCH_RADIUS_M = 5000;
const MAX_RESULTS = 10;
const RATINGS: Rating[] = [1, 2, 3, 4, 5];

interface Props {
  places: Place[];
  onChanged: () => void;
  /** 회사 위치를 바꾼 뒤. 데이터를 다시 읽고 지도를 새 기준으로 다시 만든다. */
  onOfficeChanged: () => void;
  /** 오늘 정한 가게. 지도 핀에 "오늘" 표시를 단다. */
  todayId?: string | null;
  /** 목록에서 "지도" 를 눌러 들어왔으면 그 가게. 처음 한 번 그 핀으로 간다. */
  focusId?: string | null;
}

/** 이 배율보다 멀리 보면 핀에서 이름을 빼고 그림만 남긴다. 이름끼리 겹친다. */
const LABEL_MAX_LEVEL = 5;

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
        title: '카카오 JS 키가 없어요',
        detail:
          '.env.local 의 VITE_KAKAO_JS_KEY 를 채우고 개발 서버를 다시 띄워 주세요. 지도만 막히고 오늘·목록 탭은 그대로 쓸 수 있어요.',
        retryable: false,
      };
    }
    return {
      title: '지도 SDK 를 받지 못했어요',
      detail:
        '가장 흔한 원인은 도메인 미등록이에요. 카카오 개발자 콘솔 > 앱 > 플랫폼 > Web 사이트 도메인에 ' +
        `${window.location.origin} 이 있는지 확인해 주세요.`,
      retryable: true,
    };
  }
  return {
    title: '지도를 그리지 못했어요',
    // 원인 문구는 개발자용 영어일 수 있다. 안내를 앞에 두고 원문은 괄호로 남긴다.
    detail: `잠시 뒤 다시 시도해 주세요. (${String((error as Error)?.message ?? error)})`,
    retryable: true,
  };
}

function Stars({ value }: { value: Rating }) {
  return (
    <span className="mp__stars" aria-label={`별점 ${value}점`}>
      {RATINGS.map((n) => (
        <span key={n} className={n <= value ? 'mp__star mp__star--on' : 'mp__star'}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function MapTab({ places, onChanged, onOfficeChanged, todayId = null, focusId = null }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(focusId);
  // 꺼 둔 가게 핀을 보일지. 기본은 숨긴다 — 꺼 둔 샘플 가게가 시청 근처에
  // 몰려 진짜 후보 핀을 가리고 화면 맞춤까지 넓혔다(10/9 실측). 켜진 가게가
  // 하나도 없으면 다시 켤 가게를 찾아야 하니 보인다.
  // 목록에서 꺼 둔 가게를 보러 왔으면 그 핀이 보여야 한다.
  // 지도에서만 쓰는 카테고리 거르기. 오늘 탭 조건과는 따로다(보기만 바꾼다).
  const [mapCategory, setMapCategory] = useState<string | null>(null);
  const [showOff, setShowOff] = useState(
    () => !places.some((p) => p.active) || places.some((p) => p.id === focusId && !p.active),
  );
  const [far, setFar] = useState(false);
  // 끄기·켜기 실패. 어느 가게 것인지 같이 들고 있어야 다른 핀을 골랐을 때 안 남는다.
  const [toggleProblem, setToggleProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [editing, setEditing] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  // 회사 위치를 지도에서 찍는 중이면, 짧게 누른 자리를 이 함수로 넘긴다.
  const pickRef = useRef<((coord: Coord) => void) | null>(null);
  const officePinRef = useRef<{ setMap: (map: KakaoMap | null) => void } | null>(null);
  const [picking, setPicking] = useState(false);
  const markersRef = useRef<Map<string, Pin>>(new Map());
  const tempMarkerRef = useRef<KakaoMarker | null>(null);
  const fittedRef = useRef(false);
  const resizeRef = useRef<ResizeObserver | null>(null);

  // 지도에 그려진 가게(꺼짐·카테고리 거르기 반영), 가까운 순.
  const nearby = useMemo(
    () =>
      places
        .filter((p) => (p.active || showOff) && (mapCategory === null || p.category === mapCategory))
        .sort((a, b) => a.walkMin - b.walkMin || a.name.localeCompare(b.name, 'ko')),
    [places, showOff, mapCategory],
  );

  // 지금 지도에 그릴 수 있는 가게들의 카테고리. 없는 카테고리 칩은 안 만든다.
  const mapCategories = useMemo(
    () => [...new Set(places.filter((p) => p.active || showOff).map((p) => p.category))],
    [places, showOff],
  );

  const selected = useMemo(
    () => places.find((p) => p.id === selectedId) ?? null,
    [places, selectedId],
  );

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
            // 카카오는 CSS 변수를 못 읽는다. 토큰 값을 꺼내 넘긴다.
            strokeColor:
              getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() ||
              'black',
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

    const bounds = new maps.LatLngBounds();
    const office = officeCoord();
    bounds.extend(new maps.LatLng(office.lat, office.lng));

    for (const place of places) {
      const position = new maps.LatLng(place.lat, place.lng);
      if (place.active || showOff) bounds.extend(position);
      const today = place.id === todayId;
      const el = pinElement(place, today);
      el.addEventListener('click', () => {
        setSelectedId(place.id);
        setEditing(false);
      });
      // 켜진 가게가 꺼진 가게를 덮고, 오늘 정한 곳이 맨 위.
      const zIndex = today ? 4 : place.active ? 3 : 2;
      const overlay = new maps.CustomOverlay({
        position,
        content: el,
        map:
          (place.active || showOff) && (mapCategory === null || place.category === mapCategory)
            ? map
            : undefined,
        // 핀 위에서 누른 것은 지도로 넘기지 않는다. 안 그러면 핀을 누르다 지도가 끌린다.
        clickable: true,
        yAnchor: 1,
        zIndex,
      });
      markersRef.current.set(place.id, { overlay, el, zIndex });
    }

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
  }, [places, phase, todayId, showOff, focusId, mapCategory]);

  /* 고른 가게 핀을 강조하고 맨 위로 올린다. */
  useEffect(() => {
    for (const [id, pin] of markersRef.current) {
      const on = id === selectedId;
      pin.el.classList.toggle('map__pin--on', on);
      pin.el.setAttribute('aria-pressed', String(on));
      pin.overlay.setZIndex(on ? 6 : pin.zIndex);
    }
  }, [selectedId, places, phase, todayId, showOff, mapCategory]);

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
      if (e.target instanceof Element && e.target.closest('.map__pin')) return;
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
      const pick = pickRef.current;
      if (pick && start && maps && map) {
        const rect = el.getBoundingClientRect();
        const coords = map
          .getProjection()
          .coordsFromContainerPoint(new maps.Point(e.clientX - rect.left, e.clientY - rect.top));
        officePinRef.current?.setMap(null);
        officePinRef.current = new maps.CustomOverlay({
          position: coords,
          content: '<div class="map__office map__office--new">새 회사</div>',
          map,
          yAnchor: 0.5,
          zIndex: 8,
        });
        pickRef.current = null;
        setPicking(false);
        pick({ lat: coords.getLat(), lng: coords.getLng() });
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
  }, [phase]);

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

  const goTo = useCallback((place: Place) => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    setDraft(null);
    dropTempPin();
    setSelectedId(place.id);
    setEditing(false);
    if (maps && map) map.panTo(new maps.LatLng(place.lat, place.lng));
  }, [dropTempPin]);

  const search = useCallback(async () => {
    const q = keyword.trim();
    if (!q) return;
    setSearchProblem(null);
    setResults([]);
    setSearching(true);
    try {
      const maps = await loadKakaoMaps();
      const office = officeCoord();
      new maps.services.Places().keywordSearch(
        q,
        (data, status) => {
          setSearching(false);
          if (status === maps.services.Status.OK) {
            setResults(data.slice(0, MAX_RESULTS));
            return;
          }
          if (status === maps.services.Status.ZERO_RESULT) {
            setSearchProblem('회사 주변에서 못 찾았어요. 지점 이름까지 넣어 보세요.');
            return;
          }
          setSearchProblem(
            `검색에 실패했어요. 카카오 콘솔의 사이트 도메인에 ${window.location.origin} 이 등록됐는지 확인해 주세요.`,
          );
        },
        {
          location: new maps.LatLng(office.lat, office.lng),
          radius: SEARCH_RADIUS_M,
          size: MAX_RESULTS,
        },
      );
    } catch (error) {
      setSearching(false);
      setSearchProblem(`검색하지 못했어요. 잠시 뒤 다시 해 주세요. (${String((error as Error)?.message ?? error)})`);
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
        {/* 지도 자리에 같은 크기의 점선 상자를 두고 안에서 알린다(handoff 6 · 5e). */}
        <div className="map__troubleBox" role="alert">
          <span className="map__troubleArt" aria-hidden="true">🗺️</span>
          <p className="map__troubleTitle">{trouble.title}</p>
          <p className="muted small">{trouble.detail}</p>
          {trouble.retryable && (
            <Button variant="secondary" onClick={retry}>
              다시 시도
            </Button>
          )}
        </div>
        <p className="muted small">
          {kakaoJsKey() ? '지도가 없어도 오늘·목록 탭은 그대로 쓸 수 있어요.' : '키가 없어도 오늘·목록 탭은 잘 돌아가요. 지도는 나중에 붙이면 돼요.'}
        </p>
      </section>
    );
  }

  return (
    <section className="map">
      <OfficeCard
        getMapCenter={phase === 'ready' ? getMapCenter : undefined}
        onStartPick={phase === 'ready' ? startPick : undefined}
        onCancelPick={cancelPick}
        picking={picking}
        onSaved={onOfficeChanged}
      />
      <div className="add__search">
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} placeholder="가게 이름으로 찾기" maxLength={40} aria-label="가게 이름으로 찾기" />
        <Button onClick={() => void search()} loading={searching} disabled={!keyword.trim()}>
          찾기
        </Button>
      </div>
      {searchProblem && <p className="notice notice--empty" role="alert">{searchProblem}</p>}
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

      {/* 데스크톱에서는 지도가 왼쪽 큰 칸을 차지하고, 나머지는 오른쪽에 쌓인다. */}
      <div className="map__main">
        {phase === 'ready' && mapCategories.length > 1 && (
          <div className="map__cats" role="group" aria-label="지도에 보일 카테고리">
            <button
              type="button"
              className="map__cat"
              aria-pressed={mapCategory === null}
              onClick={() => setMapCategory(null)}
            >
              전체
            </button>
            {mapCategories.map((c) => (
              <button
                key={c}
                type="button"
                className="map__cat"
                aria-pressed={mapCategory === c}
                onClick={() => {
                  const next = mapCategory === c ? null : c;
                  setMapCategory(next);
                  // 고른 가게 핀이 숨으면 정보 카드만 덩그러니 남는다.
                  if (next && selected && selected.category !== next) setSelectedId(null);
                }}
              >
                <span aria-hidden="true">{categoryIcon(c)} </span>
                {c}
              </button>
            ))}
          </div>
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
          className={[
            'map__frame',
            picking && 'map__frame--picking',
            far && 'map__frame--far',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="map__canvas" ref={containerRef} aria-label="우리 도보권 지도" />
          {/* "지도 가운데로" 의 가운데가 어디인지 보여 주는 십자. 지도 조작은 막지 않는다. */}
          <span className="map__crosshair" aria-hidden="true" />
          {/* SDK·타일을 받는 동안 빈 회색 칸만 보이면 고장 난 것 같았다 — 스피너를 지도 위에 띄운다. */}
          {phase === 'loading' && (
            <div className="map__loading">
              <Spinner size={32} style={{ borderRadius: "50%" }} aria-label="지도를 불러오고 있어요" />
              <span className="muted small">지도를 불러오고 있어요</span>
            </div>
          )}
        </div>

        {phase === 'ready' && (
          <p className="muted small">
            원은 도보 {WALK_STEPS.join('·')}분이에요 · 핀을 누르면 정보, 빈 곳을 꾹 누르면 새 가게
          </p>
        )}
      </div>

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
                    {selected.category} · 도보 {selected.walkMin}분
                    {selected.price ? ` · ${selected.price}` : ''}
                  </p>
                </div>
                <button type="button" className="linkish" onClick={() => setSelectedId(null)}>
                  닫기
                </button>
              </div>
              {selected.rating && <Stars value={selected.rating} />}
              {selected.review && <p className="small">{selected.review}</p>}
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
              </div>
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
          <h3 id="nearby-title" className="mp__title">지도에 있는 가게 {nearby.length}곳</h3>
          <ul className="mp__nearList">
            {nearby.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="mp__near"
                  onClick={() => {
                    goTo(p);
                    requestAnimationFrame(() => {
                      selCardRef.current?.focus({ preventScroll: true });
                      selCardRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
                    });
                  }}
                >
                  <span className="mp__nearName">
                    <span aria-hidden="true">{categoryIcon(p.category)} </span>
                    {p.name}
                    {p.id === todayId && <span className="badge">오늘</span>}
                  </span>
                  <span className="muted small">도보 {p.walkMin}분</span>
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
            <h3 id="draft-title" className="mp__title">여기 저장할까요?</h3>
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
    </section>
  );
}

/**
 * 정보 카드 안의 수정. 좌표는 여기서 못 고친다 — 목록 탭이 맡는다.
 * 지도에서 좌표를 숫자로 치게 하면 아무도 안 쓰고, 핀을 옮기는 UI 는
 * 새로 꽂는 것과 구분이 안 된다.
 */
function PlaceEdit({
  place,
  onDone,
  onCancel,
}: {
  place: Place;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState<Category | null>(
    (CATEGORIES as readonly string[]).includes(place.category)
      ? (place.category as Category)
      : null,
  );
  const [price, setPrice] = useState<PriceBand | null>(place.price ?? null);
  const [rating, setRating] = useState<Rating | null>(place.rating ?? null);
  const [review, setReview] = useState(place.review ?? '');
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
        rating: rating ?? undefined,
        review: review.trim() || undefined,
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
      <Input label="이름" fieldProps={{ className: 'pf__field' }} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-required="true" autoFocus />
      <div className="pf__field">
        <span className="filters__label">카테고리</span>
        <ChipPicker label="카테고리" options={CATEGORIES} value={category} onPick={setCategory} />
      </div>
      <div className="pf__field">
        <span className="filters__label">가격대</span>
        <ChipPicker label="가격대" options={PRICE_BANDS} value={price} onPick={setPrice} allowNone />
      </div>
      <div className="pf__field">
        <span className="filters__label">별점</span>
        <div className="pf__stars" role="group" aria-label="별점">
          {RATINGS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rating !== null && rating >= n}
              aria-label={`${n}점`}
              className={rating !== null && rating >= n ? 'pf__star pf__star--on' : 'pf__star'}
              onClick={() => setRating(rating === n ? null : n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <Input label="한줄평" fieldProps={{ className: 'pf__field' }} value={review} onChange={(e) => setReview(e.target.value)} maxLength={40} />
      <Textarea label="메모" fieldProps={{ className: 'pf__field' }} value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={120} rows={2} />
      <p className="muted small">좌표와 도보 시간은 목록 탭에서 고칠 수 있어요.</p>
      {problem && <p className="notice notice--empty" role="alert">{problem}</p>}
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
