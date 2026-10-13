import { describe, expect, it } from 'vitest';
import { tally, winnersOf } from './predictions';

const v = (uid: string, placeId: string, name = uid) => ({ uid, placeId, name });

describe('예측 정리', () => {
  it('후보별로 많은 순, 같으면 후보 순서, 후보 밖 표는 뺀다', () => {
    const r = tally([v('a', 'p2'), v('b', 'p1'), v('c', 'p2'), v('d', 'gone'), v('e', 'p3')], ['p1', 'p2', 'p3']);
    expect(r.map((x) => [x.placeId, x.count])).toEqual([['p2', 2], ['p1', 1], ['p3', 1]]);
    expect(r[0].names).toEqual(['a', 'c']);
  });

  it('맞힌 사람은 당첨 가게에 찍은 이름', () => {
    expect(winnersOf([v('a', 'p1', '민수'), v('b', 'p2', '지영'), v('c', 'p1', '하늘')], 'p1')).toEqual(['민수', '하늘']);
    expect(winnersOf([], 'p1')).toEqual([]);
  });
});
