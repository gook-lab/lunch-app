import { useEffect, useState } from 'react';
import { Button } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { sharePlace, shareText, type ShareResult } from '../lib/share';

const NOTE: Record<ShareResult, string> = {
  shared: '',
  copied: '복사했어요. 슬랙에 붙여 넣어 주세요.',
  failed: '복사하지 못했어요. 브라우저 권한을 확인해 주세요.',
};

export function ShareButton({ place }: { place: Pick<Place, 'name' | 'category' | 'walkMin'> }) {
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
        onClick={async () => setResult(await sharePlace(shareText(place, window.location.origin)))}
      >
        📤 동료에게 알리기
      </Button>
      <p className="share__note small" role="status">
        {result ? NOTE[result] : ''}
      </p>
    </div>
  );
}
