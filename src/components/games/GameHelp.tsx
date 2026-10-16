import { useState } from 'react';
import { Popover } from '@gook-lab/ui';
import { GAME_HELP, fairnessNote } from './help';
import { GAME_MODES, MODE_ICON, type GameMode } from './types';

/**
 * 게임 제목과 (?) 설명. 누르면 한 장면 그림 + 한 줄 소개 + 볼거리가 뜬다(10/15 사용자).
 * 그림(public/help/<id>.webp)은 한 판을 처음부터 결과 직전까지 찍은 반복 움짤이고, 열 때만 받는다.
 * 움직임 줄이기 설정이면 결과 장면 한 컷(<id>.still.webp)을 보인다. 없거나 깨지면 그림 자리 없이 글만 보인다.
 */
export function GameTitle({ mode }: { mode: GameMode }) {
  const label = GAME_MODES.find((m) => m.id === mode)?.label ?? '게임';
  const help = GAME_HELP[mode];
  const [noImage, setNoImage] = useState<string | null>(null);
  return (
    <div className="gametitle">
      <h2 className="gametitle__name">
        <span aria-hidden="true">{MODE_ICON[mode]} </span>
        {label}
      </h2>
      <Popover
        className="gamehelp"
        aria-label={`${label} 설명`}
        trigger={
          <button type="button" className="gametitle__help" aria-label={`${label} 설명 보기`}>
            ?
          </button>
        }
      >
        <Popover.Title>
          {MODE_ICON[mode]} {label}
        </Popover.Title>
        {noImage !== mode && (
          <picture>
            <source srcSet={`${import.meta.env.BASE_URL}help/${mode}.still.webp`} media="(prefers-reduced-motion: reduce)" />
            <img
              className="gamehelp__img"
              src={`${import.meta.env.BASE_URL}help/${mode}.webp`}
              alt=""
              width={320}
              height={200}
              loading="lazy"
              onError={() => setNoImage(mode)}
            />
          </picture>
        )}
        <p className="gamehelp__summary">{help.summary}</p>
        <ul className="gamehelp__moments">
          {help.moments.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="gamehelp__fair">{fairnessNote(mode)}</p>
      </Popover>
    </div>
  );
}
