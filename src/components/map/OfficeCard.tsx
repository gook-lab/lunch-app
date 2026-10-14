/**
 * 회사 위치 정하기.
 *
 * 도보 시간·로드맵·지도 눈금이 전부 이 좌표를 기준으로 한다. 처음에는 .env 의
 * 임시값(서울시청)이라 실제 사무실과 다르다. 여기서 정한다.
 *  - 건물·주소로 찾기: 카카오 장소 검색(전국). 회사 밖에서도 정할 수 있다.
 *  - 지금 내 위치로: 회사에 앉아서 휴대폰 GPS 로 찍는다.
 *  - 지도 가운데로: 지도를 끌어 회사가 가운데 오게 한 뒤 찍는다.
 * 모두가 같은 기준을 봐야 하므로 저장은 Firestore 한 곳이다. 바꾸기 전에
 * 얼마나 옮기는지 보여 주고 한 번 더 묻는다.
 */
import { useEffect, useState, type MutableRefObject } from 'react';
import { Button, Input } from '@gook-lab/ui';
import type { KakaoPlace } from '../../types/kakao';
import { loadKakaoMaps } from '../../services/kakao';
import { officeCoord, officeSource, setOfficeOverride, straightLineMeters, type Coord } from '../../lib/walk';
import { saveOffice } from '../../services/lunch';

interface Props {
  /** 지도가 떠 있으면 그 가운데 좌표. 지도가 없으면 undefined. */
  getMapCenter?: () => Coord | null;
  /** 지도를 짧게 누른 자리를 회사 후보로 받는다. 지도가 없으면 undefined. */
  onStartPick?: (onPick: (coord: Coord) => void) => void;
  /** 찍기·확인을 그만둘 때. 지도에 꽂은 임시 핀을 걷는다. */
  onCancelPick?: () => void;
  /** 지금 지도에서 찍기를 기다리는 중인지. */
  picking?: boolean;
  /** 찾기로 고른 후보를 지도에 미리 꽂는다. 지도가 없으면 undefined. */
  onPreview?: (coord: Coord) => void;
  /**
   * 회사를 아직 안 정했을 때 지도를 누르면 회사 후보로 받도록, 받는 함수를 여기에 걸어 둔다.
   * 정해 둔 뒤에는 null — 그때 지도 누르기는 가게 넣기다.
   */
  tapRef?: MutableRefObject<((coord: Coord) => void) | null>;
  onSaved: () => void;
}

const MAX_HITS = 5;

/** firestore.rules 의 validCoord 와 같은 범위. */
export function inKorea({ lat, lng }: Coord): boolean {
  return lat > 33 && lat < 39 && lng > 124 && lng < 132;
}

function currentOffice(): Coord | null {
  try {
    return officeCoord();
  } catch {
    return null;
  }
}

function describeMove(next: Coord): string {
  // 처음 정할 때는 임시값(서울시청)에서 얼마나 옮기는지가 의미 없다.
  const now = officeSource() === 'saved' ? currentOffice() : null;
  if (!now) return '이 위치를 회사로 정해요.';
  const m = Math.round(straightLineMeters(now.lat, now.lng, next.lat, next.lng));
  if (m < 30) return '지금 회사 위치와 거의 같아요.';
  const far = m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
  return `지금 회사 위치에서 약 ${far} 옮겨요.`;
}

const GEO_ERROR: Record<number, string> = {
  1: '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용해 주세요.',
  2: '지금 위치를 찾지 못했어요. 잠시 뒤 다시 해 주세요.',
  3: '위치를 찾는 데 너무 오래 걸렸어요. 다시 해 주세요.',
};

export function OfficeCard({
  getMapCenter,
  onStartPick,
  onCancelPick,
  picking = false,
  onPreview,
  tapRef,
  onSaved,
}: Props) {
  const [pending, setPending] = useState<{ coord: Coord; note: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = officeSource() === 'saved';
  // 이미 정해 두었으면 한 줄로 접는다. 지도를 가리지 않게. 임시값이면 펼쳐 둔다.
  const [open, setOpen] = useState(!saved);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<KakaoPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const expanded = open || pending !== null || picking || problem !== null;

  const propose = (coord: Coord, note = '') => {
    if (!inKorea(coord)) {
      setProblem('한국 안의 위치만 회사로 정할 수 있어요.');
      return;
    }
    setProblem(null);
    setPending({ coord, note });
  };

  // 렌더 중엔 ref 를 바꾸지 않는다. 고르는 중(확인 대기)엔 다른 자리를 눌러 바꿀 수 있게 둔다.
  useEffect(() => {
    if (!tapRef) return;
    tapRef.current = saved ? null : (coord) => propose(coord);
    return () => {
      tapRef.current = null;
    };
  });

  const search = async () => {
    const q = query.trim();
    if (!q) return;
    setProblem(null);
    setHits([]);
    setSearching(true);
    try {
      const maps = await loadKakaoMaps();
      // 회사는 어디든 될 수 있어 반경 없이 전국에서 찾는다. 건물 이름·도로명 주소 모두 걸린다.
      new maps.services.Places().keywordSearch(
        q,
        (data, status) => {
          setSearching(false);
          if (status === maps.services.Status.OK) return setHits(data.slice(0, MAX_HITS));
          if (status === maps.services.Status.ZERO_RESULT) {
            return setProblem('찾지 못했어요. 건물 이름이나 도로명 주소로 다시 찾아 주세요.');
          }
          setProblem('검색에 실패했어요. 잠시 뒤 다시 해 주세요.');
        },
        { size: MAX_HITS },
      );
    } catch {
      setSearching(false);
      setProblem('지금은 찾을 수 없어요. 내 위치로 정해 주세요.');
    }
  };

  const pickHit = (hit: KakaoPlace) => {
    const coord = { lat: Number(hit.y), lng: Number(hit.x) };
    if (!Number.isFinite(coord.lat) || !Number.isFinite(coord.lng)) {
      return setProblem('좌표를 읽지 못했어요. 다른 결과를 골라 주세요.');
    }
    setHits([]);
    setQuery('');
    onPreview?.(coord);
    propose(coord, `${hit.place_name} · ${hit.road_address_name || hit.address_name}`);
  };

  const fromGps = () => {
    if (!('geolocation' in navigator)) {
      setProblem('이 브라우저는 위치를 알려 주지 않아요. 지도 가운데로 정해 주세요.');
      return;
    }
    setLocating(true);
    setProblem(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const accuracy = Math.round(pos.coords.accuracy);
        propose(
          { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy > 100 ? `오차가 약 ${accuracy}m 예요. 실내라면 창가에서 다시 해 보세요.` : '',
        );
      },
      (err) => {
        setLocating(false);
        setProblem(GEO_ERROR[err.code] ?? GEO_ERROR[2]);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const fromTap = () => {
    setProblem(null);
    onStartPick?.((coord) => propose(coord));
  };

  const cancel = () => {
    setPending(null);
    setHits([]);
    onCancelPick?.();
    if (saved) setOpen(false);
  };

  const fromMap = () => {
    const center = getMapCenter?.();
    if (center) propose(center);
  };

  const commit = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      await saveOffice(pending.coord);
      // 다시 읽기 전에도 바로 새 기준으로 그리게 한다.
      setOfficeOverride(pending.coord);
      setPending(null);
      onSaved();
    } catch (error) {
      console.error(error);
      setProblem('저장하지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setSaving(false);
    }
  };

  if (!expanded) {
    return (
      <section className="office office--folded" aria-labelledby="office-title">
        <h2 id="office-title" className="office__title">
          🏢 회사 위치 <span className="office__badge">정해 둠</span>
        </h2>
        <button type="button" className="linkish" aria-expanded={false} onClick={() => setOpen(true)}>
          바꾸기
        </button>
      </section>
    );
  }

  return (
    <section className="office" aria-labelledby="office-title">
      <div className="office__head">
        <h2 id="office-title" className="office__title">
          🏢 회사 위치
        </h2>
        <span className="office__tail">
          <span className={saved ? 'office__badge' : 'office__badge office__badge--temp'}>
            {saved ? '정해 둠' : '임시 위치'}
          </span>
          {/* 바꾸기로 펼쳤다가 안 바꾸고 접을 길이 없었다(20회차). 고르는 중엔 취소가 그 길이다. */}
          {saved && !pending && !picking && (
            <button
              type="button"
              className="linkish"
              aria-expanded={true}
              onClick={() => {
                setProblem(null);
                setOpen(false);
              }}
            >
              접기
            </button>
          )}
        </span>
      </div>
      <p className="muted small">
        {saved
          ? '도보 시간과 로드맵이 이 위치를 기준으로 계산돼요.'
          : '먼저 회사 위치를 정해 주세요. 도보 시간이 여기서부터 계산돼요.'}
      </p>

      {picking && !pending ? (
        <div className="office__confirm">
          <p className="office__move">👆 지도에서 회사 자리를 눌러 주세요.</p>
          <Button block variant="secondary" onClick={cancel}>
            그만두기
          </Button>
        </div>
      ) : pending ? (
        <div className="office__confirm">
          <p className="office__move">{describeMove(pending.coord)}</p>
          {pending.note && <p className="muted small">{pending.note}</p>}
          <p className="muted small">바꾸면 모두의 도보 시간이 이 기준으로 바뀌어요.</p>
          <div className="row">
            <Button block onClick={() => void commit()} loading={saving}>
              이 위치로 정하기
            </Button>
            <Button block variant="secondary" onClick={cancel} disabled={saving}>
              취소
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="add__search office__search">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void search();
              }}
              placeholder="건물 이름이나 주소로 찾기"
              maxLength={40}
              aria-label="회사 건물 이름이나 주소로 찾기"
            />
            <Button onClick={() => void search()} loading={searching} disabled={!query.trim()}>
              찾기
            </Button>
          </div>
          {hits.length > 0 && (
            <ul className="add__results" aria-label="회사 위치 후보">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" className="add__hit" onClick={() => pickHit(hit)}>
                    <strong>{hit.place_name}</strong>
                    <span className="muted small">{hit.road_address_name || hit.address_name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="row">
            <Button block variant="secondary" onClick={fromGps} loading={locating}>
              📍 지금 내 위치로
            </Button>
            {onStartPick && (
              <Button block variant="secondary" onClick={fromTap}>
                👆 지도에서 찍기
              </Button>
            )}
            {getMapCenter && (
              <Button block variant="secondary" onClick={fromMap}>
                ✛ 지도 가운데로
              </Button>
            )}
          </div>
        </>
      )}
      {problem && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
