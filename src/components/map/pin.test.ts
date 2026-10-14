// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { pinElement } from './pin';
import type { Place } from '../../lib/candidates';

const place = (over: Partial<Place> = {}): Place => ({
  id: 'p1',
  name: '천수냉면',
  category: '면',
  lat: 37.5,
  lng: 127,
  walkMin: 3,
  kakaoPlaceId: 'k1',
  active: true,
  createdBy: 'u',
  ...over,
});

describe('지도 가게 핀', () => {
  it('그림·이름·도보 시간을 핀에 쓰고 읽을 이름을 단다', () => {
    const el = pinElement(place(), false);
    expect(el.textContent).toBe('🍜천수냉면3분');
    expect(el.getAttribute('aria-label')).toBe('천수냉면, 면, 도보 3분');
    expect(el.type).toBe('button');
  });

  it('오늘 정한 곳은 별, 잠시 뺀 가게는 표시가 붙는다', () => {
    const today = pinElement(place(), true);
    expect(today.classList.contains('map__pin--today')).toBe(true);
    expect(today.textContent?.startsWith('⭐')).toBe(true);
    const off = pinElement(place({ active: false }), false);
    expect(off.classList.contains('map__pin--off')).toBe(true);
    expect(off.getAttribute('aria-label')).toContain('잠시 뺀 가게');
  });

  it('가게 이름은 글자로만 들어간다', () => {
    const el = pinElement(place({ name: '<img src=x onerror=alert(1)>' }), false);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('<img');
  });

  it('칩 밖 카테고리는 포크', () => {
    expect(pinElement(place({ category: '카페' }), false).textContent?.startsWith('🍴')).toBe(true);
  });
});
