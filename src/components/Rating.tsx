/**
 * 별점 — 사람마다 한 표. 배지(평균·인원), 한줄평 목록, 내 별점 남기기.
 * 별점은 고르는 데 참고만 한다. 후보와 당첨에는 쓰지 않는다.
 */
import { useId, useState } from 'react';
import { Button, Input } from '@gook-lab/ui';
import { formatAverage, LEGACY_UID, type RatingSummary } from '../lib/ratings';
import { saveName, savedName } from '../lib/predictions';
import { rate, unrate } from '../services/ratings';

const SCORES = [1, 2, 3, 4, 5] as const;

/** "★ 4.3 · 3명". 표가 없으면 아무것도 안 그린다. */
export function RatingBadge({ summary }: { summary?: RatingSummary }) {
  if (!summary) return null;
  return (
    <span className="rating" aria-label={`별점 평균 ${formatAverage(summary.average)}점, ${summary.count}명`}>
      <span className="rating__star" aria-hidden="true">
        ★
      </span>{' '}
      {formatAverage(summary.average)}
      <span className="rating__count"> · {summary.count}명</span>
    </span>
  );
}

/** 한줄평 목록. 이름을 안 남긴 표는 "익명", 별점이 한 칸뿐이던 시절 것은 "예전 별점". */
export function RatingReviews({ summary }: { summary?: RatingSummary }) {
  if (!summary || summary.reviews.length === 0) return null;
  return (
    <ul className="rating__reviews">
      {summary.reviews.map((r) => (
        <li key={r.uid}>
          <span className="rating__star" aria-hidden="true">
            ★
          </span>
          <span className="sr-only">별점 </span>
          {r.score}{' '}
          <span className="rating__who">
            {r.uid === LEGACY_UID ? '예전 별점' : r.uid === summary.mine?.uid ? '나' : (r.name ?? '익명')}
          </span>{' '}
          {r.review}
        </li>
      ))}
    </ul>
  );
}

/** 내 별점 남기기·고치기·지우기. 가게가 바뀌면 부모가 key 로 새로 만든다. */
export function RatingEditor({ placeId, summary }: { placeId: string; summary?: RatingSummary }) {
  const mine = summary?.mine ?? null;
  const [score, setScore] = useState<number | null>(mine?.score ?? null);
  const [review, setReview] = useState(mine?.review ?? '');
  const [name, setName] = useState(mine?.name ?? savedName());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'saved' | 'removed' | 'failed' | null>(null);
  const groupId = useId();

  const save = async () => {
    if (score === null) return;
    setBusy(true);
    setStatus(null);
    try {
      if (name.trim()) saveName(name.trim());
      await rate(placeId, score, review, name);
      setStatus('saved');
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await unrate(placeId);
      setScore(null);
      setReview('');
      setStatus('removed');
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rate">
      <span className="filters__label" id={groupId}>
        {mine ? '내 별점 고치기' : '내 별점 남기기'}
      </span>
      <div className="pf__stars" role="group" aria-labelledby={groupId}>
        {SCORES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={score !== null && score >= n}
            aria-label={`${n}점`}
            className={score !== null && score >= n ? 'pf__star pf__star--on' : 'pf__star'}
            onClick={() => setScore(n)}
          >
            ★
          </button>
        ))}
        {score !== null && <span className="muted small">{score}점</span>}
      </div>
      <Input
        label="한 줄 평 (선택)"
        fieldProps={{ className: 'pf__field' }}
        value={review}
        onChange={(e) => setReview(e.target.value)}
        maxLength={40}
        placeholder="김치찌개가 진해요"
      />
      <Input
        label="이름 (선택)"
        fieldProps={{ className: 'pf__field' }}
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={12}
        placeholder="비우면 익명으로 남아요"
      />
      <div className="row">
        <Button size="sm" onClick={() => void save()} loading={busy} disabled={score === null}>
          {mine ? '별점 고치기' : '별점 남기기'}
        </Button>
        {mine && (
          <button type="button" className="linkish" onClick={() => void remove()} disabled={busy}>
            내 별점 지우기
          </button>
        )}
      </div>
      <p className="muted small" role="status">
        {status === 'saved'
          ? '별점을 남겼어요.'
          : status === 'removed'
            ? '내 별점을 지웠어요.'
            : status === 'failed'
              ? '저장하지 못했어요. 잠시 뒤 다시 해 주세요.'
              : ''}
      </p>
    </div>
  );
}
