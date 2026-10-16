// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeatherChip } from './WeatherChip';

// Mock the weather service
vi.mock('../services/weather', () => ({
  fetchWeather: vi.fn(),
}));

const mockFetchWeather = vi.mocked(
  (await import('../services/weather')).fetchWeather,
);

describe('WeatherChip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('사무실 위치가 없으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<WeatherChip office={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('날씨 조회 실패하면 아무것도 보이지 않는다', async () => {
    mockFetchWeather.mockResolvedValueOnce(null);
    const { container } = render(<WeatherChip office={{ lat: 37.5, lng: 127 }} />);
    // 약간의 시간이 필요 (API 호출)
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container.firstChild).toBeNull();
  });

  it('날씨 데이터가 있으면 온도와 날씨를 표시한다', async () => {
    mockFetchWeather.mockResolvedValueOnce({
      current: {
        temperature_2m: 20,
        apparent_temperature: 20,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    });

    render(<WeatherChip office={{ lat: 37.5, lng: 127 }} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByText(/맑음/)).toBeTruthy();
    expect(screen.getAllByText(/20°/).length).toBeGreaterThan(0);
  });

  it('비가 오면 힌트를 보여준다', async () => {
    mockFetchWeather.mockResolvedValueOnce({
      current: {
        temperature_2m: 15,
        apparent_temperature: 15,
        precipitation: 2,
        rain: 2,
        snowfall: 0,
        weather_code: 61,
        wind_speed_10m: 5,
      },
    });

    render(<WeatherChip office={{ lat: 37.5, lng: 127 }} />);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(screen.getByText(/비가 와요/)).toBeTruthy();
  });

  it('체감 온도가 높으면 더위 경고를 보여준다', async () => {
    mockFetchWeather.mockResolvedValueOnce({
      current: {
        temperature_2m: 32,
        apparent_temperature: 32,
        precipitation: 0,
        rain: 0,
        snowfall: 0,
        weather_code: 0,
        wind_speed_10m: 5,
      },
    });

    render(<WeatherChip office={{ lat: 37.5, lng: 127 }} />);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByText(/더워요/)).toBeTruthy();
  });

  it('비가 오면 5분 안 단추로 필터를 좁히고, 이미 좁혔으면 단추를 숨긴다', async () => {
    const rain = { current: { temperature_2m: 15, apparent_temperature: 14, precipitation: 2, rain: 2, snowfall: 0, weather_code: 61, wind_speed_10m: 5 } };
    mockFetchWeather.mockResolvedValue(rain);
    const set = vi.fn();
    const { rerender } = render(<WeatherChip office={{ lat: 37.5, lng: 127 }} onSetWalkFilter={set} />);
    fireEvent.click(await screen.findByRole('button', { name: '5분 안 가게만 보기' }));
    expect(set).toHaveBeenCalledWith(5);
    rerender(<WeatherChip office={{ lat: 37.5, lng: 127 }} nearOn onSetWalkFilter={set} />);
    expect(screen.queryByRole('button', { name: '5분 안 가게만 보기' })).toBeNull();
  });
});
