// @vitest-environment jsdom
/**
 * 지도 길게 누르기 — 한 손가락으로 0.5초 누르면 그 자리에 가게 넣기 폼이 열린다.
 * 두 손가락으로 집어 확대(핀치)할 때는 열리지 않아야 한다. 휴대폰에서 지도를 키우려다
 * 임시 핀과 폼이 떴다(코드 리뷰 재현).
 *
 * 카카오 SDK 는 가짜다. 핀(Marker)이 몇 개 생겼는지만 센다.
 */
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setOfficeOverride } from '../lib/walk';

const markers: unknown[] = [];
vi.mock('../services/lunch', () => ({ updatePlace: vi.fn(), addPlace: vi.fn(), rate: vi.fn(), saveOffice: vi.fn() }));
vi.mock('../services/kakao', () => {
  class LatLng {
    lat: number;
    lng: number;
    constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng; }
    getLat() { return this.lat; }
    getLng() { return this.lng; }
  }
  class Obj { setMap() {} setZIndex() {} getContent() { return null; } }
  const maps = {
    LatLng,
    Point: class { x: number; y: number; constructor(x: number, y: number) { this.x = x; this.y = y; } },
    Map: class {
      getLevel() { return 4; }
      relayout() {}
      setBounds() {}
      setLevel() {}
      panTo() {}
      getCenter() { return new LatLng(37.5, 127); }
      getProjection() {
        return { coordsFromContainerPoint: (p: { x: number; y: number }) => new LatLng(37.5 + p.y / 1e5, 127 + p.x / 1e5) };
      }
    },
    CustomOverlay: Obj,
    Circle: Obj,
    Marker: class extends Obj { constructor() { super(); markers.push(this); } },
    LatLngBounds: class { extend() {} },
    event: { addListener() {}, removeListener() {} },
    services: { Places: class {}, Status: { OK: 'OK' } },
  };
  return { loadKakaoMaps: async () => maps, clearKakaoLoadFailure() {}, kakaoJsKey: () => 'x', KakaoLoadError: class extends Error {} };
});
import MapTab from './MapTab';

beforeEach(() => {
  markers.length = 0;
  setOfficeOverride({ lat: 37.5665, lng: 126.978 });
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setOfficeOverride(null);
});

const pointer = (type: string, x: number, y: number, id: number) =>
  Object.assign(new Event(type, { bubbles: true }), { clientX: x, clientY: y, pointerId: id });

async function mount() {
  const r = render(<MapTab places={[]} onChanged={() => {}} onOfficeChanged={() => {}} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  const canvas = r.container.querySelector('.map__canvas') as HTMLElement;
  expect(canvas).toBeTruthy();
  return { r, canvas };
}

const formOpen = (c: HTMLElement) => !!c.querySelector('input[placeholder="가게 이름"]');

describe('지도 길게 누르기', () => {
  it('한 손가락으로 누르고 있으면 그 자리에 핀을 꽂고 넣기 폼을 연다', async () => {
    const { r, canvas } = await mount();
    act(() => { canvas.dispatchEvent(pointer('pointerdown', 100, 100, 1)); });
    act(() => { vi.advanceTimersByTime(600); });
    expect(markers).toHaveLength(1);
    expect(formOpen(r.container)).toBe(true);
  });

  it('두 손가락으로 집어 확대하면 핀도 폼도 안 뜬다', async () => {
    const { r, canvas } = await mount();
    act(() => {
      canvas.dispatchEvent(pointer('pointerdown', 100, 100, 1));
      canvas.dispatchEvent(pointer('pointerdown', 200, 200, 2));
      canvas.dispatchEvent(pointer('pointermove', 260, 260, 2));
    });
    act(() => { vi.advanceTimersByTime(600); });
    expect(markers).toHaveLength(0);
    expect(formOpen(r.container)).toBe(false);
  });
});
