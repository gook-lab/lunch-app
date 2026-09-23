import { describe, it, expect } from 'vitest';
import { straightLineMeters, walkMinutesBetween } from './walk';

// 좌표는 검증 가능한 공개 지점만 쓴다. 사무실 좌표는 아직 정해지지 않았으므로
// 테스트에서도 지어내지 않고 인자로 넘긴다.
const SEOUL_CITY_HALL = { lat: 37.5663, lng: 126.9779 };
const GWANGHWAMUN = { lat: 37.5759, lng: 126.9769 };

describe('straightLineMeters', () => {
  it('같은 점은 0', () => {
    expect(straightLineMeters(37.5, 126.9, 37.5, 126.9)).toBe(0);
  });

  it('시청 — 광화문은 약 1.07km', () => {
    const m = straightLineMeters(
      SEOUL_CITY_HALL.lat,
      SEOUL_CITY_HALL.lng,
      GWANGHWAMUN.lat,
      GWANGHWAMUN.lng,
    );
    // 위도 0.0096도 ≈ 1.07km. 오차 30m 안.
    expect(m).toBeGreaterThan(1040);
    expect(m).toBeLessThan(1100);
  });

  it('방향이 바뀌어도 같은 거리', () => {
    const a = straightLineMeters(37.5, 126.9, 37.51, 126.91);
    const b = straightLineMeters(37.51, 126.91, 37.5, 126.9);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('walkMinutesBetween', () => {
  it('직선 1.07km 는 우회 1.3배 · 67m/분으로 약 21분', () => {
    // 1070 * 1.3 / 67 = 20.8
    expect(walkMinutesBetween(GWANGHWAMUN.lat, GWANGHWAMUN.lng, SEOUL_CITY_HALL)).toBe(21);
  });

  it('같은 자리여도 0분이 아니라 1분', () => {
    expect(walkMinutesBetween(SEOUL_CITY_HALL.lat, SEOUL_CITY_HALL.lng, SEOUL_CITY_HALL)).toBe(1);
  });

  it('300m 쯤이면 6분', () => {
    // 위도 0.0027도 ≈ 300m → 300 * 1.3 / 67 = 5.8
    const near = { lat: SEOUL_CITY_HALL.lat + 0.0027, lng: SEOUL_CITY_HALL.lng };
    expect(walkMinutesBetween(near.lat, near.lng, SEOUL_CITY_HALL)).toBe(6);
  });

  it('규칙의 상한(60분)을 넘는 거리도 계산은 된다 — 막는 것은 규칙과 화면', () => {
    const far = { lat: SEOUL_CITY_HALL.lat + 0.05, lng: SEOUL_CITY_HALL.lng };
    expect(walkMinutesBetween(far.lat, far.lng, SEOUL_CITY_HALL)).toBeGreaterThan(60);
  });
});
