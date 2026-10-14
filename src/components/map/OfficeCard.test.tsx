// @vitest-environment jsdom
/**
 * 회사 위치 카드 — GPS 로 정하기, 확인 한 번, 저장 후 새 기준.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfficeCard } from './OfficeCard';
import { officeCoord, officeSource, setOfficeOverride, walkMinutesBetween } from '../../lib/walk';
import { saveOffice } from '../../services/lunch';

vi.mock('../../services/lunch', () => ({ saveOffice: vi.fn(async () => {}) }));

const HITS = [
  { id: '1', place_name: '강남파이낸스센터', road_address_name: '서울 강남구 테헤란로 152', address_name: '', x: '127.0363', y: '37.5000' },
];
const keywordSearch = vi.fn((_q: string, cb: (data: unknown[], status: string) => void) => cb(HITS, 'OK'));
vi.mock('../../services/kakao', () => ({
  loadKakaoMaps: async () => ({
    services: { Places: class { keywordSearch = keywordSearch; }, Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' } },
  }),
}));

const CITY_HALL = { lat: 37.5665, lng: 126.978 };

function stubGps(result: { lat: number; lng: number; accuracy?: number } | { code: number }) {
  const getCurrentPosition = vi.fn((ok: PositionCallback, fail: PositionErrorCallback) => {
    if ('code' in result) fail({ code: result.code } as GeolocationPositionError);
    else ok({ coords: { latitude: result.lat, longitude: result.lng, accuracy: result.accuracy ?? 20 } } as GeolocationPosition);
  });
  Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
  return getCurrentPosition;
}

beforeEach(() => {
  setOfficeOverride(CITY_HALL);
  vi.mocked(saveOffice).mockClear();
});

afterEach(() => {
  cleanup();
  setOfficeOverride(null);
});

/** 이미 정해 둔 회사면 카드가 한 줄로 접혀 있다. 펼친다. */
function unfold() {
  const more = screen.queryByRole('button', { name: '바꾸기' });
  if (more) fireEvent.click(more);
}

describe('회사 위치 — 지금 내 위치로', () => {
  it('GPS 좌표를 받아 얼마나 옮기는지 보여 주고, 확인하면 저장하고 새 기준으로 잰다', async () => {
    // 시청에서 북쪽으로 약 1.1km
    stubGps({ lat: 37.5765, lng: 126.978 });
    const onSaved = vi.fn();
    render(<OfficeCard onSaved={onSaved} />);
    unfold();

    fireEvent.click(screen.getByRole('button', { name: /지금 내 위치로/ }));
    expect(screen.getByText(/약 1\.1km 옮겨요/)).toBeTruthy();
    expect(saveOffice).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 위치로 정하기' }));
    });
    expect(saveOffice).toHaveBeenCalledWith({ lat: 37.5765, lng: 126.978 });
    expect(onSaved).toHaveBeenCalled();
    expect(officeCoord()).toEqual({ lat: 37.5765, lng: 126.978 });
    expect(officeSource()).toBe('saved');
    // 새 회사 바로 옆 가게는 1분 거리가 된다.
    expect(walkMinutesBetween(37.5766, 126.978)).toBe(1);
  });

  it('취소하면 저장하지 않는다', () => {
    stubGps({ lat: 37.5765, lng: 126.978 });
    render(<OfficeCard onSaved={() => {}} />);
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지금 내 위치로/ }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(saveOffice).not.toHaveBeenCalled();
    // 이미 정해 둔 회사라 다시 한 줄로 접힌다.
    expect(screen.getByRole('button', { name: '바꾸기' })).toBeTruthy();
  });

  it('위치 권한이 꺼져 있으면 그렇게 알린다', () => {
    stubGps({ code: 1 });
    render(<OfficeCard onSaved={() => {}} />);
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지금 내 위치로/ }));
    expect(screen.getByRole('alert').textContent).toContain('위치를 허용하면');
  });

  it('한국 밖 좌표는 받지 않는다(규칙과 같은 범위)', () => {
    stubGps({ lat: 35.68, lng: 139.76 }); // 도쿄
    render(<OfficeCard onSaved={() => {}} />);
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지금 내 위치로/ }));
    expect(screen.getByRole('alert').textContent).toContain('한국에 있는 위치로');
    expect(screen.queryByRole('button', { name: '이 위치로 정하기' })).toBeNull();
  });

  it('GPS 오차가 크면 창가에서 다시 해 보라고 덧붙인다', () => {
    stubGps({ lat: 37.567, lng: 126.978, accuracy: 450 });
    render(<OfficeCard onSaved={() => {}} />);
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지금 내 위치로/ }));
    expect(screen.getByText(/약 450m 차이 날 수 있어요/)).toBeTruthy();
  });
});

describe('회사 위치 — 지도 가운데로', () => {
  it('지도가 있으면 가운데 좌표로 제안한다', () => {
    render(<OfficeCard onSaved={() => {}} getMapCenter={() => ({ lat: 37.5665, lng: 126.9781 })} />);
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지도 가운데로/ }));
    expect(screen.getByText('지금 회사 위치와 거의 같아요.')).toBeTruthy();
  });

  it('지도에서 찍기 — 누른 자리를 받아 확인을 띄우고, 취소하면 핀을 걷는다', () => {
    let deliver: ((c: { lat: number; lng: number }) => void) | null = null;
    const onCancelPick = vi.fn();
    const { rerender } = render(
      <OfficeCard onSaved={() => {}} onStartPick={(cb) => { deliver = cb; }} onCancelPick={onCancelPick} />,
    );
    unfold();
    fireEvent.click(screen.getByRole('button', { name: /지도에서 찍기/ }));
    rerender(
      <OfficeCard onSaved={() => {}} onStartPick={(cb) => { deliver = cb; }} onCancelPick={onCancelPick} picking />,
    );
    expect(screen.getByText(/지도에서 회사 자리를 눌러 주세요/)).toBeTruthy();

    act(() => deliver?.({ lat: 37.5765, lng: 126.978 }));
    rerender(
      <OfficeCard onSaved={() => {}} onStartPick={(cb) => { deliver = cb; }} onCancelPick={onCancelPick} />,
    );
    expect(screen.getByText(/약 1\.1km 옮겨요/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancelPick).toHaveBeenCalled();
    expect(saveOffice).not.toHaveBeenCalled();
  });

  it('정해 둔 회사면 한 줄로 접혀 있고, 바꾸기로 펼친다', () => {
    render(<OfficeCard onSaved={() => {}} />);
    expect(screen.queryByRole('button', { name: /지금 내 위치로/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '바꾸기' }));
    expect(screen.getByRole('button', { name: /지금 내 위치로/ })).toBeTruthy();
  });

  it('지도가 없으면 그 단추를 보이지 않는다', () => {
    render(<OfficeCard onSaved={() => {}} />);
    unfold();
    expect(screen.queryByRole('button', { name: /지도 가운데로/ })).toBeNull();
  });
});

describe('회사 위치 — 건물·주소로 찾기', () => {
  it('찾은 건물을 고르면 지도에 미리 꽂고, 확인하면 그 좌표로 저장한다', async () => {
    setOfficeOverride(null);
    const onPreview = vi.fn();
    render(<OfficeCard onSaved={() => {}} onPreview={onPreview} />);

    fireEvent.change(screen.getByLabelText('회사 건물 이름이나 주소로 찾기'), { target: { value: '강남파이낸스' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '찾기' }));
    });
    expect(keywordSearch.mock.calls[0][0]).toBe('강남파이낸스');

    fireEvent.click(screen.getByRole('button', { name: /강남파이낸스센터/ }));
    expect(onPreview).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0363 });
    expect(screen.getByText(/테헤란로 152/)).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '이 위치로 정하기' }));
    });
    expect(saveOffice).toHaveBeenCalledWith({ lat: 37.5, lng: 127.0363 });
  });

  it('회사를 정하기 전에만 지도 누르기를 회사 후보로 받는다', () => {
    const tapRef = { current: null as ((c: { lat: number; lng: number }) => void) | null };
    setOfficeOverride(null);
    const { unmount } = render(<OfficeCard onSaved={() => {}} tapRef={tapRef} />);
    expect(tapRef.current).toBeTypeOf('function');
    act(() => tapRef.current?.({ lat: 37.57, lng: 126.98 }));
    expect(screen.getByRole('button', { name: '이 위치로 정하기' })).toBeTruthy();
    unmount();

    setOfficeOverride(CITY_HALL);
    render(<OfficeCard onSaved={() => {}} tapRef={tapRef} />);
    expect(tapRef.current).toBeNull();
  });
});
