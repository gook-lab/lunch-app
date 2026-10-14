/**
 * 목록 탭 — 폐업 끄기와 오타·좌표 수정 (엔지니어링 리뷰 D8).
 *
 * 삭제는 없다. visits 가 placeId 를 참조하므로 지우면 지난 기록이 깨진다.
 * 대신 수정을 연다 — 잠가 두면 카카오 검색에서 동명 지점을 잘못 고른 가게가
 * walkMin 탓에 영원히 후보에서 빠지고, 고칠 길이 없어 2주차 판정의 근거인
 * 풀 크기가 오염된다.
 *
 * 화면에서는 "최근 1주 안에 간 곳" 을 강조한다. 그게 오늘 후보에서 빠진
 * 이유라서, 표시하지 않으면 목록과 돌림판이 어긋나 보인다.
 */
import { recentNote } from '../lib/messages';
import { useId, useRef, useState } from 'react';
import { Button, Input, Menu } from '@gook-lab/ui';
import { LunchStats } from './LunchStats';
import { CATEGORIES, categoryIcon, categoryLabel } from '../lib/category';
import { CategoryPicker } from './CategoryPicker';
import type { Place, Visit } from '../lib/candidates';
import { withJosa } from '../lib/josa';
import { RECENT_WINDOW_DAYS } from '../lib/candidates';
import { daysBetween, type DayId } from '../lib/date';
import { walkMinutesBetween } from '../lib/walk';
import { updatePlace } from '../services/lunch';
import type { RatingSummary } from '../lib/ratings';
import { RatingBadge, RatingEditor, RatingReviews } from './Rating';
import { RemovePlaceSheet } from './RemovePlace';

interface Props {
  places: Place[];
  visits: Visit[];
  today: DayId;
  onChanged: () => void;
  /** 로드맵의 "최근 1주 제외" 칩 상태. 꺼져 있으면 "빠집니다" 가 거짓이 된다. */
  excludeRecent: boolean;
  /** 지도 탭을 열고 이 가게 핀을 고른다. */
  onShowOnMap?: (placeId: string) => void;
  /** 지도 탭으로 가서 새 가게를 넣는다. 추가 경로는 지도 하나뿐이다. */
  onAdd?: () => void;
  /** 가게별 별점 요약(사람마다 한 표의 평균). */
  ratings?: Map<string, RatingSummary>;
}

interface LastVisit {
  label: string;
  recent: boolean;
}

function lastVisit(place: Place, visits: Visit[], today: DayId): LastVisit {
  const mine = visits.filter((v) => v.placeId === place.id).map((v) => v.id);
  if (mine.length === 0) return { label: '아직 안 갔어요', recent: false };

  const last = mine.reduce((a, b) => (a > b ? a : b));
  const days = daysBetween(last, today);
  const recent = days <= RECENT_WINDOW_DAYS;

  if (days === 0) return { label: '오늘', recent };
  if (days === 1) return { label: '어제', recent };
  if (days < 7) return { label: `${days}일 전`, recent };
  return { label: `${Math.floor(days / 7)}주 전`, recent };
}

function ago(day: DayId, today: DayId): string {
  const days = daysBetween(day, today);
  if (days === 0) return '오늘';
  if (days === 1) return '어제';
  return `${days}일 전`;
}

/** 이 화면에 보이는 최근 방문 수. 결정은 하루 한 건이라 한 주쯤이다. 더 길면 목록이 밀린다. */
const HISTORY_MAX = 5;

/**
 * 최근 다녀온 곳. 방문 기록은 이미 받아 오고 있었는데(최근 제외 계산용)
 * 화면 어디에도 안 보였다. "지난주에 어디 갔더라" 를 여기서 바로 본다.
 * 읽기만 한다 — 규칙·데이터 모델은 그대로다.
 */
function History({
  places,
  visits,
  today,
  onShowOnMap,
}: {
  places: Place[];
  visits: Visit[];
  today: DayId;
  onShowOnMap?: (placeId: string) => void;
}) {
  const byId = new Map(places.map((p) => [p.id, p]));
  const rows = [...visits]
    .sort((a, b) => (a.id < b.id ? 1 : -1))
    .slice(0, HISTORY_MAX)
    .map((v) => ({ visit: v, place: byId.get(v.placeId) }))
    .filter((r): r is { visit: Visit; place: Place } => r.place !== undefined);
  if (rows.length === 0) return null;

  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="list__heading">
        최근 다녀온 곳 <span className="list__count">{rows.length}번</span>
      </h2>
      <ol className="history__list">
        {rows.map(({ visit, place }) => (
          <li key={visit.id} className="history__item">
            <span className="history__when">{ago(visit.id, today)}</span>
            <strong className="history__name">{place.name}</strong>
            <span className="muted small">
              {categoryLabel(place)} · 도보 {place.walkMin}분
            </span>
            {onShowOnMap && (
              <button
                type="button"
                className="list__iconBtn"
                aria-label={`${place.name} 지도에서 보기`}
                onClick={() => onShowOnMap(place.id)}
              >
                <span aria-hidden="true">🗺️</span>
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function EditRow({ place, onDone }: { place: Place; onDone: () => void }) {
  const [name, setName] = useState(place.name);
  // 목록에 없는 옛 카테고리는 고르지 않은 것으로 시작한다. 그대로 두면 칩은 하나도
  // 안 켜졌는데 저장은 옛 값으로 되어 칩으로 바꾼 의미가 없다.
  const [category, setCategory] = useState<string | null>(
    (CATEGORIES as readonly string[]).includes(place.category) ? (place.sub ?? place.category) : null,
  );
  const [lat, setLat] = useState(String(place.lat));
  const [lng, setLng] = useState(String(place.lng));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  // 오류 문구를 칸에 이어 붙인다. role=alert 만으로는 칸으로 돌아왔을 때 이유가 안 읽혔다.
  const errId = useId();
  const catRef = useRef<HTMLDivElement>(null);
  const latRef = useRef<HTMLInputElement>(null);
  const lngRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    // 막힌 칸으로 초점을 옮긴다(지도 탭 새 가게 폼과 같다).
    if (!name.trim()) {
      nameRef.current?.focus();
      return setProblem('이름을 넣어 주세요.');
    }
    if (!category) {
      catRef.current?.querySelector('button')?.focus();
      return setProblem('메뉴를 골라 주세요.');
    }
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
      (Number.isFinite(nextLat) ? lngRef : latRef).current?.focus();
      return setProblem('좌표는 숫자로 넣어 주세요.');
    }

    // 좌표를 고치면 도보시간을 같이 다시 계산해서 쓴다. 저장 필드라
    // 따로 두면 좌표와 도보시간이 어긋난 채로 남는다.
    const walkMin = walkMinutesBetween(nextLat, nextLng);
    if (walkMin <= 0 || walkMin > 60) {
      return setProblem(`회사에서 걸어서 ${walkMin}분 거리예요. 도보 60분 안에 있는 가게를 넣을 수 있어요.`);
    }

    setSaving(true);
    setProblem(null);
    try {
      await updatePlace(place.id, {
        name: name.trim(),
        category,
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
    <div
      className="edit"
      // 취소 단추와 같다. 입력 중 Escape 로 바로 닫는다.
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onDone();
        }
      }}
    >
      <Input label="이름" ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-required="true" aria-invalid={problem === '이름을 넣어 주세요.' || undefined} aria-describedby={problem ? errId : undefined} autoFocus state={problem === '이름을 넣어 주세요.' ? 'error' : 'default'} />
      {/* 지도에서 넣을 때와 같은 칩. 글자로 받으면 목록에 없는 카테고리("국밥")가
          들어가 로드맵 조각·그림·카테고리 필터에서 길을 잃었다(20회차). */}
      <div ref={catRef}>
        <span className="filters__label">메뉴</span>
        <CategoryPicker value={category} onPick={setCategory} />
      </div>
      <div className="edit__coords">
        <Input label="위도" ref={latRef} value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" aria-invalid={!Number.isFinite(Number(lat)) || undefined} aria-describedby={problem ? errId : undefined} state={!Number.isFinite(Number(lat)) ? 'error' : 'default'} />
        <Input label="경도" ref={lngRef} value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" aria-invalid={!Number.isFinite(Number(lng)) || undefined} aria-describedby={problem ? errId : undefined} state={!Number.isFinite(Number(lng)) ? 'error' : 'default'} />
      </div>
      <p className="muted small">위치를 바꾸면 도보 시간도 새로 계산해요.</p>
      {problem && <p id={errId} className="notice notice--empty" role="alert">{problem}</p>}
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

export function PlaceList({ places, visits, today, onChanged, excludeRecent, onShowOnMap, onAdd, ratings }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  // 별점 칸을 연 가게. 고치기와 같은 자리에 펼친다.
  const [rating, setRating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Place | null>(null);
  // 가까운 순(기본) 또는 별점 순. 별점이 없는 가게는 별점 순에서 맨 뒤로.
  const [sortBy, setSortBy] = useState<'walk' | 'rating'>('walk');
  const [busy, setBusy] = useState<string | null>(null);
  const [toggleProblem, setToggleProblem] = useState<string | null>(null);

  if (places.length === 0) {
    return <p className="muted">지도에서 자주 가는 가게를 넣어 볼까요?</p>;
  }

  const sorted = [...places].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (sortBy === 'rating') {
      const diff = (ratings?.get(b.id)?.average ?? 0) - (ratings?.get(a.id)?.average ?? 0);
      if (diff !== 0) return diff;
    }
    return a.walkMin - b.walkMin;
  });

  const recentCount = sorted.filter((p) => p.active && lastVisit(p, visits, today).recent).length;

  const toggle = async (place: Place) => {
    setBusy(place.id);
    setToggleProblem(null);
    try {
      await updatePlace(place.id, { active: !place.active });
      onChanged();
    } catch {
      // 실패하면 단추만 다시 살아나고 아무 말이 없었다. 바뀐 줄 알고 넘어간다.
      setToggleProblem(`${withJosa(place.name, '을/를')} ${place.active ? '빼지' : '되돌리지'} 못했어요. 잠시 뒤 다시 해 주세요.`);
    } finally {
      setBusy(null);
    }
  };

  const renderRow = (place: Place) => {
    const visit = lastVisit(place, visits, today);
    return (
      <li key={place.id} className={place.active ? 'list__item' : 'list__item list__off'}>
        <div className="list__main">
          <span className="list__icon" aria-hidden="true">{categoryIcon(place.sub ?? place.category)}</span>
          <div className="list__text">
            <div className="list__name">
              <strong>{place.name}</strong>
              {!place.active && <span className="badge">잠시 뺌</span>}
            </div>
            <div className="list__meta">
              {categoryLabel(place)} · 도보 {place.walkMin}분 ·{' '}
              <span className={visit.recent ? 'list__recent' : undefined}>{visit.label}</span>
              {ratings?.get(place.id) && (
                <>
                  {' · '}
                  <RatingBadge summary={ratings.get(place.id)} />
                </>
              )}
            </div>
          </div>
          {/*
            * 줄마다 "지도·끄기·고치기" 글자 링크 셋이 가게 이름보다 눈에 띄었다(10/12 와이어프레임).
            * 자주 쓰는 지도만 남기고, 끄기·고치기는 ⋯ 메뉴로 접는다.
            */}
          <div className="list__actions">
            {onShowOnMap && (
              <button
                type="button"
                className="list__iconBtn"
                aria-label={`${place.name} 지도에서 보기`}
                onClick={() => onShowOnMap(place.id)}
              >
                <span aria-hidden="true">🗺️</span>
              </button>
            )}
            <Menu
              align="end"
              trigger={
                <button
                  type="button"
                  id={`edit-${place.id}`}
                  className="list__iconBtn"
                  aria-label={`${place.name} 더 보기`}
                  disabled={busy === place.id}
                >
                  <span aria-hidden="true">⋯</span>
                </button>
              }
              items={[
                {
                  label: ratings?.get(place.id)?.mine ? '내 별점 바꾸기' : '별점 남기기',
                  onSelect: () => {
                    setEditing(null);
                    setRating(rating === place.id ? null : place.id);
                  },
                },
                {
                  label: '고치기',
                  onSelect: () => {
                    setRating(null);
                    setEditing(editing === place.id ? null : place.id);
                  },
                },
                {
                  label: place.active ? '잠시 빼기' : '되돌리기',
                  onSelect: () => void toggle(place),
                },
                // 끄기는 잠깐 빼기(되돌리기 쉬움), 지우기는 목록에서도 없애기. 위험한 쪽만 빨갛게.
                { label: '지우기', tone: 'danger', onSelect: () => setRemoving(place) },
              ]}
            />
          </div>
        </div>
        {rating === place.id && (
          <div className="list__rate">
            <RatingReviews summary={ratings?.get(place.id)} />
            <RatingEditor key={place.id} placeId={place.id} summary={ratings?.get(place.id)} />
            <button type="button" className="linkish" onClick={() => setRating(null)}>
              닫기
            </button>
          </div>
        )}
        {editing === place.id && (
          <EditRow
            place={place}
            onDone={() => {
              setEditing(null);
              onChanged();
              // 폼이 사라지면 초점이 <body> 로 떨어진다. 연 단추로 돌려준다.
              requestAnimationFrame(() => document.getElementById(`edit-${place.id}`)?.focus());
            }}
          />
        )}
      </li>
    );
  };

  const on = sorted.filter((p) => p.active);
  const off = sorted.filter((p) => !p.active);

  // 켜진 가게와 꺼진 가게를 나눈다. 꺼진 가게는 후보에 안 들어가니 접어 두되,
  // 켜진 가게가 하나도 없으면 다시 켤 곳을 찾아야 하므로 펼쳐 둔다.
  // 데스크톱은 두 칸: 왼쪽 후보·꺼 둔 가게, 오른쪽 최근 다녀온 곳. 한 칸으로 화면 폭을
  // 다 쓰면 최근 다녀온 곳 줄 가운데가 텅 비고 아래도 비었다(10/10 리뷰).
  return (
    <div className="lt">
      {toggleProblem && (
        <p className="notice notice--empty" role="alert">
          {toggleProblem}
        </p>
      )}
      <div className="lt__side">
        <LunchStats places={places} visits={visits} today={today} />
        <History places={places} visits={visits} today={today} onShowOnMap={onShowOnMap} />
      </div>
      <div className="lt__main">
        <section className="list__group" aria-labelledby="list-on">
          {/* 추가 단추는 후보 제목 줄 끝에. 혼자 한 줄을 먹으면 맨 위가 비어 보였다(10/9 리뷰). */}
          <div className="list__headRow">
            <h2 id="list-on" className="list__heading">
              오늘 고를 가게 <span className="list__count">{on.length}곳</span>
            </h2>
            {onAdd && (
              <Button size="sm" className="list__add" onClick={onAdd}>
                지도에서 가게 넣기
              </Button>
            )}
          </div>
          <div className="list__sortRow">
            <div className="list__sort" role="group" aria-label="정렬">
              <button type="button" aria-pressed={sortBy === 'walk'} onClick={() => setSortBy('walk')}>
                가까운 순
              </button>
              <button type="button" aria-pressed={sortBy === 'rating'} onClick={() => setSortBy('rating')}>
                별점 순
              </button>
            </div>
            <p className="muted small">{recentNote(recentCount, excludeRecent)}</p>
          </div>
          {on.length > 0 ? (
            <ul className="list">{on.map(renderRow)}</ul>
          ) : (
            <p className="muted small">잠시 뺀 가게를 되돌리거나, 지도에서 새 가게를 넣어 볼까요?</p>
          )}
        </section>
        {off.length > 0 && (
          <details className="list__group list__group--off" open={on.length === 0}>
            <summary className="list__heading">
              잠시 뺀 가게 <span className="list__count">{off.length}곳</span>
            </summary>
            <ul className="list">{off.map(renderRow)}</ul>
          </details>
        )}
      </div>
      <RemovePlaceSheet place={removing} onClose={() => setRemoving(null)} onDone={onChanged} />
    </div>
  );
}
