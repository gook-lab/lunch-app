/**
 * 오늘 탭 위 "어제 ○○ 어땠어요?" 한 줄. 누르면 그 자리에서 별점 편집기가 열린다.
 * 남기거나 닫으면 그날은 다시 띄우지 않는다(lib/ratePrompt.ts).
 */
import { useState } from 'react';
import type { DayId } from '../lib/date';
import type { RatingSummary } from '../lib/ratings';
import { dismissPrompt, promptDismissed, type RatePromptTarget } from '../lib/ratePrompt';
import { RatingEditor } from './Rating';

interface Props {
  today: DayId;
  target: RatePromptTarget | null;
  /** 가게별 별점. 남긴 뒤 편집기가 "고치기" 로 바뀌게 target 이 사라져도 계속 본다. */
  ratings: Map<string, RatingSummary>;
}

export function RatePrompt({ today, target, ratings }: Props) {
  const [closedDay, setClosedDay] = useState<DayId | null>(() => (promptDismissed(today) ? today : null));
  // 편집기를 연 가게. 별점을 남기면 target 이 null 이 되지만(이미 남김) "남겼어요" 를 보여 주려고 붙잡아 둔다.
  const [open, setOpen] = useState<RatePromptTarget | null>(null);
  const shown = open ?? target;
  if (!shown || closedDay === today) return null;

  const close = () => {
    dismissPrompt(today);
    setClosedDay(today);
    setOpen(null);
  };

  return (
    <section className="rate-prompt" aria-label={`${shown.when} 간 곳 별점`}>
      <div className="rate-prompt__row">
        <p className="rate-prompt__title">
          <span aria-hidden="true">⭐ </span>
          {shown.when} <strong>{shown.place.name}</strong> 어땠어요?
        </p>
        {!open && (
          <button type="button" className="linkish" onClick={() => setOpen(shown)}>
            별점 남기기
          </button>
        )}
        <button type="button" className="linkish" onClick={close}>
          닫기
        </button>
      </div>
      {open && <RatingEditor key={open.place.id} placeId={open.place.id} summary={ratings.get(open.place.id)} />}
    </section>
  );
}
