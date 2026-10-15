/**
 * 풍선 터뜨리기 — 다트가 풍선을 하나씩 노려 터뜨리고, 마지막 두 풍선이 펌프 대결을 해 하나가 남는다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 연출 일정만 정한다(판 번호 run 시드).
 * 당첨 풍선은 절대 터지지 않고, 나머지는 모두 정확히 한 번씩 터진다. 사건은 당첨을 바꾸지 않는다.
 *
 * 일정:
 * 1) 다트 등장(intro).
 * 2) 걸러내기 — 다트가 날아가(aim) 풍선이 부들부들 떨다(wobble) 펑(pop). 가끔 옆 풍선까지 연쇄로 펑펑(chain).
 *    한 번은 다트가 노렸는데 튕기거나(bounce) 바람에 비켜 가서(wind) "휴, 살았다"(save) — 그 풍선이 당첨이
 *    아니면 나중에 결국 터진다. 다트는 갈수록 빨라진다.
 * 3) 마지막 대결(duel) — 당첨과 마지막 상대가 번갈아 부풀고(pump), 가끔 당첨 쪽이 먼저 터질 듯 버티다(strain),
 *    상대가 펑(burst).
 * 4) 남은 풍선이 리본을 달고 둥실 떠오른다(float). 꽃가루.
 *
 * 길이: 4.5~7.2초(2곳 약 4.6초 · 20곳 약 7초).
 */

/** 판의 열 수. 휴대폰(390px)에서 20개도 겹치지 않게 가로를 조금 더 넓게 잡는다. */
export function balloonColumns(count: number): number {
  return Math.max(1, Math.ceil(Math.sqrt(count * 1.6)));
}

export type BeatKind = 'intro' | 'aim' | 'wobble' | 'pop' | 'chain' | 'save' | 'duel' | 'pump' | 'strain' | 'burst' | 'float';
export type SaveCause = 'bounce' | 'wind';

export interface Beat {
  atMs: number;
  kind: BeatKind;
  /** 대상 풍선(후보 인덱스). intro·duel·float 는 없다. */
  index?: number;
  /** 다트가 날아가는 시간(aim). */
  flyMs?: number;
  /** save 의 까닭. 노린 순간(aim·wobble)부터 알 수 있게 그 비트에도 같이 적는다. */
  cause?: SaveCause;
  /** pump 뒤 풍선 크기(배율). */
  size?: number;
}

export interface BalloonPlan {
  beats: Beat[];
  /** 마지막 대결 [당첨, 상대]. 후보가 한 곳이면 null. */
  duel: [number, number] | null;
  /** 노렸다 살아난 풍선. 없으면 null. */
  save: { index: number; cause: SaveCause } | null;
  /** 연쇄로 터진 풍선 수. */
  chains: number;
  /** 대결에서 당첨 쪽이 먼저 터질 듯 버티는가(가짜 위기). */
  nearBurst: boolean;
  floatMs: number;
  endMs: number;
}

/** 사건 비율. */
export const SAVE_RATE = 0.8;
export const WIND_SHARE = 0.4;
export const NEAR_BURST_RATE = 0.6;
/** 연쇄 확률 — 풍선이 많을수록 잘 일어난다(20곳 0.6). */
export const chainRate = (count: number) => Math.min(0.6, 0.1 + 0.025 * count);

const INTRO_MS = 380;
const FLOAT_MS = 900;
const MIN_TOTAL = 4600;
const MAX_TOTAL = 7000;
const CHAIN_GAP = 110;
/** 살아남기 한 번: 날아가기 320 · 떨기 520 · "휴, 살았다" 500. */
const SAVE_SPAN = 1340;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 격자 거리(칸). 연쇄는 가까운 풍선끼리 일어난다. */
function cellDist(a: number, b: number, cols: number): number {
  const dx = (a % cols) - (b % cols);
  const dy = Math.floor(a / cols) - Math.floor(b / cols);
  return Math.hypot(dx, dy);
}

export function balloonPlan(count: number, winnerIndex: number, rng: () => number = Math.random): BalloonPlan {
  const empty: BalloonPlan = { beats: [], duel: null, save: null, chains: 0, nearBurst: false, floatMs: 0, endMs: 0 };
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return empty;
  const cols = balloonColumns(count);

  const losers: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) losers.push(i);
  for (let i = losers.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [losers[i], losers[j]] = [losers[j], losers[i]];
  }
  const opponent = losers.pop()!;
  const queue = losers; // 걸러낼 풍선(대결 상대 빼고).
  const elimCount = queue.length;

  // 노렸다 살아날 풍선 — 누구든 같은 확률(당첨만 고르면 결과가 미리 보인다).
  const save =
    rng() < SAVE_RATE ? { index: Math.floor(rng() * count), cause: (rng() < WIND_SHARE ? 'wind' : 'bounce') as SaveCause } : null;
  // 살아난 풍선이 걸러낼 풍선이면, 살아나기 전에는 터지지 않게 줄에서 빼 둔다.
  const held = save && queue.includes(save.index) ? save.index : null;
  if (held !== null) queue.splice(queue.indexOf(held), 1);
  const saveAfter = save ? Math.floor(rng() * Math.max(1, Math.ceil(elimCount * 0.6))) : -1;

  // ── 걸러내기(상대 시각, 0 = 걸러내기 시작) ──
  const elim: Beat[] = [];
  const alive = new Set(queue);
  let t = 0;
  let popped = 0;
  let saved = !save;
  let chains = 0;
  const expectShots = Math.max(1, Math.round(elimCount / (1 + chainRate(count) * (count >= 12 ? 2.2 : 1.6))));
  let shot = 0;
  /** 살아남기 구간(자연 시각). 길이를 줄일 때 이 구간은 그대로 둔다 — "휴, 살았다" 를 읽을 틈. */
  let saveSpan: [number, number] | null = null;
  const doSave = () => {
    const s = save!;
    elim.push({ atMs: t, kind: 'aim', index: s.index, flyMs: 320, cause: s.cause });
    elim.push({ atMs: t + 320, kind: 'wobble', index: s.index, cause: s.cause });
    elim.push({ atMs: t + 320 + 520, kind: 'save', index: s.index, cause: s.cause });
    saveSpan = [t, t + SAVE_SPAN];
    t += SAVE_SPAN;
    saved = true;
    if (held !== null) {
      // 살아난 풍선은 남은 줄 어딘가에 다시 들어간다 — 결국 터진다.
      const rest = [...alive];
      const at = Math.floor(rng() * (rest.length + 1));
      rest.splice(at, 0, held);
      queue.length = 0;
      queue.push(...rest);
      alive.add(held);
    }
  };
  while (alive.size > 0 || !saved) {
    if (!saved && popped >= saveAfter) {
      doSave();
      continue;
    }
    if (alive.size === 0) {
      doSave();
      continue;
    }
    const target = queue.find((i) => alive.has(i))!;
    const k = Math.min(1, shot / Math.max(1, expectShots - 1));
    const fly = Math.round(lerp(260, 130, k));
    const wob = Math.round(lerp(200, 90, k));
    elim.push({ atMs: t, kind: 'aim', index: target, flyMs: fly });
    elim.push({ atMs: t + fly, kind: 'wobble', index: target });
    t += fly + wob;
    elim.push({ atMs: t, kind: 'pop', index: target });
    alive.delete(target);
    popped += 1;
    shot += 1;
    // 연쇄 — 가까운 풍선 1~3개(12곳 이상이면 1~4개)가 따라 터진다. 아직 살아나지 않은 풍선(held)은 대상이 아니다(줄에 없다).
    if (alive.size >= 1 && rng() < chainRate(count)) {
      const near = [...alive]
        .map((i) => ({ i, d: cellDist(i, target, cols) + rng() * 0.3 }))
        .filter((x) => x.d <= (count >= 12 ? 2.3 : 1.8))
        .sort((a, b) => a.d - b.d)
        .slice(0, 1 + Math.floor(rng() * (count >= 12 ? 4 : 3)));
      near.forEach(({ i }) => {
        t += CHAIN_GAP;
        elim.push({ atMs: t, kind: 'chain', index: i });
        alive.delete(i);
        popped += 1;
        chains += 1;
      });
    }
    t += Math.round(lerp(100, 30, k));
  }
  const elimNatural = t;

  // ── 대결 ──
  const nearBurst = rng() < NEAR_BURST_RATE;
  const pumps = 3 + Math.floor(rng() * 3); // 3~5 번, 마지막은 상대.
  const duelFixed = 380 /* 대결 소개 */ + (nearBurst ? 460 : 0) + 260 /* 끼익 */ + 400 /* 펑 뒤 */;
  let pumpGap = 340;
  // 너무 길면 걸러내기를 같은 비율로 줄이고(최소 0.3배), 너무 짧으면 펌프 간격을 늘린다.
  //   살아남기 구간은 줄이지 않는다.
  const span = saveSpan as [number, number] | null;
  const fixedE = span ? SAVE_SPAN : 0;
  const budget = MAX_TOTAL - INTRO_MS - duelFixed - (pumps - 1) * pumpGap - FLOAT_MS;
  const scaleE = Math.max(0.3, Math.min(1, (budget - fixedE) / Math.max(1, elimNatural - fixedE)));
  /** 자연 시각 → 줄인 시각. 살아남기 구간 안은 1배. */
  const squeeze = (x: number) => {
    if (!span) return x * scaleE;
    if (x <= span[0]) return x * scaleE;
    if (x <= span[1]) return span[0] * scaleE + (x - span[0]);
    return span[0] * scaleE + SAVE_SPAN + (x - span[1]) * scaleE;
  };
  const elimMs = Math.round(squeeze(elimNatural));
  const short = MIN_TOTAL - (INTRO_MS + elimMs + duelFixed + (pumps - 1) * pumpGap + FLOAT_MS);
  let duelIntro = 380;
  if (short > 0) {
    pumpGap = Math.min(720, pumpGap + short / (pumps - 1));
    // 펌프 간격만으로 모자라면(2곳) 대결 소개(서로 노려보기)를 늘린다.
    duelIntro += Math.max(0, short - (pumps - 1) * (720 - 340));
  }

  const beats: Beat[] = [{ atMs: 0, kind: 'intro' }];
  for (const b of elim) {
    const fly = b.flyMs && !b.cause ? { flyMs: Math.round(b.flyMs * scaleE) } : {};
    beats.push({ ...b, atMs: Math.round(INTRO_MS + squeeze(b.atMs)), ...fly });
  }
  let d = INTRO_MS + elimMs;
  beats.push({ atMs: d, kind: 'duel' });
  d += duelIntro;
  const size: Record<number, number> = { [winnerIndex]: 1, [opponent]: 1 };
  for (let p = 0; p < pumps; p += 1) {
    // 뒤에서부터 상대·당첨을 번갈아 — 마지막 펌프는 늘 상대.
    const who = (pumps - 1 - p) % 2 === 0 ? opponent : winnerIndex;
    if (nearBurst && p === pumps - 1) {
      // 상대 마지막 펌프 직전, 당첨 쪽이 한 번 더 부풀어 터질 듯 버틴다.
      size[winnerIndex] += 0.16;
      beats.push({ atMs: Math.round(d), kind: 'strain', index: winnerIndex, size: Math.round(size[winnerIndex] * 100) / 100 });
      d += 460;
    }
    size[who] += 0.13;
    beats.push({ atMs: Math.round(d), kind: 'pump', index: who, size: Math.round(size[who] * 100) / 100 });
    d += pumpGap;
  }
  // 마지막 펌프 뒤 끼익 하고 상대가 터진다.
  d += 260 - pumpGap;
  beats.push({ atMs: Math.round(d), kind: 'burst', index: opponent });
  d += 400;
  const floatMs = Math.round(d);
  beats.push({ atMs: floatMs, kind: 'float', index: winnerIndex });

  return { beats, duel: [winnerIndex, opponent], save, chains, nearBurst, floatMs, endMs: floatMs + FLOAT_MS };
}

/** k 번째 비트까지 진행한 장면. 화면은 이것만 보고 그린다. */
export interface BalloonFrame {
  beat: Beat | null;
  popped: Set<number>;
  /** 다트가 있는 풍선과 모습. null 이면 다트가 대기 자리(위)에 있거나 사라졌다. */
  dart: { index: number; mode: 'fly' | 'aim' | 'bounce' | 'miss' | 'stuck' } | null;
  /** 지금 떨고 있는 풍선. */
  wobble: number | null;
  /** 대결 중인 둘과 크기. */
  duel: [number, number] | null;
  sizes: Map<number, number>;
  /** 터질 듯 버티는 풍선. */
  strain: number | null;
  /** 바람이 부는 중인가. */
  wind: boolean;
  /** 마지막 터짐이 연쇄였나(외침용). */
  chain: boolean;
  float: boolean;
}

export function balloonFrame(plan: BalloonPlan, k: number): BalloonFrame {
  const f: BalloonFrame = {
    beat: null,
    popped: new Set(),
    dart: null,
    wobble: null,
    duel: null,
    sizes: new Map(),
    strain: null,
    wind: false,
    chain: false,
    float: false,
  };
  const end = Math.min(k, plan.beats.length - 1);
  for (let j = 0; j <= end; j += 1) {
    const b = plan.beats[j];
    f.beat = b;
    f.wobble = null;
    f.wind = false;
    f.chain = false;
    f.strain = null;
    switch (b.kind) {
      case 'aim':
        f.dart = { index: b.index!, mode: 'fly' };
        f.wind = b.cause === 'wind';
        break;
      case 'wobble':
        f.dart = { index: b.index!, mode: 'aim' };
        f.wobble = b.index!;
        f.wind = b.cause === 'wind';
        break;
      case 'save':
        f.dart = { index: b.index!, mode: b.cause === 'wind' ? 'miss' : 'bounce' };
        f.wind = b.cause === 'wind';
        break;
      case 'pop':
        f.popped.add(b.index!);
        f.dart = { index: b.index!, mode: 'stuck' };
        break;
      case 'chain':
        f.popped.add(b.index!);
        f.chain = true;
        break;
      case 'duel':
        f.dart = null;
        f.duel = plan.duel;
        if (plan.duel) plan.duel.forEach((i) => f.sizes.set(i, 1));
        break;
      case 'pump':
        f.sizes.set(b.index!, b.size!);
        break;
      case 'strain':
        f.sizes.set(b.index!, b.size!);
        f.strain = b.index!;
        break;
      case 'burst':
        f.popped.add(b.index!);
        break;
      case 'float':
        f.float = true;
        break;
      default:
        break;
    }
  }
  return f;
}

/** 다 끝난 장면(움직임 줄이기·끝난 판 다시 그리기): 당첨만 남는다. */
export function finalFrame(count: number, winnerIndex: number): BalloonFrame {
  const popped = new Set<number>();
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) popped.add(i);
  return {
    beat: { atMs: 0, kind: 'float', index: winnerIndex },
    popped,
    dart: null,
    wobble: null,
    duel: null,
    sizes: new Map(),
    strain: null,
    wind: false,
    chain: false,
    float: true,
  };
}
