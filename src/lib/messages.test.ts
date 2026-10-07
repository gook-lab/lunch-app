import { describe, it, expect } from 'vitest';
import { selectCandidates, type Place, type Filters } from './candidates';
import { emptyMessage, noticeMessage } from './messages';
import { dayIdBefore } from './date';

const TODAY = '20260916';

const place = (id: string, over: Partial<Place> = {}): Place => ({
  id,
  name: `가게${id}`,
  category: '한식',
  lat: 37.5,
  lng: 126.9,
  walkMin: 6,
  kakaoPlaceId: `kakao-${id}`,
  active: true,
  createdBy: 'uid',
  ...over,
});

const filters = (over: Partial<Filters> = {}): Filters => ({
  maxWalkMin: 10,
  categories: [],
  excludeRecent: true,
  ...over,
});

const pool = (n: number, over: (i: number) => Partial<Place> = () => ({})) =>
  Array.from({ length: n }, (_, i) => place(String(i + 1), over(i)));

describe('noticeMessage — 공개 숫자가 실제와 일치한다', () => {
  it('보정이 일어나면 단계별 카운트를 그대로 말한다', () => {
    // 12곳 → 도보 3곳 탈락 → 카테고리 2곳 탈락 → 남은 7곳 중 5곳 최근 방문.
    const places = [
      ...Array.from({ length: 7 }, (_, i) => place(String(i + 1), { walkMin: 6 })),
      place('8', { walkMin: 6, category: '면' }),
      place('9', { walkMin: 6, category: '면' }),
      place('10', { walkMin: 18 }),
      place('11', { walkMin: 19 }),
      place('12', { walkMin: 20 }),
    ];
    const visits = [1, 2, 3, 4, 5].map((n) => ({
      id: dayIdBefore(TODAY, n),
      placeId: String(n),
    }));
    const r = selectCandidates(places, visits, filters({ categories: ['한식'] }), TODAY);
    const msg = noticeMessage(r)!;

    // "12곳 중 7곳" 이 아니라 "7곳 중 5곳" 이어야 한다.
    expect(msg).toContain('7곳 중 5곳');
    expect(msg).not.toContain('12곳 중');
    expect(msg).toContain('3곳을 다시 넣었습니다');
  });

  it('보정 없이 제외만 있으면 빠진 수만 말한다', () => {
    const places = pool(12);
    const visits = [1, 2].map((n) => ({ id: dayIdBefore(TODAY, n), placeId: String(n) }));
    const r = selectCandidates(places, visits, filters(), TODAY);
    expect(noticeMessage(r)).toBe('최근 2주 안에 간 2곳은 빠졌습니다.');
  });

  it('제외할 것도 없으면 아무 말 안 한다', () => {
    const r = selectCandidates(pool(8), [], filters(), TODAY);
    expect(noticeMessage(r)).toBeNull();
  });

  it('보정해도 5곳이 안 되면 풀이 얇다고 말한다', () => {
    const r = selectCandidates(pool(3), [], filters(), TODAY);
    expect(noticeMessage(r)).toContain('후보가 3곳뿐입니다');
    expect(noticeMessage(r)).toContain('20곳');
  });

  it('후보가 0곳이면 안내는 emptyMessage 쪽이 맡는다', () => {
    const r = selectCandidates([], [], filters(), TODAY);
    expect(noticeMessage(r)).toBeNull();
  });
});

describe('emptyMessage — 원인을 짚되 칩을 대신 풀지 않는다', () => {
  it('도보가 원인이면 넓혔을 때의 수를 말한다', () => {
    const r = selectCandidates(
      [place('1', { walkMin: 8 }), place('2', { walkMin: 9 })],
      [],
      filters({ maxWalkMin: 5 }),
      TODAY,
    );
    expect(emptyMessage(r)).toBe('도보 10분으로 넓히면 2곳입니다.');
  });

  it('넓혀도 없으면 그렇게 말한다', () => {
    const r = selectCandidates(pool(3, () => ({ walkMin: 30 })), [], filters({ maxWalkMin: 5 }), TODAY);
    expect(emptyMessage(r)).toBe('도보 10분으로 넓혀도 해당하는 곳이 없습니다.');
  });

  it('카테고리가 원인이면 풀었을 때의 수를 말한다', () => {
    const r = selectCandidates(pool(6), [], filters({ categories: ['면'] }), TODAY);
    expect(emptyMessage(r)).toBe('고른 카테고리에 해당하는 곳이 없습니다. 카테고리를 풀면 6곳입니다.');
  });

  it('가게가 없으면 추가를 권한다', () => {
    expect(emptyMessage(selectCandidates([], [], filters(), TODAY))).toContain('아직 등록된 가게가 없습니다');
  });

  it('전부 꺼져 있으면 그렇게 말한다', () => {
    const r = selectCandidates(pool(4, () => ({ active: false })), [], filters(), TODAY);
    expect(emptyMessage(r)).toBe('등록된 4곳이 모두 꺼져 있습니다. 목록에서 다시 켜 주세요.');
  });

  it('후보가 있으면 null', () => {
    expect(emptyMessage(selectCandidates(pool(6), [], filters(), TODAY))).toBeNull();
  });
});

describe('noticeMessage — 제외를 껐을 때', () => {
  // 브라우저에서 제외 칩을 끄고 후보 11곳이 다 들어왔는데도 "최근 2주 안에
  // 간 7곳은 빠졌습니다" 가 떠 있었다. 빠진 곳이 없는데 빠졌다고 말했다.
  it('최근에 간 곳이 있어도 "빠졌습니다" 라고 하지 않는다', () => {
    const visits = [1, 2, 3].map((n) => ({ id: dayIdBefore(TODAY, n), placeId: String(n) }));
    const r = selectCandidates(pool(8), visits, filters({ excludeRecent: false }), TODAY);
    expect(r.candidates).toHaveLength(8);
    expect(r.excludedRecent).toBe(false);
    const msg = noticeMessage(r);
    expect(msg).not.toContain('빠졌습니다');
    expect(msg).toContain('3곳도 후보에 들어 있습니다');
  });

  it('최근에 간 곳이 없으면 아무 말 안 한다', () => {
    const r = selectCandidates(pool(8), [], filters({ excludeRecent: false }), TODAY);
    expect(noticeMessage(r)).toBeNull();
  });

  it('제외를 켰을 때는 기존 문구 그대로', () => {
    const visits = [1, 2].map((n) => ({ id: dayIdBefore(TODAY, n), placeId: String(n) }));
    const r = selectCandidates(pool(8), visits, filters(), TODAY);
    expect(r.excludedRecent).toBe(true);
    expect(noticeMessage(r)).toBe('최근 2주 안에 간 2곳은 빠졌습니다.');
  });
});
