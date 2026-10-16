import { describe, expect, it } from 'vitest';
import { cardText, fitSize } from './shareCard';

describe('공유 카드', () => {
  const place = { name: '우동 한 판', category: '면', sub: '우동', walkMin: 6 };

  it('날짜·요일·가게·게임을 글로 만든다', () => {
    expect(cardText(place, '20261016', '🏹 활쏘기')).toEqual({
      kicker: '10월 16일 금요일 · 오늘 점심은',
      name: '우동 한 판',
      meta: '우동 · 도보 6분',
      footer: '🏹 활쏘기로 정했어요',
    });
  });

  it('게임을 모르면 앱 이름으로 맺는다', () => {
    expect(cardText({ ...place, sub: undefined }, '20261019').meta).toBe('면 · 도보 6분');
    expect(cardText(place, '20261019').footer).toBe('점심 뭐 먹지?');
  });

  it('긴 이름은 폭에 맞게 글자를 줄이되 최소 크기는 지킨다', () => {
    const measure = (len: number) => (s: number) => s * len * 0.9;
    expect(fitSize(measure(5), 120, 56, 1000)).toBe(120);
    expect(fitSize(measure(12), 120, 56, 1000)).toBeLessThan(120);
    expect(fitSize(measure(40), 120, 56, 1000)).toBe(56);
  });
});
