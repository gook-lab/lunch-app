// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { dismissPrompt, promptDismissed, ratePromptTarget } from './ratePrompt';
import type { Place } from './candidates';

const place = (id: string, name: string): Place => ({
  id, name, category: '한식', lat: 37.5, lng: 126.9, walkMin: 5, kakaoPlaceId: '', active: true, createdBy: 'u',
});
const places = [place('a', '가집'), place('b', '나집')];
const none = () => false;

afterEach(() => localStorage.clear());

describe('다음 날 별점 묻기', () => {
  it('오늘 말고 가장 최근에 정한 곳을 "어제" 로 묻는다', () => {
    const t = ratePromptTarget(
      [{ id: '20261013', placeId: 'b' }, { id: '20261014', placeId: 'a' }, { id: '20261015', placeId: 'b' }],
      places, '20261015', none,
    );
    expect(t?.place.name).toBe('가집');
    expect(t?.when).toBe('어제');
  });

  it('금요일 결정은 월요일에 "3일 전" 으로 묻고, 그보다 오래되면 묻지 않는다', () => {
    expect(ratePromptTarget([{ id: '20261009', placeId: 'a' }], places, '20261012', none)?.when).toBe('3일 전');
    expect(ratePromptTarget([{ id: '20261008', placeId: 'a' }], places, '20261012', none)).toBeNull();
  });

  it('이미 내 별점이 있거나 지운 가게면 묻지 않는다', () => {
    expect(ratePromptTarget([{ id: '20261014', placeId: 'a' }], places, '20261015', (id) => id === 'a')).toBeNull();
    expect(ratePromptTarget([{ id: '20261014', placeId: 'gone' }], places, '20261015', none)).toBeNull();
  });

  it('닫으면 그날만 다시 띄우지 않는다', () => {
    dismissPrompt('20261015');
    expect(promptDismissed('20261015')).toBe(true);
    expect(promptDismissed('20261016')).toBe(false);
  });
});
