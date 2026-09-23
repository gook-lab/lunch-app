/**
 * 목록 탭 — 폐업 끄기와 오타·좌표 수정 (엔지니어링 리뷰 D8).
 *
 * 삭제는 없다. visits 가 placeId 를 참조하므로 지우면 지난 기록이 깨진다.
 * 대신 수정을 연다 — 잠가 두면 카카오 검색에서 동명 지점을 잘못 고른 가게가
 * walkMin 탓에 영원히 후보에서 빠지고, 고칠 길이 없어 2주차 판정의 근거인
 * 풀 크기가 오염된다.
 */
import { useState } from 'react';
import { Button, Tag } from '@gook-lab/ui';
import type { Place, Visit } from '../lib/candidates';
import { daysBetween } from '../lib/date';
import { walkMinutesBetween } from '../lib/walk';
import { updatePlace } from '../services/lunch';
import type { DayId } from '../lib/date';

interface Props {
  places: Place[];
  visits: Visit[];
  today: DayId;
  onChanged: () => void;
}

function lastVisitLabel(place: Place, visits: Visit[], today: DayId): string {
  const mine = visits.filter((v) => v.placeId === place.id).map((v) => v.id);
  if (mine.length === 0) return '기록 없음';
  const last = mine.reduce((a, b) => (a > b ? a : b));
  const days = daysBetween(last, today);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  if (days < 7) return `${days}일 전`;
  return `${Math.floor(days / 7)}주 전`;
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
      return setProblem('도보 60분을 넘는 곳은 넣을 수 없습니다.');
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
        <Button block onClick={() => void save()} loading={saving}>저장</Button>
        <Button block variant="ghost" onClick={onDone}>취소</Button>
      </div>
    </div>
  );
}

export function PlaceList({ places, visits, today, onChanged }: Props) {
  const [editing, setEditing] = useState<string | null>(null);

  if (places.length === 0) {
    return <p className="muted">아직 등록된 가게가 없습니다.</p>;
  }

  const sorted = [...places].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.walkMin - b.walkMin;
  });

  return (
    <ul className="list">
      {sorted.map((place) => (
        <li key={place.id} className={place.active ? '' : 'list__row--off'}>
          <div className="list__main">
            <div>
              <strong>{place.name}</strong>
              <div className="muted small">
                {place.category} · 도보 {place.walkMin}분 · {lastVisitLabel(place, visits, today)}
              </div>
            </div>
            <div className="row">
              <Tag
                as="button"
                variant={place.active ? 'accent' : 'outline'}
                onClick={() => {
                  void updatePlace(place.id, { active: !place.active }).then(onChanged);
                }}
              >
                {place.active ? '사용 중' : '꺼짐'}
              </Tag>
              <Tag
                as="button"
                variant="outline"
                onClick={() => setEditing(editing === place.id ? null : place.id)}
              >
                고치기
              </Tag>
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
      ))}
    </ul>
  );
}
