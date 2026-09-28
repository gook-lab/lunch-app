/**
 * 목록 탭 — 폐업 끄기와 오타·좌표 수정 (엔지니어링 리뷰 D8).
 *
 * 삭제는 없다. visits 가 placeId 를 참조하므로 지우면 지난 기록이 깨진다.
 * 대신 수정을 연다 — 잠가 두면 카카오 검색에서 동명 지점을 잘못 고른 가게가
 * walkMin 탓에 영원히 후보에서 빠지고, 고칠 길이 없어 2주차 판정의 근거인
 * 풀 크기가 오염된다.
 *
 * 화면에서는 "최근 2주 안에 간 곳" 을 강조한다. 그게 오늘 후보에서 빠진
 * 이유라서, 표시하지 않으면 목록과 돌림판이 어긋나 보인다.
 */
import { useState } from 'react';
import { Button } from '@gook-lab/ui';
import type { Place, Visit } from '../lib/candidates';
import { RECENT_WINDOW_DAYS } from '../lib/candidates';
import { daysBetween, type DayId } from '../lib/date';
import { walkMinutesBetween } from '../lib/walk';
import { updatePlace } from '../services/lunch';

interface Props {
  places: Place[];
  visits: Visit[];
  today: DayId;
  onChanged: () => void;
}

interface LastVisit {
  label: string;
  recent: boolean;
}

function lastVisit(place: Place, visits: Visit[], today: DayId): LastVisit {
  const mine = visits.filter((v) => v.placeId === place.id).map((v) => v.id);
  if (mine.length === 0) return { label: '기록 없음', recent: false };

  const last = mine.reduce((a, b) => (a > b ? a : b));
  const days = daysBetween(last, today);
  const recent = days <= RECENT_WINDOW_DAYS;

  if (days === 0) return { label: '오늘', recent };
  if (days === 1) return { label: '어제', recent };
  if (days < 7) return { label: `${days}일 전`, recent };
  return { label: `${Math.floor(days / 7)}주 전`, recent };
}

function EditRow({ place, onDone }: { place: Place; onDone: () => void }) {
  const [name, setName] = useState(place.name);
  const [category, setCategory] = useState(place.category);
  const [lat, setLat] = useState(String(place.lat));
  const [lng, setLng] = useState(String(place.lng));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (!name.trim()) return setProblem('이름은 비울 수 없습니다.');
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      return setProblem('좌표가 숫자가 아닙니다.');
    }

    // 좌표를 고치면 도보시간을 같이 다시 계산해서 쓴다. 저장 필드라
    // 따로 두면 좌표와 도보시간이 어긋난 채로 남는다.
    const walkMin = walkMinutesBetween(nextLat, nextLng);
    if (walkMin <= 0 || walkMin > 60) {
      return setProblem(`도보 ${walkMin}분으로 계산됩니다 — 60분을 넘는 곳은 넣을 수 없습니다.`);
    }

    setSaving(true);
    setProblem(null);
    try {
      await updatePlace(place.id, {
        name: name.trim(),
        category: category.trim(),
        lat: nextLat,
        lng: nextLng,
        walkMin,
      });
      onDone();
    } catch (e) {
      setProblem(String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit">
      <label>
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
      </label>
      <label>
        카테고리
        <input value={category} onChange={(e) => setCategory(e.target.value)} maxLength={20} />
      </label>
      <div className="edit__coords">
        <label>
          위도
          <input value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" />
        </label>
        <label>
          경도
          <input value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" />
        </label>
      </div>
      <p className="muted small">좌표를 고치면 도보시간이 같이 다시 계산됩니다.</p>
      {problem && <p className="notice notice--empty">{problem}</p>}
      <div className="row">
        <Button block onClick={() => void save()} loading={saving}>
          저장
        </Button>
        <Button block variant="secondary" onClick={onDone}>
          취소
        </Button>
      </div>
    </div>
  );
}

export function PlaceList({ places, visits, today, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (places.length === 0) {
    return <p className="muted">아직 등록된 가게가 없습니다.</p>;
  }

  const sorted = [...places].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.walkMin - b.walkMin;
  });

  const recentCount = sorted.filter((p) => p.active && lastVisit(p, visits, today).recent).length;

  const toggle = async (place: Place) => {
    setBusy(place.id);
    try {
      await updatePlace(place.id, { active: !place.active });
      onChanged();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <p className="muted small">
        도보 가까운 순 · 최근 2주에 간 {recentCount}곳은 오늘 후보에서 빠집니다
      </p>
      <ul className="list">
        {sorted.map((place) => {
          const visit = lastVisit(place, visits, today);
          return (
            <li key={place.id} className={place.active ? '' : 'list__off'}>
              <div className="list__main">
                <div>
                  <div className="list__name">
                    <strong>{place.name}</strong>
                    {!place.active && <span className="badge">꺼짐</span>}
                  </div>
                  <div className="list__meta">
                    {place.category} · 도보 {place.walkMin}분 ·{' '}
                    <span className={visit.recent ? 'list__recent' : undefined}>{visit.label}</span>
                  </div>
                </div>
                <div className="list__actions">
                  <button
                    type="button"
                    className="linkish"
                    disabled={busy === place.id}
                    onClick={() => void toggle(place)}
                  >
                    {place.active ? '끄기' : '켜기'}
                  </button>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => setEditing(editing === place.id ? null : place.id)}
                  >
                    고치기
                  </button>
                </div>
              </div>
              {editing === place.id && (
                <EditRow
                  place={place}
                  onDone={() => {
                    setEditing(null);
                    onChanged();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
