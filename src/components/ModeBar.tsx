import { compactGameIds } from '../lib/gameRecents';
import { GAME_MODES, MODE_ICON, type GameMode } from './games/types';

const RECOMMENDED_MODE_IDS: GameMode[] = [
  'archery',
  'wheel',
  'ladder',
  'claw',
  'fishing',
  'cards',
  'pinball',
  'tournament',
];

function revealPickedMode(node: HTMLElement | null) {
  const on = node?.querySelector<HTMLElement>('.modebar__item--on');
  if (!node || !on) return;
  const box = node.getBoundingClientRect();
  const item = on.getBoundingClientRect();
  if (item.right > box.right || item.left < box.left) node.scrollLeft += item.left - box.left - 8;
  if (item.bottom > box.bottom || item.top < box.top) node.scrollTop += item.top - box.top - 8;
}

interface ModeBarProps {
  wide: boolean;
  mode: GameMode;
  recentGames: GameMode[];
  showAll: boolean;
  spinning: boolean;
  onPick: (mode: GameMode) => void;
  onToggleAll: () => void;
}

/*
 * 게임 방식 고르기. 데스크톱에선 왼쪽 레일이라 DOM 에서도 메뉴 칩보다 앞에 둔다 — 뒤에 두면
 * Tab 이 오른쪽 메뉴 칩을 다 지난 뒤에 왼쪽 레일로 되돌아갔다(10/15 리뷰). 휴대폰은 칩 아래에
 * 보이므로 DOM 도 칩 뒤다. 자리(grid)는 CSS 가 정하므로 화면은 그대로다.
 */
export function ModeBar({ wide, mode, recentGames, showAll, spinning, onPick, onToggleAll }: ModeBarProps) {
  const compactModes = compactGameIds(mode, recentGames, RECOMMENDED_MODE_IDS, wide ? 8 : 6, ['pinball', 'tournament']);
  // 데스크톱 레일도 추천·최근 8개만 먼저 보이고 나머지는 전체 게임 보기 아래에 둔다(10/17 정보 위계).
  // 휴대폰은 6개 — 3칸×2줄이 화면 폭에 다 들어가 접힌 상태에선 옆으로 넘길 게 없다(토너먼트가 반쯤 잘렸다, 10/18).
  const visibleModes = showAll ? GAME_MODES : GAME_MODES.filter((item) => compactModes.includes(item.id));
  const hiddenGameCount = GAME_MODES.length - compactModes.length;
  const modeButtons = (
    <>
      {visibleModes.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-pressed={mode === m.id}
          className={mode === m.id ? 'modebar__item modebar__item--on' : 'modebar__item'}
          onClick={() => onPick(m.id)}
          disabled={spinning}
        >
          <span className="modebar__icon" aria-hidden="true">
            {MODE_ICON[m.id]}
          </span>
          {m.label}
        </button>
      ))}
    </>
  );
  if (wide) {
    return (
      <div className="modebar" role="group" aria-label="방식" ref={revealPickedMode}>
        {modeButtons}
        <button
          type="button"
          className="modebar__more modebar__all"
          aria-expanded={showAll}
          onClick={onToggleAll}
          disabled={spinning}
        >
          {showAll ? '게임 접기' : `전체 게임 보기 (${hiddenGameCount})`}
        </button>
      </div>
    );
  }
  return (
    <div className="modebar-shell">
      <div className="modebar" role="group" aria-label="방식" ref={revealPickedMode}>
        {modeButtons}
      </div>
      <div className="modebar-shell__action">
        <button type="button" className="modebar__more" aria-expanded={showAll} onClick={onToggleAll} disabled={spinning}>
          {showAll ? '게임 접기' : `전체 게임 보기 (${hiddenGameCount})`}
        </button>
      </div>
      {showAll && (
        <p className="modebar-shell__hint" role="status">
          좌우로 밀어 다른 게임 보기 <span aria-hidden="true">↔</span>
        </p>
      )}
    </div>
  );
}
