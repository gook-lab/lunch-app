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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Sheet, Tag } from '@gook-lab/ui';
import { PRICE_BANDS, WALK_STEPS, type Place, type PriceBand, type Rating } from '../lib/candidates';
import { CATEGORIES, type Category } from '../lib/category';
import { metersForWalkMinutes, officeCoord } from '../lib/walk';
import {
  clearKakaoLoadFailure,
  KakaoLoadError,
  kakaoJsKey,
  loadKakaoMaps,
} from '../services/kakao';
import { updatePlace } from '../services/lunch';
import type { KakaoMap, KakaoMaps, KakaoMarker, KakaoPlace } from '../types/kakao';
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
          '.env.local 의 VITE_KAKAO_JS_KEY 를 채우고 개발 서버를 다시 띄워 주세요. 지도만 막히고 로드맵·목록은 그대로 쓸 수 있어요.',
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
    detail: String((error as Error)?.message ?? error),
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

export default function MapTab({ places, onChanged }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlaceDraft | null>(null);
  const [editing, setEditing] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchProblem, setSearchProblem] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapsRef = useRef<KakaoMaps | null>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<Map<string, KakaoMarker>>(new Map());
  const tempMarkerRef = useRef<KakaoMarker | null>(null);
  const fittedRef = useRef(false);
  const resizeRef = useRef<ResizeObserver | null>(null);

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
          content: '<div class="map__office">회사</div>',
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
            strokeColor: '#18181b',
            strokeOpacity: 0.6,
            strokeStyle: 'shortdash',
            fillOpacity: 0,
            map,
          });
        }

        /*
         * 카카오는 만들 때의 컨테이너 크기를 기억한다. 그 뒤에 폭이 바뀌면
         * 타일이 예전 크기만큼만 깔려 오른쪽이 비어 보인다 — 실제로 그랬다.
         * 검색 결과가 위에 붙고 빠질 때마다 높이가 바뀌므로 한 번 부르고 마는
         * 걸로는 부족하다. 컨테이너를 계속 지켜본다.
         */
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
      resizeRef.current?.disconnect();
      resizeRef.current = null;
    };
  }, [attempt]);

  /* 2. 가게가 바뀌면 마커만 갈아 끼운다. */
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (phase !== 'ready' || !maps || !map) return;

    for (const marker of markersRef.current.values()) marker.setMap(null);
    markersRef.current.clear();

    const bounds = new maps.LatLngBounds();
    const office = officeCoord();
    bounds.extend(new maps.LatLng(office.lat, office.lng));

    for (const place of places) {
      const position = new maps.LatLng(place.lat, place.lng);
      bounds.extend(position);
      const marker = new maps.Marker({
        position,
        title: place.name,
        map,
        // 꺼진 가게는 흐리게. 지우지는 않는다 — visits 가 참조한다.
        opacity: place.active ? 1 : 0.35,
      });
      maps.event.addListener(marker, 'click', () => {
        setSelectedId(place.id);
        setEditing(false);
      });
      markersRef.current.set(place.id, marker);
    }

    // 처음 한 번만 맞춘다. 매번 맞추면 가게를 넣을 때마다 화면이 튄다.
    if (!fittedRef.current && places.length > 0) {
      fittedRef.current = true;
      map.setBounds(bounds, 48, 32, 48, 32);
    }
  }, [places, phase]);

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
      start = { x: e.clientX, y: e.clientY };
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;

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
    el.addEventListener('pointerup', clear, { capture: true });
    el.addEventListener('pointercancel', clear, { capture: true });
    el.addEventListener('pointerleave', clear, { capture: true });

    return () => {
      clear();
      el.removeEventListener('pointerdown', onDown, { capture: true });
      el.removeEventListener('pointermove', onMove, { capture: true });
      el.removeEventListener('pointerup', clear, { capture: true });
      el.removeEventListener('pointercancel', clear, { capture: true });
      el.removeEventListener('pointerleave', clear, { capture: true });
    };
  }, [phase]);

  const dropTempPin = useCallback(() => {
    tempMarkerRef.current?.setMap(null);
    tempMarkerRef.current = null;
  }, []);

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
      setSearchProblem(String((error as Error)?.message ?? error));
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

  if (phase === 'error' && trouble) {
    return (
      <section className="map map--trouble">
        <p className="notice notice--empty">{trouble.title}</p>
        <p className="muted small">{trouble.detail}</p>
        {trouble.retryable && (
          <Button variant="secondary" onClick={retry}>
            다시 시도
          </Button>
        )}
        {!kakaoJsKey() && (
          <p className="muted small">
            키가 없어도 로드맵·목록은 잘 돌아가요. 지도는 나중에 붙이면 돼요.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="map">
      <div className="add__search">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder="가게 이름으로 찾기"
          maxLength={40}
          aria-label="가게 이름으로 찾기"
        />
        <Button onClick={() => void search()} loading={searching} disabled={!keyword.trim()}>
          찾기
        </Button>
      </div>
      {searchProblem && <p className="notice notice--empty">{searchProblem}</p>}

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

      <div className="map__canvas" ref={containerRef} aria-label="우리 도보권 지도" />

      {phase === 'loading' && <p className="muted small">지도를 불러오고 있어요</p>}

      {phase === 'ready' && !selected && (
        <p className="muted small">
          원은 도보 {WALK_STEPS.join('·')}분이에요 · 핀을 누르면 정보, 빈 곳을 꾹 누르면 새 가게
        </p>
      )}

      {selected && (
        <div className="mp__card">
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
              <div className="row">
                <Button block size="sm" variant="secondary" onClick={() => setEditing(true)}>
                  고치기
                </Button>
                <Button
                  block
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void updatePlace(selected.id, { active: !selected.active }).then(onChanged);
                  }}
                >
                  {selected.active ? '끄기' : '켜기'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <Sheet
        open={draft !== null}
        onClose={() => {
          setDraft(null);
          dropTempPin();
        }}
        title="여기 저장할까요?"
      >
        {draft && (
          <PlaceForm
            draft={draft}
            places={places}
            onSaved={() => {
              setDraft(null);
              dropTempPin();
              onChanged();
            }}
            onCancel={() => {
              setDraft(null);
              dropTempPin();
            }}
            onGoTo={goTo}
          />
        )}
      </Sheet>
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
      <label className="pf__field">
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-required="true" />
      </label>
      <div className="pf__field">
        <span className="filters__label">카테고리</span>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <Tag
              key={c}
              as="button"
              variant={category === c ? 'accent' : 'outline'}
              aria-pressed={category === c}
              className={category === c ? 'chip chip--on' : 'chip'}
              onClick={() => setCategory(c)}
            >
              {c}
            </Tag>
          ))}
        </div>
      </div>
      <div className="pf__field">
        <span className="filters__label">가격대</span>
        <div className="chips">
          {PRICE_BANDS.map((b) => (
            <Tag
              key={b}
              as="button"
              variant={price === b ? 'accent' : 'outline'}
              aria-pressed={price === b}
              className={price === b ? 'chip chip--on' : 'chip'}
              onClick={() => setPrice(price === b ? null : b)}
            >
              {b}
            </Tag>
          ))}
        </div>
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
      <label className="pf__field">
        한줄평
        <input value={review} onChange={(e) => setReview(e.target.value)} maxLength={40} />
      </label>
      <label className="pf__field">
        메모
        <textarea value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={120} rows={2} />
      </label>
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
