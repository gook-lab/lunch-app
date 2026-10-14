/**
 * 가게 지우기 확인.
 *
 * 문서를 실제로 지우지는 않는다. visits 가 placeId 를 참조하고, 링크만 알면 누구나 쓰는 앱이라
 * 잘못 지운 걸 되살릴 길이 있어야 한다. removed 표시만 남기면 목록·지도·게임에서는 사라지고,
 * 지난 방문 기록과 별점은 그대로 남는다(필요하면 Firestore 에서 removed 를 지우면 돌아온다).
 */
import { useState } from 'react';
import { Button, Sheet } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { withJosa } from '../lib/josa';
import { updatePlace } from '../services/lunch';

export function RemovePlaceSheet({ place, onClose, onDone }: { place: Place | null; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState(false);
  const close = () => {
    setProblem(false);
    onClose();
  };
  const remove = async () => {
    if (!place) return;
    setSaving(true);
    setProblem(false);
    try {
      await updatePlace(place.id, { removed: true, active: false });
      onDone();
      close();
    } catch (error) {
      console.error(error);
      setProblem(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <Sheet
      open={place !== null}
      onClose={close}
      title={place ? `${withJosa(place.name, '을/를')} 지울까요?` : ''}
      description="목록·지도·게임에서 사라져요. 지난 방문 기록과 별점은 그대로 남아요."
    >
      <div className="row">
        <Button block tone="danger" onClick={() => void remove()} loading={saving}>
          지우기
        </Button>
        <Button block variant="ghost" onClick={close} disabled={saving}>
          그대로 두기
        </Button>
      </div>
      {problem && (
        <p className="notice notice--empty" role="alert">
          지우지 못했어요. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}
    </Sheet>
  );
}
