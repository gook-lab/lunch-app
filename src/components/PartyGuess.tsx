/**
 * 팟 예측 — "우리 팟 게임은 어디가 나올까?" 를 멤버끼리 맞힌다.
 *
 * 표시 전용이다. 당첨은 지금처럼 방장 기기의 pickWinner 한 번이 정하고, 예측은 그 값을 보지도
 * 바꾸지도 않는다. 고를 수 있는 건 그 팟 메뉴의 후보 가게이고, 하위 메뉴(국밥·찌개 등)로 묶어 보인다.
 * 게임을 시작하면 잠기고(규칙도 막는다), 결과가 나오면 맞힌 사람을 단다.
 */
import { useState } from 'react';
import type { Place } from '../lib/candidates';
import type { DayId } from '../lib/date';
import { avatarsIn } from '../lib/avatar';
import { isMember, partyGuesses } from '../lib/party';
import type { Party } from '../services/types';
import './PartyGuess.css';

interface Props {
  party: Party;
  /** 이 팟 메뉴의 후보 가게. */
  places: Place[];
  /** 모든 가게. 후보에서 빠진 곳(최근 방문 등)을 고른 예측도 이름으로 보이게. */
  allPlaces?: Place[];
  myUid: string | null;
  day: DayId;
  busy: boolean;
  onGuess?: (placeId: string | null) => void;
}

/** 하위 메뉴별 묶음. 하위 메뉴가 하나뿐이면 제목 없이 한 줄. */
function bySub(places: Place[]): { sub: string; places: Place[] }[] {
  const groups = new Map<string, Place[]>();
  for (const p of places) {
    const key = p.sub ?? '';
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return [...groups].map(([sub, list]) => ({ sub, places: list }));
}

export function PartyGuess({ party, places, allPlaces = [], myUid, day, busy, onGuess }: Props) {
  const [open, setOpen] = useState(false);
  const { counts, mine, hits, total } = partyGuesses(party, myUid);

  // 결과가 나온 뒤 — 맞힌 사람. 아무도 예측 안 했으면 아무 말도 안 한다.
  if (party.game) {
    if (total === 0) return null;
    const names = avatarsIn(hits, day).map((a) => `${a.emoji} ${a.label}`);
    return (
      <p className="pguess__hits" role="status">
        🎯 {names.length > 0 ? `${names.join(', ')}님이 맞혔어요` : '이번엔 아무도 못 맞혔어요'}
      </p>
    );
  }
  if (places.length < 2) return null;

  const joined = isMember(party, myUid);
  const nameOf = (id: string) =>
    (places.find((p) => p.id === id) ?? allPlaces.find((p) => p.id === id))?.name ?? '지금 없는 가게';
  const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2);
  const groups = bySub(places);

  return (
    <div className="pguess">
      <div className="pguess__head">
        <p className="pguess__title">
          <span aria-hidden="true">🔮 </span>어디 나올까?
          <span className="pguess__sum">
            {mine
              ? ` · 내 예측 ${nameOf(mine)}`
              : total > 0
                ? ` · ${top.map(([id, n]) => `${nameOf(id)} ${n}`).join(' · ')}`
                : ' · 아직 아무도 안 골랐어요'}
          </span>
        </p>
        {joined && onGuess && (
          <button type="button" className="linkish pguess__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : mine ? '바꾸기' : '맞혀 보기'}
          </button>
        )}
      </div>
      {!joined && <p className="pguess__hint">팟에 들어오면 같이 맞힐 수 있어요</p>}
      {joined && open && onGuess && (
        <div className="pguess__groups">
          {groups.map((g) => (
            <div key={g.sub} className="pguess__group" role="group" aria-label={g.sub || '가게'}>
              {groups.length > 1 && g.sub && <span className="pguess__sub">{g.sub}</span>}
              {g.places.map((p) => {
                const n = counts.get(p.id) ?? 0;
                const on = mine === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={on ? 'pguess__chip pguess__chip--on' : 'pguess__chip'}
                    aria-pressed={on}
                    aria-label={n > 0 ? `${p.name}, ${n}명이 골랐어요` : p.name}
                    disabled={busy}
                    // 같은 곳을 다시 누르면 예측을 지운다.
                    onClick={() => onGuess(on ? null : p.id)}
                  >
                    {on && <span aria-hidden="true">✓ </span>}
                    {p.name}
                    {n > 0 && <span className="pguess__n"> {n}</span>}
                  </button>
                );
              })}
            </div>
          ))}
          <p className="pguess__hint">게임을 시작하면 바꿀 수 없어요. 당첨에는 영향이 없어요.</p>
        </div>
      )}
    </div>
  );
}
