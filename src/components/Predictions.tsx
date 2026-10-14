/**
 * 동료 예측 — 게임 판 아래 한 줄. "🔮 예측 3명 · 불밥 2 · 소오 1" 과 "예측하기".
 *
 * 누르면 이 자리에서 펼쳐진다(모달 아님 — 게임 판을 가리지 않게). 이름은 이 기기에
 * 기억한다. 게임 중엔 잠근다 — 결과를 보고 바꾸면 내기가 아니다. 당첨에는 아무 영향이 없다.
 */
import { useState } from 'react';
import { Button, Input } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { categoryIcon } from '../lib/category';
import { saveName, savedName, tally } from '../lib/predictions';
import { shortName } from '../lib/name';
import { withJosa } from '../lib/josa';
import type { Vote } from '../services/predictions';

interface Props {
  candidates: Place[];
  /** 오늘 정한 가게. 정하면 후보에서 빠지는데, 그 가게에 건 표도 세야 한다. */
  decided?: Place | null;
  votes: Vote[];
  myUid: string | null;
  locked: boolean;
  onVote: (placeId: string, name: string) => Promise<void>;
  onClear: () => Promise<void>;
}

export function Predictions({ candidates, decided = null, votes, myUid, locked, onVote, onClear }: Props) {
  const mine = votes.find((v) => v.uid === myUid) ?? null;
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [name, setName] = useState(savedName);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  // 정한 가게는 1주 제외로 후보에서 빠진다. 후보만 세면 결정하자마자 예측 수가 줄고
  // 맞힌 사람 표가 사라졌다(10/15). 표를 셀 때만 다시 넣고, 고르는 칸에는 넣지 않는다.
  const tallied = decided && !candidates.some((p) => p.id === decided.id) ? [...candidates, decided] : candidates;
  const rows = tally(
    votes,
    tallied.map((p) => p.id),
  );
  const byId = new Map(tallied.map((p) => [p.id, p]));
  const counted = rows.reduce((a, r) => a + r.count, 0);
  const chosen = pick ?? mine?.placeId ?? null;
  const ready = chosen !== null && name.trim().length > 0 && !busy;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(false);
    try {
      saveName(name.trim());
      await onVote(chosen, name.trim());
      setOpen(false);
      setPick(null);
    } catch {
      setProblem(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="predict" aria-label="동료 예측">
      <div className="predict__row">
        <p className="predict__sum">
          <span aria-hidden="true">🔮 </span>
          {counted === 0 ? (
            '아직 예측한 사람이 없어요'
          ) : (
            <>
              예측 <strong>{counted}명</strong>
              {rows.slice(0, 3).map((r) => (
                <span key={r.placeId} className="predict__tag">
                  {shortName(byId.get(r.placeId)!.name, 6)} {r.count}
                </span>
              ))}
            </>
          )}
        </p>
        <button
          type="button"
          className="linkish predict__toggle"
          aria-expanded={open}
          disabled={locked}
          onClick={() => setOpen((v) => !v)}
        >
          {locked ? '게임 중엔 못 바꿔요' : open ? '접기' : mine ? '내 예측 바꾸기' : '예측하기'}
        </button>
      </div>
      {mine && !open && (
        <p className="muted small predict__mine">
          {mine.name} 님은 {withJosa(byId.get(mine.placeId)?.name ?? '목록에 없는 가게', '으로/로')} 예측했어요
        </p>
      )}
      {open && !locked && (
        <div className="predict__form">
          <Input
            label="이름"
            fieldProps={{ className: 'predict__name' }}
            value={name}
            maxLength={12}
            placeholder="동료가 알아볼 이름"
            onChange={(e) => setName(e.target.value)}
          />
          <div className="predict__picks" role="group" aria-label="나올 것 같은 가게">
            {candidates.map((p) => (
              <button
                key={p.id}
                type="button"
                className="predict__pick"
                aria-pressed={chosen === p.id}
                onClick={() => setPick(p.id)}
              >
                <span aria-hidden="true">{categoryIcon(p.sub ?? p.category)} </span>
                {p.name}
              </button>
            ))}
          </div>
          <div className="predict__actions">
            <Button onClick={submit} disabled={!ready} loading={busy}>
              {mine ? '예측 바꾸기' : '예측하기'}
            </Button>
            {mine && (
              <Button
                variant="secondary"
                onClick={async () => {
                  await onClear().catch(() => setProblem(true));
                  setOpen(false);
                }}
              >
                예측 취소
              </Button>
            )}
          </div>
          <p className="muted small">예측해도 결과는 바뀌지 않아요. 맞힌 사람 이름은 결과에 나와요.</p>
          {problem && (
            <p className="notice notice--empty" role="alert">
              저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
