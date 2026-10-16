/**
 * 회사 날씨 한 줄 — 지금 기온·하늘과 점심 길 조언.
 * 좌표가 없거나 조회가 안 되면 아무것도 그리지 않는다. 날씨는 후보·당첨에 닿지 않는다(필터 단추만 제안).
 */
import { useEffect, useState } from 'react';
import { fetchWeather, type WeatherData } from '../services/weather';
import { getWeatherLabel, getLunchHint } from '../lib/weather';
import './WeatherChip.css';

export interface WeatherChipProps {
  office: { lat: number; lng: number } | null;
  /** 이미 5분 안으로 좁혀 두었으면 단추를 숨긴다. */
  nearOn?: boolean;
  onSetWalkFilter?: (minutes: number) => void;
  /** inline 이면 머리말 날짜 줄에 이어 붙는 한 줄(카드 없이). 오른쪽 칸이 붐벼서 위로 올렸다(10/16 사용자). */
  variant?: 'card' | 'inline';
}

export function WeatherChip({ office, nearOn = false, onSetWalkFilter, variant = 'card' }: WeatherChipProps) {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const lat = office?.lat;
  const lng = office?.lng;

  useEffect(() => {
    if (lat == null || lng == null) {
      setWeather(null);
      return;
    }
    let alive = true;
    fetchWeather(lat, lng).then((data) => {
      if (alive) setWeather(data);
    });
    return () => {
      alive = false;
    };
  }, [lat, lng]);

  if (!office || !weather) return null;

  const { current } = weather;
  const { emoji, label } = getWeatherLabel(current.weather_code);
  const hint = getLunchHint(weather);

  const near = hint?.action === 'setWalkFilter5' && onSetWalkFilter && !nearOn;
  if (variant === 'inline') {
    return (
      <span className="weather-line" role="group" aria-label="회사 날씨">
        <span className="weather-line__now" title={`체감 ${Math.round(current.apparent_temperature)}°`}>
          <span aria-hidden="true">{emoji}</span> {Math.round(current.temperature_2m)}° {label}
        </span>
        {hint && <span className="weather-line__hint">{hint.message}</span>}
        {near && (
          <button type="button" className="linkish weather-line__near" onClick={() => onSetWalkFilter(5)}>
            5분 안 가게만 보기
          </button>
        )}
      </span>
    );
  }

  return (
    <section className="weather" aria-label="회사 날씨">
      <p className="weather__now">
        <span aria-hidden="true">{emoji}</span> {Math.round(current.temperature_2m)}° {label}
        <span className="weather__feel">체감 {Math.round(current.apparent_temperature)}°</span>
      </p>
      {hint && <p className="weather__hint">{hint.message}</p>}
      {near && (
        <button type="button" className="weather__near" onClick={() => onSetWalkFilter(5)}>
          5분 안 가게만 보기
        </button>
      )}
    </section>
  );
}
