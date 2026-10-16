/**
 * 머리말 설정 — 효과음·화면 테마·계절 테마. 모두 이 브라우저에만 남는다.
 * 소리 버튼이 게임판 위에 있으면 게임마다 눈에 걸렸다(10/14 사용자). 한 번 정하면 잘 안 바꾸는
 * 값이라 머리말 한 곳으로 모았다.
 */
import { useState } from 'react';
import { Popover, Switch } from '@gook-lab/ui';
import { playChime, setSoundOn, soundOn } from '../lib/celebrate';
import { savedTheme, saveTheme, type ThemeMode } from '../lib/theme';
import { savedSeason, saveSeason, type SeasonMode } from '../lib/season';

const THEMES: { id: ThemeMode; label: string }[] = [
  { id: 'auto', label: '자동' },
  { id: 'light', label: '밝게' },
  { id: 'dark', label: '어둡게' },
];

const SEASONS: { id: SeasonMode; label: string }[] = [
  { id: 'auto', label: '자동' },
  { id: 'spring', label: '봄 🌸' },
  { id: 'summer', label: '여름 ☀️' },
  { id: 'autumn', label: '가을 🍂' },
  { id: 'winter', label: '겨울 ❄️' },
  { id: 'off', label: '끄기' },
];

export function Settings() {
  const [sound, setSound] = useState(soundOn);
  const [theme, setTheme] = useState(savedTheme);
  const [season, setSeason] = useState(savedSeason);

  return (
    <Popover
      align="end"
      className="settings"
      aria-label="설정"
      trigger={
        <button type="button" className="linkish app__tool">
          설정
        </button>
      }
    >
      <Popover.Title>설정</Popover.Title>
      <Switch
        checked={sound}
        label="효과음"
        hint="게임을 시작하거나 결과가 나올 때 소리가 나요. 처음에는 꺼져 있어요."
        onCheckedChange={(on) => {
          setSoundOn(on);
          setSound(on);
          if (on) playChime();
        }}
      />
      <div className="settings__row">
        <span className="settings__label" id="settings-theme">
          화면
        </span>
        <div className="segmented" role="group" aria-labelledby="settings-theme">
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={theme === t.id ? 'on' : undefined}
              aria-pressed={theme === t.id}
              onClick={() => {
                saveTheme(t.id);
                setTheme(t.id);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings__row">
        <span className="settings__label" id="settings-season">
          계절 테마
        </span>
        <div className="segmented" role="group" aria-labelledby="settings-season">
          {SEASONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={season === s.id ? 'on' : undefined}
              aria-pressed={season === s.id}
              onClick={() => {
                saveSeason(s.id);
                setSeason(s.id);
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </Popover>
  );
}
