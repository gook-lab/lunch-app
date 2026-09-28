/**
 * 가게 저장 시트 — 지도에서 넣는 유일한 입력창 (§3).
 *
 * 두 경로가 이걸 같이 쓴다. 지도를 길게 눌러 꽂은 핀은 이름이 비어 있고,
 * 검색으로 고른 결과는 이름·카테고리가 채워진 채로 열린다. 폼을 둘로
 * 나누면 한쪽에만 필드가 빠진 채 굳는다 — 실제로 그렇게 될 뻔했다.
 *
 * 도보시간은 저장 필드다. 여기서 계산해 넣고 "추정값" 이라고 적는다.
 * 직선거리 × 1.3 ÷ 67m/분이라 실제와 다를 수 있고, 숨기면 나중에
 * 후보에서 빠진 이유를 아무도 설명하지 못한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Tag } from '@gook-lab/ui';
import { PRICE_BANDS, type Place, type PriceBand, type Rating } from '../../lib/candidates';
import { CATEGORIES, categoryFromKakao, type Category } from '../../lib/category';
import { findDuplicate } from '../../lib/duplicate';
import { walkMinutesBetween } from '../../lib/walk';
import { addPlace } from '../../services/lunch';

/** 규칙(firestore.rules)과 같은 값이다. 어긋나면 저장이 규칙에서 막힌다. */
const MAX_WALK_MIN = 60;
const MAX_NAME = 40;
const MAX_REVIEW = 40;
const MAX_MEMO = 120;
const RATINGS: Rating[] = [1, 2, 3, 4, 5];

export interface PlaceDraft {
  lat: number;
  lng: number;
  /** 검색으로 왔으면 채워져 있다. 길게 눌러 왔으면 빈 문자열. */
  name: string;
  /** 검색 결과의 카카오 분류. 카테고리 자동 채움에만 쓴다. */
  kakaoCategory?: string;
  /** 길게 눌러 넣은 가게에는 없다. */
  kakaoPlaceId?: string;
  /** 검색 결과 주소. 참고용으로 보여만 준다. */
  address?: string;
}

interface Props {
  draft: PlaceDraft;
  places: Place[];
  onSaved: () => void;
  onCancel: () => void;
  /** 이미 있는 가게였을 때 그쪽으로 데려간다. */
  onGoTo: (place: Place) => void;
}

export function PlaceForm({ draft, places, onSaved, onCancel, onGoTo }: Props) {
  const [name, setName] = useState(draft.name);
  const [category, setCategory] = useState<Category | null>(
    draft.kakaoCategory ? categoryFromKakao(draft.kakaoCategory) : null,
  );
  const [price, setPrice] = useState<PriceBand | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [review, setReview] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // 핀을 옮겨 다시 열면 폼을 새로 시작한다.
  useEffect(() => {
    setName(draft.name);
    setCategory(draft.kakaoCategory ? categoryFromKakao(draft.kakaoCategory) : null);
    setPrice(null);
    setRating(null);
    setReview('');
    setMemo('');
    setProblem(null);
  }, [draft]);

  const walk = useMemo(() => {
    try {
      return { min: walkMinutesBetween(draft.lat, draft.lng), error: null as string | null };
    } catch (error) {
      return { min: null, error: String((error as Error)?.message ?? error) };
    }
  }, [draft.lat, draft.lng]);

  // 이름을 치는 동안 계속 본다. 저장을 누른 뒤에 알리면 이미 늦다.
  const duplicate = useMemo(
    () =>
      findDuplicate(places, {
        name,
        lat: draft.lat,
        lng: draft.lng,
        kakaoPlaceId: draft.kakaoPlaceId,
      }),
    [places, name, draft],
  );

  const tooFar = walk.min !== null && walk.min > MAX_WALK_MIN;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setProblem('이름을 넣어 주세요.');
    if (!category) return setProblem('카테고리를 골라 주세요.');
    if (walk.error) return setProblem(walk.error);
    if (walk.min === null) return setProblem('도보시간을 계산하지 못했습니다.');
    if (tooFar) {
      return setProblem(`도보 ${walk.min}분입니다 — ${MAX_WALK_MIN}분을 넘는 곳은 넣을 수 없습니다.`);
    }

    setSaving(true);
    setProblem(null);
    try {
      const result = await addPlace({
        name: trimmed,
        category,
        lat: draft.lat,
        lng: draft.lng,
        walkMin: walk.min,
        // 길게 눌러 넣은 가게는 카카오 id 가 없다. 빈 문자열로 둔다 —
        // 규칙이 string 을 요구하고, 빈 값끼리는 중복 검사에 걸리지 않는다.
        kakaoPlaceId: draft.kakaoPlaceId ?? '',
        active: true,
        price: price ?? undefined,
        rating: rating ?? undefined,
        review: review.trim() || undefined,
        memo: memo.trim() || undefined,
      });
      if (!result.added) {
        setProblem('방금 다른 기기에서 같은 가게가 등록됐습니다.');
        return;
      }
      onSaved();
    } catch (error) {
      setProblem(String((error as Error)?.message ?? error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pf">
      {duplicate && (
        <div className="pf__dupe">
          <p className="small">
            <strong>{duplicate.place.name}</strong> 이 이미 등록돼 있습니다
            {duplicate.reason === 'name-and-distance' && duplicate.meters !== null
              ? ` (${Math.round(duplicate.meters)}m 거리)`
              : ''}
            .
          </p>
          <Button size="sm" variant="secondary" onClick={() => onGoTo(duplicate.place)}>
            그 가게 보기
          </Button>
        </div>
      )}

      <label className="pf__field">
        이름
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="가게 이름"
          autoFocus={draft.name === ''}
        />
      </label>
      {draft.address && <p className="muted small">{draft.address}</p>}

      <p className={tooFar ? 'notice notice--empty' : 'muted small'}>
        {walk.error
          ? walk.error
          : `회사에서 도보 ${walk.min}분 (추정값 · 직선거리 기준)`}
      </p>

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
        <span className="filters__label">가격대 (선택)</span>
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
        <span className="filters__label">별점 (선택)</span>
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
          {rating !== null && <span className="muted small">{rating}점</span>}
        </div>
      </div>

      <label className="pf__field">
        한줄평 (선택)
        <input
          value={review}
          onChange={(e) => setReview(e.target.value)}
          maxLength={MAX_REVIEW}
          placeholder="김치찌개가 진함"
        />
      </label>

      <label className="pf__field">
        메모 (선택)
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={MAX_MEMO}
          rows={2}
          placeholder="12시 전에 가야 자리 있음"
        />
      </label>

      {problem && <p className="notice notice--empty">{problem}</p>}

      <div className="row">
        <Button block size="lg" onClick={() => void save()} loading={saving} disabled={tooFar}>
          저장
        </Button>
        <Button block variant="secondary" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
