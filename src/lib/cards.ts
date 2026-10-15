/**
 * 카드 각본 — 딜러가 카드를 모아 리플 셔플(촤르륵)·브리지(착!) → 카드가 제자리로 날아감 → 나머지 카드가
 * 꽝으로 뒤집힘 → (아깝다) 반짝이며 들썩이던 카드가 꽝 · (가끔) 조커! 하고 놀래켰다가 꽝 →
 * 마지막에 고른 카드가 천천히 뒤집혀 당첨.
 *
 * 당첨은 App 이 정했다(winnerIndex). 고른 카드(pick)에 당첨을 놓고 나머지는 섞어 놓는다
 * (lib/ladder.ts revealSlots — 사다리와 같은 논리). 카드는 열릴 때까지 전부 가려져 있으므로 미리 섞어
 * 엎어 둔 것과 확률이 같다. 사건(아깝다·조커)은 당첨이 아닌 카드에만 일어나고 당첨을 바꾸지 않는다
 * (cards.test.ts 가 잰다).
 */
import { revealSlots } from './ladder';

export type CardsSay = 'gather' | 'riffle' | 'bridge' | 'deal' | 'wave' | 'tease' | 'miss' | 'joker' | 'joker-out' | 'final' | 'won';

export interface CardsStep {
  /** 판 시작부터(ms). */
  at: number;
  say: CardsSay;
  /** 이 단계의 주인공 카드(자리 번호). */
  card: number | null;
}

export interface CardsPlan {
  /** 고른 자리. 마지막에 뒤집히고 당첨이 적혀 있다. */
  pick: number;
  /** 자리 → 가게 번호. slots[pick] === winner. */
  slots: number[];
  /** 리플 셔플 횟수(1·2). */
  riffles: number;
  /** 한꺼번에 차례로 꽝이 되는 카드들(뒤집히는 차례). */
  wave: number[];
  /** 반짝이며 들썩이다 꽝이 되는 카드들(차례대로). */
  teases: number[];
  /** 조커로 놀래켰다가 꽝이 되는 카드. 없으면 null. */
  joker: number | null;
  steps: CardsStep[];
  endMs: number;
}

/** 사건 확률. */
export const CARDS_RATES = { joker: 0.35, twoTeases: 0.45, twoRiffles: 0.5 } as const;

/** 단계 길이(ms). */
export const CARDS_MS = {
  gather: 300,
  riffle: 650,
  bridge: 550,
  deal: 650,
  wave: 600,
  tease: 600,
  miss: 350,
  joker: 700,
  jokerOut: 450,
  final: 1050,
  hold: 650,
} as const;

/** 가장 길게 걸리는 판. 이보다 늦게 끝나는 판은 없다(cards.test.ts). */
export const CARDS_MAX_MS = 7200;

/** 한꺼번에 뒤집히는 카드 사이 간격(ms). 카드가 많아도 wave 안에 끝난다. */
export function waveGap(n: number): number {
  return n <= 1 ? 0 : Math.min(70, Math.floor((CARDS_MS.wave - 300) / (n - 1)));
}

/** 한 판 각본. 한 장뿐이면 null. */
export function cardsPlan(count: number, pick: number, winner: number, rng: () => number): CardsPlan | null {
  if (count <= 1) return null;
  const slots = revealSlots(count, pick, winner, rng);
  const riffles = rng() < CARDS_RATES.twoRiffles ? 2 : 1;
  const others = Array.from({ length: count }, (_, i) => i).filter((i) => i !== pick);
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const jokerRoll = rng() < CARDS_RATES.joker;
  const twoRoll = rng() < CARDS_RATES.twoTeases;
  const jokerFirst = rng() < 0.5;
  // 한 장만 남으면 조커든 아깝다든 하나만. 조커가 나오면 아깝다는 한 장 — 7.2초 안에 끝나게.
  let joker: number | null = null;
  let teaseN: number;
  if (others.length === 1) {
    if (jokerRoll) joker = others[0];
    teaseN = jokerRoll ? 0 : 1;
  } else {
    if (jokerRoll) joker = others[0];
    teaseN = jokerRoll ? 1 : twoRoll && others.length >= 3 ? 2 : 1;
  }
  const rest = joker === null ? others : others.slice(1);
  const teases = rest.slice(0, teaseN);
  const wave = rest.slice(teaseN).sort((a, b) => a - b);

  const steps: CardsStep[] = [];
  let t = 0;
  const push = (say: CardsSay, ms: number, card: number | null = null) => {
    steps.push({ at: t, say, card });
    t += ms;
  };
  push('gather', CARDS_MS.gather);
  for (let k = 0; k < riffles; k += 1) push('riffle', CARDS_MS.riffle);
  push('bridge', CARDS_MS.bridge);
  push('deal', CARDS_MS.deal);
  if (wave.length > 0) push('wave', CARDS_MS.wave);
  const doJoker = () => {
    if (joker === null) return;
    push('joker', CARDS_MS.joker, joker);
    push('joker-out', CARDS_MS.jokerOut, joker);
  };
  if (jokerFirst) doJoker();
  for (const c of teases) {
    push('tease', CARDS_MS.tease, c);
    push('miss', CARDS_MS.miss, c);
  }
  if (!jokerFirst) doJoker();
  push('final', CARDS_MS.final, pick);
  push('won', CARDS_MS.hold, pick);
  return { pick, slots, riffles, wave, teases, joker, steps, endMs: t };
}

/** 카드 한 장의 모습. back 엎음 · tease 들썩임 · lose 꽝 · joker 조커 · final 천천히 뒤집는 중 · win 당첨. */
export type CardLook = 'back' | 'tease' | 'lose' | 'joker' | 'final' | 'win';

/** 단계 k 까지 왔을 때 카드마다의 모습. 마지막 단계에선 고른 카드만 win, 나머지는 전부 lose. */
export function cardLooks(plan: CardsPlan, k: number): CardLook[] {
  const looks: CardLook[] = plan.slots.map(() => 'back');
  for (let s = 0; s <= k && s < plan.steps.length; s += 1) {
    const st = plan.steps[s];
    if (st.say === 'wave') for (const c of plan.wave) looks[c] = 'lose';
    else if (st.card !== null) {
      looks[st.card] =
        st.say === 'tease' ? 'tease' : st.say === 'joker' ? 'joker' : st.say === 'final' ? 'final' : st.say === 'won' ? 'win' : 'lose';
    }
  }
  return looks;
}
