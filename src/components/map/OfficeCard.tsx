/**
 * 회사 위치 정하기.
 *
 * 도보 시간·로드맵·지도 눈금이 전부 이 좌표를 기준으로 한다. 처음에는 .env 의
 * 임시값(서울시청)이라 실제 사무실과 다르다. 여기서 두 가지 방법으로 정한다.
 *  - 지금 내 위치로: 회사에 앉아서 휴대폰 GPS 로 찍는다.
 *  - 지도 가운데로: 지도를 끌어 회사가 가운데 오게 한 뒤 찍는다.
 * 모두가 같은 기준을 봐야 하므로 저장은 Firestore 한 곳이다. 바꾸기 전에
 * 얼마나 옮기는지 보여 주고 한 번 더 묻는다.
 */
import { useState } from 'react';
import { Button } from '@gook-lab/ui';
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
  onSaved: () => void;
}

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
  const now = currentOffice();
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

export function OfficeCard({ getMapCenter, onStartPick, onCancelPick, picking = false, onSaved }: Props) {
  const [pending, setPending] = useState<{ coord: Coord; note: string } | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const saved = officeSource() === 'saved';
  // 이미 정해 두었으면 한 줄로 접는다. 지도를 가리지 않게. 임시값이면 펼쳐 둔다.
  const [open, setOpen] = useState(!saved);
  const expanded = open || pending !== null || picking || problem !== null;

  const propose = (coord: Coord, note = '') => {
    if (!inKorea(coord)) {
      setProblem('한국 안의 위치만 회사로 정할 수 있어요.');
      return;
    }
    setProblem(null);
    setPending({ coord, note });
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
      setProblem(`저장하지 못했어요. 잠시 뒤 다시 해 주세요. (${String((error as Error)?.message ?? error)})`);
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
          : '아직 임시 위치예요. 실제 회사 위치로 정해야 도보 시간이 맞아요.'}
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
      )}
      {problem && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
