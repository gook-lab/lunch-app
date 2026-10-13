import { describe, expect, it } from 'vitest';
import type { Place } from './candidates';
import { LEGACY_UID, summarizeRatings } from './ratings';

const place = (id: string, over: Partial<Place> = {}): Place => ({
  id,
  name: id,
  category: '한식',
  lat: 0,
  lng: 0,
  walkMin: 3,
  kakaoPlaceId: '',
  active: true,
  createdBy: 'x',
  ...over,
});

describe('별점 요약', () => {
  it('사람마다 한 표씩 평균을 내고 내 표를 찾는다', () => {
    const m = summarizeRatings(
      [place('a'), place('b')],
      [
        { placeId: 'a', uid: 'u1', score: 5 },
        { placeId: 'a', uid: 'me', score: 4, review: '맛있어요' },
        { placeId: 'a', uid: 'u2', score: 4 },
      ],
      'me',
    );
    expect(m.get('a')).toMatchObject({ average: 4.3, count: 3 });
    expect(m.get('a')?.mine?.score).toBe(4);
    expect(m.get('a')?.reviews.map((r) => r.review)).toEqual(['맛있어요']);
    expect(m.has('b')).toBe(false);
  });

  it('가게 문서의 예전 별점·한줄평은 한 표로 센다', () => {
    const m = summarizeRatings(
      [place('a', { rating: 2, review: '예전 평' })],
      [{ placeId: 'a', uid: 'u1', score: 4 }],
      null,
    );
    expect(m.get('a')).toMatchObject({ average: 3, count: 2, mine: null });
    expect(m.get('a')?.reviews[0]).toMatchObject({ uid: LEGACY_UID, review: '예전 평' });
  });

  it('범위 밖 점수와 없는 가게의 표는 버린다', () => {
    const m = summarizeRatings(
      [place('a')],
      [
        { placeId: 'a', uid: 'u1', score: 9 },
        { placeId: 'zz', uid: 'u1', score: 5 },
      ],
      null,
    );
    expect(m.size).toBe(0);
  });
});
