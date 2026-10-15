/**
 * 뽑기 기계 각본 — 손잡이 컷신(드르륵) → 돔 안 캡슐이 뒤섞임 → (가끔) 다른 캡슐이 출구까지 왔다 되돌아감
 * → 캡슐이 떨어짐 → (가끔) 출구에 걸렸다 탁 쳐서 빠짐 → 캡슐을 크게 열면 뽁! 쪽지에 당첨 가게.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 사건과 시각만 판 번호 시드로 정한다.
 * 사건은 연출일 뿐 당첨을 바꾸지 않는다 — 쪽지에 적히는 건 늘 당첨 가게고, 출구까지 왔다 돌아가는
 * 캡슐(peek)은 늘 당첨이 아닌 가게다(gacha.test.ts 가 잰다). 골드 캡슐은 색만 바뀐다.
 */

export type GachaSay = 'crank' | 'tumble' | 'peek' | 'peek-back' | 'drop' | 'jam' | 'knock' | 'open' | 'pop' | 'won';

export interface GachaStep {
  /** 판 시작부터(ms). */
  at: number;
  say: GachaSay;
}

export interface GachaPlan {
  steps: GachaStep[];
  /** 손잡이를 몇 바퀴 돌리나(2·3). */
  cranks: number;
  /** 출구까지 왔다가 돌아가는 캡슐의 가게(당첨 아님). 없으면 null. */
  peek: number | null;
  /** 나온 캡슐이 출구에 걸리나. */
  jam: boolean;
  /** 골드 캡슐인가(색·반짝임만). */
  gold: boolean;
  /** 이때 onSpinEnd. */
  endMs: number;
}

/** 사건이 나올 확률. 판마다 달라야 "이번엔 뭐가 나오나" 를 본다. */
export const GACHA_RATES = { peek: 0.55, jam: 0.45, gold: 0.12, threeCranks: 0.5 } as const;

/** 단계 길이(ms). 손잡이는 한 바퀴마다 crankTurn. */
export const GACHA_MS = {
  crankTurn: 450,
  tumble: 1150,
  peek: 700,
  peekBack: 400,
  drop: 500,
  jam: 750,
  knock: 400,
  open: 900,
  pop: 350,
  hold: 700,
} as const;

/** 가장 길게 걸리는 판(손잡이 세 바퀴 + 모든 사건). */
export const GACHA_MAX_MS =
  GACHA_MS.crankTurn * 3 +
  GACHA_MS.tumble +
  GACHA_MS.peek +
  GACHA_MS.peekBack +
  GACHA_MS.drop +
  GACHA_MS.jam +
  GACHA_MS.knock +
  GACHA_MS.open +
  GACHA_MS.pop +
  GACHA_MS.hold;

/** 한 판 각본. 한 곳뿐이면 null — 뽑을 것도 없다. */
export function gachaPlan(count: number, winner: number, rng: () => number): GachaPlan | null {
  if (count <= 1) return null;
  const cranks = rng() < GACHA_RATES.threeCranks ? 3 : 2;
  const wantPeek = rng() < GACHA_RATES.peek;
  const jam = rng() < GACHA_RATES.jam;
  const gold = rng() < GACHA_RATES.gold;
  // 출구까지 왔다 가는 캡슐은 당첨이 아닌 가게 하나.
  let peek: number | null = null;
  if (wantPeek) {
    const k = Math.floor(rng() * (count - 1));
    peek = k >= winner ? k + 1 : k;
  }

  const steps: GachaStep[] = [];
  let t = 0;
  const push = (say: GachaSay, ms: number) => {
    steps.push({ at: t, say });
    t += ms;
  };
  push('crank', GACHA_MS.crankTurn * cranks);
  push('tumble', GACHA_MS.tumble);
  if (peek !== null) {
    push('peek', GACHA_MS.peek);
    push('peek-back', GACHA_MS.peekBack);
  }
  push('drop', GACHA_MS.drop);
  if (jam) {
    push('jam', GACHA_MS.jam);
    push('knock', GACHA_MS.knock);
  }
  push('open', GACHA_MS.open);
  push('pop', GACHA_MS.pop);
  push('won', GACHA_MS.hold);
  return { steps, cranks, peek, jam, gold, endMs: t };
}
