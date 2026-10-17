import { useEffect, useState } from 'react';
import { track } from '../lib/analytics';
import { Button } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import { sharePlace, shareMessage, type ShareResult } from '../lib/share';
import { cardText, drawShareCard } from '../lib/shareCard';
import { todayKST } from '../lib/date';

const NOTE: Record<ShareResult, string> = {
  shared: '',
  copied: '복사했어요. 슬랙에 붙여 넣어 주세요.',
  failed: '복사하지 못했어요. 잠시 뒤 다시 눌러 주세요.',
};

// 데모는 기록이 보낸 사람 브라우저에만 있어, 앱 주소를 보내면 받은 사람은 빈 화면을 본다. 가게 링크만 보낸다.
const APP_URL = () => (import.meta.env.VITE_DEMO === '1' ? null : window.location.origin);

const fine = () => typeof matchMedia === 'function' && !matchMedia('(pointer: coarse)').matches;

export function ShareButton({
  place,
  primary = false,
  game,
}: {
  place: Pick<Place, 'name' | 'category' | 'sub' | 'walkMin' | 'lat' | 'lng' | 'kakaoPlaceId'>;
  /** 결정한 직후처럼 알리기가 다음 할 일일 때. */
  primary?: boolean;
  /** 카드에 적을 게임("🏹 활쏘기"). 모르면 빼고 그린다. */
  game?: string;
}) {
  const [result, setResult] = useState<ShareResult | null>(null);
  const card = async () => {
    const blob = await drawShareCard(cardText(place, todayKST(), game));
    return blob ? new File([blob], `오늘점심-${place.name}.png`, { type: 'image/png' }) : null;
  };
  // 데스크톱은 공유 시트가 없어 글만 복사된다. 그림은 따로 받아 슬랙에 끌어다 놓는다.
  const saveCard = async () => {
    track('share', { kind: 'card' });
    const file = await card();
    if (!file) return;
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  useEffect(() => {
    if (result === null) return;
    const t = window.setTimeout(() => setResult(null), 2500);
    return () => window.clearTimeout(t);
  }, [result]);

  return (
    <div className="share">
      <Button
        block
        size={primary ? 'lg' : 'sm'}
        variant={primary ? 'primary' : 'secondary'}
        onClick={async () => {
          track('share', { kind: 'link' });
          setResult(await sharePlace(shareMessage(place, APP_URL()), card));
        }}
      >
        📤 동료에게 알리기
      </Button>
      {fine() && (
        <Button block size="sm" variant="ghost" onClick={saveCard}>
          🖼 결과 카드 그림 받기
        </Button>
      )}
      <p className="share__note small" role="status">
        {result ? NOTE[result] : ''}
      </p>
    </div>
  );
}
