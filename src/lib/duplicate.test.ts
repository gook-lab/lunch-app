import { describe, it, expect } from 'vitest';
import type { Place } from './candidates';
import { SAME_PLACE_METERS, findDuplicate } from './duplicate';

const OFFICE = { lat: 37.5, lng: 127.0 };

/** 정북으로 m 미터 떨어진 좌표. 위도 1도 ≈ 111,320m. */
function north(meters: number) {
  return { lat: OFFICE.lat + meters / 111_320, lng: OFFICE.lng };
}

function place(over: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    name: '김밥천국',
    category: '분식',
    lat: OFFICE.lat,
    lng: OFFICE.lng,
    walkMin: 4,
    kakaoPlaceId: 'kakao-1',
    active: true,
    createdBy: 'uid',
    ...over,
  };
}

describe('findDuplicate', () => {
  it('kakaoPlaceId 가 같으면 잡는다', () => {
    const hit = findDuplicate([place()], {
      name: '전혀 다른 이름',
      ...north(5000),
      kakaoPlaceId: 'kakao-1',
    });
    expect(hit?.reason).toBe('kakao-id');
    expect(hit?.place.id).toBe('p1');
    expect(hit?.meters).toBeNull();
  });

  it('id 가 없어도 이름이 같고 가까우면 잡는다 — 길게 눌러 넣는 경로', () => {
    const hit = findDuplicate([place()], { name: '김밥천국', ...north(10) });
    expect(hit?.reason).toBe('name-and-distance');
    expect(hit?.meters).toBeLessThan(SAME_PLACE_METERS);
  });

  it('이름이 같아도 멀면 다른 가게다', () => {
    expect(findDuplicate([place()], { name: '김밥천국', ...north(200) })).toBeNull();
  });

  it('가까워도 이름이 다르면 다른 가게다', () => {
    expect(findDuplicate([place()], { name: '이삭토스트', ...north(5) })).toBeNull();
  });

  it('공백 차이는 같은 이름으로 본다', () => {
    expect(findDuplicate([place({ name: '김밥 천국' })], { name: '김밥천국', ...north(5) })).not.toBeNull();
  });

  it('경계 바로 밖은 안 잡는다', () => {
    const just = findDuplicate([place()], { name: '김밥천국', ...north(SAME_PLACE_METERS + 5) });
    expect(just).toBeNull();
  });

  it('후보가 여럿이면 가장 가까운 것을 준다', () => {
    const near = place({ id: 'near', ...north(5), kakaoPlaceId: 'k-near' });
    const far = place({ id: 'far', ...north(25), kakaoPlaceId: 'k-far' });
    const hit = findDuplicate([far, near], { name: '김밥천국', ...north(0) });
    expect(hit?.place.id).toBe('near');
  });

  it('이름이 비면 잡지 않는다 — 입력 중에 경고가 뜨면 안 된다', () => {
    expect(findDuplicate([place()], { name: '   ', ...north(0) })).toBeNull();
  });

  it('꺼진 가게도 잡는다 — 다시 넣게 두면 문서가 둘이 된다', () => {
    const off = place({ active: false });
    expect(findDuplicate([off], { name: '김밥천국', ...north(3) })).not.toBeNull();
  });
});
