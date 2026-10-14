import { useEffect, useState } from 'react';
import { Button } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { sharePlace, shareMessage, type ShareResult } from '../lib/share';

const NOTE: Record<ShareResult, string> = {
  shared: '',
  copied: '복사했어요. 슬랙에 붙여 넣어 주세요.',
  failed: '복사하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
};

// 데모는 기록이 보낸 사람 브라우저에만 있어, 앱 주소를 보내면 받은 사람은 빈 화면을 본다. 가게 링크만 보낸다.
const APP_URL = () => (import.meta.env.VITE_DEMO === '1' ? null : window.location.origin);

export function ShareButton({ place }: { place: Pick<Place, 'name' | 'category' | 'sub' | 'walkMin' | 'lat' | 'lng' | 'kakaoPlaceId'> }) {
  const [result, setResult] = useState<ShareResult | null>(null);

  useEffect(() => {
    if (result === null) return;
    const t = window.setTimeout(() => setResult(null), 2500);
    return () => window.clearTimeout(t);
  }, [result]);

  return (
    <div className="share">
      <Button
        block
        size="sm"
        variant="secondary"
        onClick={async () => setResult(await sharePlace(shareMessage(place, APP_URL())))}
      >
        📤 동료에게 알리기
      </Button>
      <p className="share__note small" role="status">
        {result ? NOTE[result] : ''}
      </p>
    </div>
  );
}
