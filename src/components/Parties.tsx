/**
 * 점심 팟 — "오늘 면 갈 사람?" 을 모으고, 모인 사람끼리 게임 한 판.
 *
 * 이름은 없다. 모두 그날의 동물 아바타(lib/avatar.ts)로 보인다. 팟을 연 사람(방장)만
 * 마감·취소·게임을 할 수 있고, 나머지는 참여·나가기만 한다(규칙이 같은 선을 지킨다).
 *
 * 게임 공정성: 당첨은 방장 기기에서 App.spin 과 같은 pickWinner(Math.random) 로 한 번만 정해
 * 팟 문서에 남긴다. 저장이 끝나기 전에는 방장도 결과를 못 본다 — 보고 나서 다시 뽑을 길이 없다.
 * 모인 사람은 저장된 값으로 같은 연출을 다시 본다(PartyGame.tsx).
 */
import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, Sheet } from '@gook-lab/ui';
import type { Place } from '../lib/candidates';
import type { DayId } from '../lib/date';
import { MENUS, categoryHue } from '../lib/category';
import { avatarOf, avatarsIn } from '../lib/avatar';
import {
  PARTY_DEFAULT_MAX,
  PARTY_MAX,
  PARTY_MEMO_MAX,
  PARTY_MIN,
  PARTY_MODES,
  PHASE_LABEL,
  clampMax,
  defaultPartyTime,
  gameBoard,
  isMember,
  modeLabel,
  partyCandidates,
  partyInputProblem,
  partyPhase,
  sortParties,
} from '../lib/party';
import { pickWinner } from '../lib/weights';
import { withJosa } from '../lib/josa';
import { MODE_ICON, type GameMode } from './games/types';
import { PartyGamePlayer } from './PartyGame';
import type { Party, PartyGame, PartyInput, PartyStatus } from '../services/types';

export interface PartyActions {
  open: (input: PartyInput) => Promise<void>;
  join: (partyId: string) => Promise<void>;
  leave: (partyId: string) => Promise<void>;
  setStatus: (partyId: string, status: PartyStatus) => Promise<void>;
  cancel: (partyId: string) => Promise<void>;
  saveGame: (partyId: string, game: PartyGame) => Promise<void>;
}

interface Props {
  day: DayId;
  parties: Party[];
  myUid: string | null;
  /** 가게 id → 지금 가게. 게임판에 사진·카테고리를 붙이는 데만 쓴다. */
  places: Place[];
  /** 메뉴 하나로 거른 오늘 후보(도보·최근 1주는 지금 조건 그대로). */
  candidatesFor: (category: string) => Place[];
  /** 방장이 처음 볼 게임 — 지금 고른 게임이 팟에서 되면 그것, 아니면 첫 게임. */
  preferredMode: GameMode;
  actions: PartyActions;
}

/** 출발 시각이 지났는지 30초마다 다시 본다. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

const menuIcon = (category: string) => MENUS.find((m) => m.id === category)?.icon ?? '🍴';

export function Parties({ day, parties, myUid, places, candidatesFor, preferredMode, actions }: Props) {
  const now = useNow();
  const sorted = useMemo(() => sortParties(parties, now), [parties, now]);
  const hosting = myUid !== null && parties.some((p) => p.hostUid === myUid);
  const me = myUid ? avatarOf(myUid, day) : null;

  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [cancelAsk, setCancelAsk] = useState<string | null>(null);
  // 게임: 방장이 고르는 중(pick) 또는 저장된 판을 보는 중(watch).
  const [gameFor, setGameFor] = useState<{ partyId: string; view: 'pick' | 'watch' } | null>(null);

  const run = async (key: string, task: () => Promise<void>, fail = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.') => {
    setBusy(key);
    setProblem(null);
    try {
      await task();
      return true;
    } catch {
      setProblem(fail);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const gameParty = gameFor ? (parties.find((p) => p.id === gameFor.partyId) ?? null) : null;

  return (
    <section className="party" aria-labelledby="party-title">
      <div className="party__head">
        <h2 id="party-title" className="party__title">
          <span aria-hidden="true">🙋 </span>점심 팟
        </h2>
        <Button
          size="sm"
          variant={hosting ? 'secondary' : 'primary'}
          disabled={hosting}
          onClick={() => {
            setProblem(null);
            setFormOpen(true);
          }}
        >
          {hosting ? '오늘 팟을 열었어요' : '팟 모으기'}
        </Button>
      </div>
      {me && (
        <p className="party__me">
          나: <span aria-hidden="true">{me.emoji} </span>
          <strong>{me.label}</strong>
          <span className="party__meHint"> · 오늘 하루 이 이름으로 보여요</span>
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="party__empty">아직 열린 팟이 없어요. 같이 갈 사람을 모아 볼까요?</p>
      ) : (
        <ul className="party__list">
          {sorted.map((p) => {
            const phase = partyPhase(p, now);
            const mine = p.hostUid === myUid;
            const joined = isMember(p, myUid);
            const members = avatarsIn(
              p.members.map((m) => m.uid),
              day,
            );
            const winner = p.game ? p.game.names[p.game.winnerIndex] : null;
            return (
              <li
                key={p.id}
                className={`party__card party__card--${phase}`}
                aria-label={`${p.category} 팟, ${p.time} 출발, ${p.members.length}/${p.max}명, ${PHASE_LABEL[phase]}`}
              >
                <div className="party__cardHead">
                  <span
                    className="party__cat"
                    style={{ '--cat-hue': categoryHue(p.category) } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {menuIcon(p.category)}
                  </span>
                  <p className="party__name">
                    오늘 <strong>{p.category}</strong> 갈 사람?
                  </p>
                  <span className={`party__phase party__phase--${phase}`}>{PHASE_LABEL[phase]}</span>
                </div>
                <p className="party__meta">
                  <span>{p.time} 출발</span>
                  <span className="party__count">
                    {p.members.length}/{p.max}명
                  </span>
                  {mine && <span>내가 연 팟</span>}
                </p>
                {p.memo && <p className="party__memo">{p.memo}</p>}
                <ul className="party__members" aria-label="모인 사람">
                  {members.map((a) => (
                    <li key={a.uid} className={a.uid === myUid ? 'party__avatar party__avatar--me' : 'party__avatar'}>
                      <span aria-hidden="true">{a.emoji}</span>
                      {a.label}
                      {a.uid === myUid && <span className="party__you">나</span>}
                    </li>
                  ))}
                </ul>
                {p.game && winner && (
                  <div className="party__result">
                    <p>
                      <span aria-hidden="true">{MODE_ICON[p.game.mode as GameMode] ?? '🎲'} </span>
                      {modeLabel(p.game.mode)} 결과 <strong>{winner}</strong>
                    </p>
                    <Button size="sm" variant="secondary" onClick={() => setGameFor({ partyId: p.id, view: 'watch' })}>
                      결과 보기
                    </Button>
                  </div>
                )}
                <div className="party__actions">
                  {mine ? (
                    cancelAsk === p.id ? (
                      <>
                        <span className="party__ask">팟을 없앨까요?</span>
                        <Button
                          size="sm"
                          tone="danger"
                          loading={busy === `cancel-${p.id}`}
                          onClick={async () => {
                            if (await run(`cancel-${p.id}`, () => actions.cancel(p.id))) setCancelAsk(null);
                          }}
                        >
                          없앨게요
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setCancelAsk(null)}>
                          그대로 두기
                        </Button>
                      </>
                    ) : (
                      <>
                        {!p.game && (
                          <Button size="sm" onClick={() => setGameFor({ partyId: p.id, view: 'pick' })}>
                            게임으로 가게 정하기
                          </Button>
                        )}
                        {phase !== 'departed' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy === `status-${p.id}`}
                            onClick={() =>
                              run(`status-${p.id}`, () =>
                                actions.setStatus(p.id, p.status === 'open' ? 'closed' : 'open'),
                              )
                            }
                          >
                            {p.status === 'open' ? '마감하기' : '다시 모으기'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setCancelAsk(p.id)}>
                          취소
                        </Button>
                      </>
                    )
                  ) : joined ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === `leave-${p.id}`}
                      onClick={() => run(`leave-${p.id}`, () => actions.leave(p.id))}
                    >
                      나가기
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant={phase === 'open' ? 'primary' : 'secondary'}
                      disabled={phase !== 'open'}
                      loading={busy === `join-${p.id}`}
                      onClick={() =>
                        run(`join-${p.id}`, () => actions.join(p.id), '참여하지 못했어요. 자리가 찼을 수 있어요.')
                      }
                    >
                      {phase === 'open' ? '참여하기' : PHASE_LABEL[phase]}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {problem && !formOpen && !gameFor && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}

      <Sheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="점심 팟 모으기"
        description="같이 갈 사람을 모아요. 이름 대신 동물 아바타로 보여요."
        className="party-sheet"
      >
        {formOpen && (
          <PartyForm
            busy={busy === 'open'}
            problem={problem}
            onSubmit={async (input) => {
              const message = partyInputProblem(input);
              if (message) {
                setProblem(message);
                return;
              }
              if (await run('open', () => actions.open(input), '팟을 열지 못했어요. 잠시 뒤 다시 눌러 주세요.'))
                setFormOpen(false);
            }}
            onCancel={() => setFormOpen(false)}
          />
        )}
      </Sheet>

      <Modal
        open={gameFor !== null && gameParty !== null}
        onClose={() => setGameFor(null)}
        className="party-modal"
        aria-label="팟 게임"
      >
        {gameFor && gameParty?.game ? (
          <PartyGamePlayer
            game={gameParty.game}
            board={gameBoard(gameParty.game, places, gameParty.category)}
            onClose={() => setGameFor(null)}
          />
        ) : gameFor && gameParty && gameFor.view === 'pick' ? (
          <GamePick
            party={gameParty}
            candidates={candidatesFor(gameParty.category)}
            preferredMode={preferredMode}
            busy={busy === `game-${gameParty.id}`}
            problem={problem}
            onStart={async (mode, candidates) => {
              // App.spin 과 같은 길 — 균등 난수 한 번. 판 번호도 같은 식이다.
              const pool = partyCandidates(candidates, Math.random);
              const game: PartyGame = {
                mode,
                run: 1 + Math.floor(Math.random() * 1_000_000),
                ids: pool.map((c) => c.id),
                names: pool.map((c) => c.name),
                winnerIndex: pickWinner(pool.length, null, Math.random),
              };
              // 저장이 끝나면 팟 문서에 game 이 생기고, 이 모달은 다시 보기로 바뀐다.
              await run(
                `game-${gameParty.id}`,
                () => actions.saveGame(gameParty.id, game),
                '게임 결과를 남기지 못했어요. 다시 눌러 주세요.',
              );
            }}
            onCancel={() => setGameFor(null)}
          />
        ) : null}
      </Modal>
    </section>
  );
}

interface FormProps {
  busy: boolean;
  problem: string | null;
  onSubmit: (input: PartyInput) => void;
  onCancel: () => void;
}

function PartyForm({ busy, problem, onSubmit, onCancel }: FormProps) {
  const [category, setCategory] = useState<string | null>(null);
  const [time, setTime] = useState(() => defaultPartyTime());
  const [max, setMax] = useState(PARTY_DEFAULT_MAX);
  const [memo, setMemo] = useState('');
  return (
    <form
      className="party-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ category: category ?? '', time, max, memo: memo.trim() });
      }}
    >
      <fieldset className="party-form__field">
        <legend>메뉴</legend>
        <div className="party-form__menus">
          {MENUS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="party-form__menu"
              aria-pressed={category === m.id}
              onClick={() => setCategory(m.id)}
            >
              <span aria-hidden="true">{m.icon} </span>
              {m.id}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="party-form__pair">
        <Input
          label="출발 시각"
          type="time"
          step={300}
          required
          value={time}
          onChange={(e) => setTime(e.target.value)}
          fieldProps={{ className: 'party-form__time' }}
        />
        <fieldset className="party-form__field">
          <legend>최대 인원</legend>
          <div className="party-form__stepper">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="한 명 줄이기"
              disabled={max <= PARTY_MIN}
              onClick={() => setMax((n) => clampMax(n - 1))}
            >
              −
            </Button>
            <output className="party-form__max" aria-live="polite">
              {max}명
            </output>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label="한 명 늘리기"
              disabled={max >= PARTY_MAX}
              onClick={() => setMax((n) => clampMax(n + 1))}
            >
              +
            </Button>
          </div>
        </fieldset>
      </div>
      <Input
        label="한 줄 메모 (선택)"
        value={memo}
        maxLength={PARTY_MEMO_MAX}
        placeholder="예) 국물 땡기는 날"
        helper={`${memo.length}/${PARTY_MEMO_MAX}자`}
        onChange={(e) => setMemo(e.target.value)}
        fieldProps={{ className: 'party-form__memo' }}
      />
      {problem && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}
      <div className="party-form__actions">
        <Button type="submit" block loading={busy} disabled={category === null}>
          팟 열기
        </Button>
        <Button type="button" block variant="ghost" onClick={onCancel}>
          다음에 할게요
        </Button>
      </div>
    </form>
  );
}

interface PickProps {
  party: Party;
  candidates: Place[];
  preferredMode: GameMode;
  busy: boolean;
  problem: string | null;
  onStart: (mode: GameMode, candidates: Place[]) => void;
  onCancel: () => void;
}

function GamePick({ party, candidates, preferredMode, busy, problem, onStart, onCancel }: PickProps) {
  const [mode, setMode] = useState<GameMode>(PARTY_MODES.includes(preferredMode) ? preferredMode : PARTY_MODES[0]);
  const enough = candidates.length >= 2;
  return (
    <div className="party-pick">
      <h2 className="party-pick__title">
        <span aria-hidden="true">{menuIcon(party.category)} </span>
        {party.category} 팟 게임
      </h2>
      <p className="party-pick__lead">
        {enough
          ? `${party.category} 가게 ${candidates.length}곳 중에서 뽑아요. 결과는 팟 사람 모두 같이 봐요.`
          : `${party.category} 가게가 2곳은 있어야 게임을 할 수 있어요. 도보 조건을 넓혀 보세요.`}
      </p>
      {enough && (
        <div className="party-pick__modes" role="group" aria-label="게임">
          {PARTY_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className="party-form__menu"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
            >
              <span aria-hidden="true">{MODE_ICON[m]} </span>
              {modeLabel(m)}
            </button>
          ))}
        </div>
      )}
      <p className="party-pick__note">한 번 뽑으면 다시 못 뽑아요. 모두에게 같은 결과가 남아요.</p>
      {problem && (
        <p className="notice notice--empty" role="alert">
          {problem}
        </p>
      )}
      <div className="party-form__actions">
        <Button block loading={busy} disabled={!enough} onClick={() => onStart(mode, candidates)}>
          {withJosa(modeLabel(mode), '으로/로')} 뽑기
        </Button>
        <Button block variant="ghost" onClick={onCancel}>
          닫기
        </Button>
      </div>
    </div>
  );
}
