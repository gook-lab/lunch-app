/**
 * 가게 추가 (T11) — 이름으로 찾아서 좌표·카테고리를 자동으로 채운다.
 *
 * REST 키는 쓰지 않는다. JS SDK 의 services.Places.keywordSearch 하나로 끝나고,
 * REST 키는 브라우저에 두면 안 되는 값이라 애초에 받아오지 않는다.
 *
 * 검색을 회사 좌표 기준 반경으로 묶는다. "김밥천국" 을 그냥 검색하면 전국이
 * 나와서 엉뚱한 지점을 고르고, walkMin 이 저장 필드라 그 오류가 그대로 굳는다.
 *
 * 넣은 뒤에도 시트를 닫지 않는다. 처음 채울 때 12곳을 연달아 넣는 게 실제
 * 사용 흐름이고, 매번 닫히면 그게 제일 느린 지점이 된다.
 */
import { useCallback, useState } from 'react';
import { Button, Tag } from '@gook-lab/ui';
import { CATEGORIES, categoryFromKakao, type Category } from '../lib/category';
import { officeCoord, walkMinutesBetween } from '../lib/walk';
import { loadKakaoMaps } from '../services/kakao';
import { addPlace } from '../services/lunch';
import type { KakaoPlace } from '../types/kakao';

/** 회사 기준 검색 반경. 도보 60분(직선 약 3.1km)보다 넉넉하게 둔다 —
 *  넘는 곳은 "결과 없음" 대신 "도보 78분입니다" 로 거절하는 게 읽힌다. */
const SEARCH_RADIUS_M = 5000;
const MAX_RESULTS = 10;
/** 도보시간 상한. 규칙(firestore.rules)과 같은 값이다. */
const MAX_WALK_MIN = 60;

interface Props {
  onAdded: () => void;
}

export default function AddPlace({ onAdded }: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<KakaoPlace[]>([]);
  const [chosen, setChosen] = useState<KakaoPlace | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const search = useCallback(async () => {
    const q = keyword.trim();
    if (!q) return;

    setProblem(null);
    setDone(null);
    setResults([]);
    setChosen(null);
    setSearching(true);

    try {
      const maps = await loadKakaoMaps();
      const office = officeCoord();
      const places = new maps.services.Places();

      places.keywordSearch(
        q,
        (data, status) => {
          setSearching(false);
          if (status === maps.services.Status.OK) {
            setResults(data.slice(0, MAX_RESULTS));
            return;
          }
          if (status === maps.services.Status.ZERO_RESULT) {
            setProblem('회사 주변에서 못 찾았습니다. 지점 이름까지 넣어 보세요.');
            return;
          }
          // 도메인 미등록이면 여기로 떨어진다. 검색이 SDK 권한을 처음 쓰는 지점이다.
          setProblem(
            `검색이 실패했습니다. 카카오 콘솔의 사이트 도메인에 ${window.location.origin} 이 등록됐는지 확인해 주세요.`,
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
      setProblem(String((error as Error)?.message ?? error));
    }
  }, [keyword]);

  const choose = useCallback((place: KakaoPlace) => {
    setChosen(place);
    setProblem(null);
    // 못 맞히면 null 이고, 그때는 사람이 고르기 전까지 저장이 막힌다.
    setCategory(categoryFromKakao(place.category_name));
  }, []);

  const save = useCallback(async () => {
    if (!chosen) return;
    if (!category) {
      setProblem('카테고리를 골라 주세요.');
      return;
    }

    const lat = Number(chosen.y);
    const lng = Number(chosen.x);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setProblem('좌표를 읽지 못했습니다. 다른 결과를 골라 주세요.');
      return;
    }

    let walkMin: number;
    try {
      walkMin = walkMinutesBetween(lat, lng);
    } catch (error) {
      setProblem(String((error as Error)?.message ?? error));
      return;
    }
    if (walkMin > MAX_WALK_MIN) {
      setProblem(`도보 ${walkMin}분입니다 — ${MAX_WALK_MIN}분을 넘는 곳은 넣을 수 없습니다.`);
      return;
    }

    setSaving(true);
    setProblem(null);
    try {
      const result = await addPlace({
        name: chosen.place_name,
        category,
        lat,
        lng,
        walkMin,
        kakaoPlaceId: chosen.id,
        active: true,
      });

      if (result.added) {
        setDone(`${chosen.place_name} 을 넣었습니다 · 도보 ${walkMin}분`);
        onAdded();
      } else {
        setDone(`${chosen.place_name} 은 이미 있습니다.`);
      }

      // 연달아 넣을 수 있게 입력만 비운다.
      setChosen(null);
      setResults([]);
      setKeyword('');
    } catch (error) {
      setProblem(String((error as Error)?.message ?? error));
    } finally {
      setSaving(false);
    }
  }, [chosen, category, onAdded]);

  return (
    <div className="add">
      <div className="add__search">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder="가게 이름"
          maxLength={40}
          aria-label="가게 이름"
        />
        <Button onClick={() => void search()} loading={searching} disabled={!keyword.trim()}>
          찾기
        </Button>
      </div>
      <p className="muted small">회사에서 걸어갈 수 있는 곳만 나옵니다</p>

      {problem && <p className="notice notice--empty">{problem}</p>}
      {done && <p className="confirmed">{done}</p>}

      {results.length > 0 && (
        <ul className="add__results">
          {results.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                className={chosen?.id === place.id ? 'add__hit add__hit--on' : 'add__hit'}
                aria-pressed={chosen?.id === place.id}
                onClick={() => choose(place)}
              >
                <strong>{place.place_name}</strong>
                <span className="muted small">
                  {place.road_address_name || place.address_name}
                </span>
                <span className="muted small">{place.category_name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className="add__confirm">
          <p className="small">
            <strong>{chosen.place_name}</strong> · 도보{' '}
            {(() => {
              try {
                return `${walkMinutesBetween(Number(chosen.y), Number(chosen.x))}분`;
              } catch {
                return '계산 불가';
              }
            })()}
          </p>
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
          {category === null && (
            <p className="muted small">
              카카오 분류({chosen.category_name})로는 못 정했습니다. 직접 골라 주세요.
            </p>
          )}
          <Button block size="lg" onClick={() => void save()} loading={saving}>
            이 가게 넣기
          </Button>
        </div>
      )}
    </div>
  );
}
