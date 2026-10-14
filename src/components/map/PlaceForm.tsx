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
import { ChipPicker } from '../ChipPicker';
import { useEffect, useMemo, useId, useRef, useState } from 'react';
import { Button, Input, Textarea } from '@gook-lab/ui';
import { PRICE_BANDS, type Place, type PriceBand, type Rating } from '../../lib/candidates';
import { categoryFromKakao } from '../../lib/category';
import { CategoryPicker } from '../CategoryPicker';
import { findDuplicate } from '../../lib/duplicate';
import { josa } from '../../lib/josa';
import { walkMinutesBetween } from '../../lib/walk';
import { addPlace } from '../../services/lunch';
import { rate } from '../../services/ratings';
import { savedName } from '../../lib/predictions';

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
  const [category, setCategory] = useState<string | null>(
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

  const nameRef = useRef<HTMLInputElement>(null);

  // 오류 문구를 칸에 이어 붙인다. role=alert 만으로는 칸으로 돌아왔을 때 이유가 안 읽혔다.

  const errId = useId();
  const catRef = useRef<HTMLDivElement>(null);

  const save = async () => {
    const trimmed = name.trim();
    // 막힌 칸으로 초점을 옮긴다. 메시지만 뜨면 키보드로는 그 칸을 다시 찾아가야 했다.
    if (!trimmed) {
      nameRef.current?.focus();
      return setProblem('이름을 넣어 주세요.');
    }
    if (!category) {
      catRef.current?.querySelector('button')?.focus();
      return setProblem('메뉴를 골라 주세요.');
    }
    if (walk.error) return setProblem(walk.error);
    if (walk.min === null) return setProblem('도보 시간을 계산하지 못했어요.');
    if (tooFar) {
      return setProblem(`회사에서 걸어서 ${walk.min}분 거리예요. ${MAX_WALK_MIN}분 안에 있는 가게를 넣을 수 있어요.`);
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
        memo: memo.trim() || undefined,
      });
      if (!result.added) {
        setProblem('방금 다른 기기에서 같은 가게를 넣었어요.');
        return;
      }
      // 별점·한줄평은 가게 문서가 아니라 내 표로 남긴다(사람마다 한 표). 실패해도 가게는 이미 들어갔다.
      if (rating !== null && result.id) await rate(result.id, rating, review, savedName()).catch(() => {});
      onSaved();
    } catch (error) {
      // 원인은 영어 개발자 문구일 수 있다. 안내를 앞에 두고 원문은 괄호로.
      console.error(error);
      setProblem('저장하지 못했어요. 잠시 뒤 다시 해 볼까요?');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pf">
      {duplicate && (
        <div className="pf__dupe">
          <p className="small">
            <strong>{duplicate.place.name}</strong>
            {josa(duplicate.place.name, '이/가')} 이미 들어 있어요
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

      <Input
        label="이름"
        fieldProps={{ className: 'pf__field' }}
        ref={nameRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={MAX_NAME}
        aria-required="true"
        aria-invalid={problem === '이름을 넣어 주세요.' || undefined}
        aria-describedby={problem ? errId : undefined}
        placeholder="가게 이름"
        autoFocus={draft.name === ''}
        state={problem === '이름을 넣어 주세요.' ? 'error' : 'default'}
      />
      {draft.address && <p className="muted small">{draft.address}</p>}

      <p className={tooFar ? 'notice notice--empty' : 'muted small'}>
        {walk.error ? walk.error : `회사에서 도보 ${walk.min}분이에요. 직선거리로 계산한 예상 시간이에요.`}
      </p>

      <div className="pf__field" ref={catRef}>
        <span className="filters__label">메뉴</span>
        <CategoryPicker value={category} onPick={setCategory} />
      </div>

      {/* 가격대·별점은 데스크톱에서 한 줄에 나란히 — 오른쪽 칸 안에서 폼이 스크롤되지 않게(10/14). */}
      <div className="pf__pair">
        <div className="pf__field">
          <span className="filters__label">가격대 (선택)</span>
          <ChipPicker label="가격대" options={PRICE_BANDS} value={price} onPick={setPrice} allowNone />
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
      </div>

      <Input
        label="한 줄 평 (별점을 고르면 같이 남아요)"
        fieldProps={{ className: 'pf__field' }}
        value={review}
        onChange={(e) => setReview(e.target.value)}
        maxLength={MAX_REVIEW}
        placeholder="김치찌개가 진함"
      />

      <Textarea
        label="메모 (선택)"
        fieldProps={{ className: 'pf__field' }}
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        maxLength={MAX_MEMO}
        rows={2}
        placeholder="12시 전에 가야 자리 있음"
      />

      {problem && (
        <p id={errId} className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}

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
