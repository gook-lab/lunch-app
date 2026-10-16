/**
 * 날씨 정보 칩 — 온도, 상황, 점심 힌트.
 *
 * 사무실 위치가 없으면 아무것도 보이지 않는다.
 * 날씨 조회 실패도 조용히 감춘다 (데모 모드에서 API 차단 가능).
 */

import { useEffect, useState } from 'react';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getWeatherLabel, getLunchHint } from '../lib/weather';
import './WeatherChip.css';

export interface WeatherChipProps {
  office: { lat: number; lng: number } | null;
  onSetWalkFilter?: (minutes: number) => void;
}

export function WeatherChip({ office, onSetWalkFilter }: WeatherChipProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);

  useEffect(() => {
    if (!office) {
      setWeather(null);
      return;
    }

    fetchWeather(office.lat, office.lng)
      .then((data) => {
        setWeather(data);
      })
      .catch(() => {
        setWeather(null);
      });
  }, [office]);

  if (!office || !weather) {
    return null;
  }

  const { current } = weather;
  const weatherLabel = getWeatherLabel(current.weather_code);
  const hint = getLunchHint(weather);
  const temp = Math.round(current.apparent_temperature);

  return (
    <div className="weather-chip">
      <div className="weather-chip__main">
        <span className="weather-chip__weather">
          {weatherLabel.emoji} {temp}° {weatherLabel.label}
        </span>
      </div>
      {hint && (
        <div className="weather-chip__hint">
          <p className="weather-chip__hint-text">{hint.message}</p>
          {hint.action === 'setWalkFilter5' && onSetWalkFilter && (
            <button
              type="button"
              className="weather-chip__action-btn"
              onClick={() => onSetWalkFilter(5)}
              aria-label="가까운 곳만 보기 (5분 이내)"
            >
              가까운 곳만
            </button>
          )}
        </div>
      )}
    </div>
  );
}
