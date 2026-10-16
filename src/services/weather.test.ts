// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('fetchWeather', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('같은 좌표의 동시 요청을 하나로 합친다', async () => {
    const response = Promise.resolve(new Response(null, { status: 503 }));
    const fetchMock = vi.fn(() => response);
    vi.stubGlobal('fetch', fetchMock);
    const { fetchWeather } = await import('./weather');

    await Promise.all([fetchWeather(37.5, 127), fetchWeather(37.5, 127)]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('실패한 좌표는 1분 동안 다시 요청하지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchWeather } = await import('./weather');

    expect(await fetchWeather(37.51, 127.01)).toBeNull();
    expect(await fetchWeather(37.51, 127.01)).toBeNull();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
