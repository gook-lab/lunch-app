/**
 * 낚시 — 연못 물고기들 사이로 낚싯줄을 드리워 몇 번 입질을 받다가 당첨 물고기를 낚는다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 물고기가 헤엄치는 자리·폭과
 * 입질 순서·시각만 정한다. 마지막에 걸리는 물고기는 항상 winnerIndex 이고,
 * 그 앞의 입질은 모두 당첨이 아닌 물고기다(당첨이 먼저 다가왔다 떠나면 헷갈린다).
 *
 * 좌표는 연못 상자의 % 다. 위쪽 SKY% 는 하늘(낚아 올린 물고기가 머무는 곳),
 * 그 아래가 물이다. 물고기는 격자 칸마다 하나씩, 칸 안에서 조금씩 어긋나게 둔다 —
 * 20마리가 휴대폰(390px)에서도 이름표가 겹치지 않아야 한다.
 */

/** 하늘(수면 위) 높이, 연못 높이의 %. 수면이 여기에 있다. */
export const SKY = 20;

export interface Fish {
  /** 연못 안 자리(%, 물고기 몸 가운데). */
  x: number;
  y: number;
  /** 좌우로 헤엄치는 폭(연못 폭의 %, 한쪽). */
  range: number;
  /** 한 번 오갔다 오는 시간(ms). 물고기마다 달라 떼가 같이 움직이지 않는다. */
  periodMs: number;
  /** 헤엄 박자를 어긋나게(ms, 0 이하). */
  delayMs: number;
}

export interface PondLayout {
  cols: number;
  rows: number;
  /** 연못 폭 ÷ 높이. 크게 보기는 이 비로 남는 높이에 맞춘다(desktop.css). */
  aspect: number;
  /** 칸 하나의 높이(연못 높이의 %). 입질 때 물고기가 떠오르는 양을 여기서 잰다. */
  cellH: number;
  fish: Fish[];
}

/** 칸 높이 ÷ 칸 폭. 물고기 몸·이름표·입질 때 떠오를 틈이 들어간다. */
const CELL_TALL = 0.62;

/** 열 수. 20마리면 4열 — 390px 에서 칸 폭이 90px 쯤이라 이름표 다섯 글자가 들어간다. */
export function pondColumns(count: number): number {
  if (count <= 3) return Math.max(1, count);
  if (count <= 6) return 3;
  return 4;
}

/** 물고기 자리와 헤엄 박자. 같은 rng 면 같은 연못이다. */
export function pondLayout(count: number, rng: () => number = Math.random): PondLayout {
  const cols = pondColumns(count);
  const rows = Math.max(1, Math.ceil(count / cols));
  // 연못 높이 = 하늘 + 물(칸 rows 줄 + 바닥 여유 0.3줄). 폭은 cols 칸.
  const waterRows = rows + 0.3;
  const heightUnits = waterRows * CELL_TALL / (1 - SKY / 100);
  const aspect = cols / heightUnits;
  const water = 100 - SKY;
  const cellH = (water / waterRows);
  const fish: Fish[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = Math.floor(i / cols);
    // 마지막 줄이 덜 차면 가운데로 모은다.
    const inRow = r === rows - 1 ? count - r * cols : cols;
    const c = i - r * cols;
    const cellW = 100 / cols;
    const x0 = (100 - inRow * cellW) / 2 + (c + 0.5) * cellW;
    // 칸 안에서 조금 어긋나게. 이름표(칸 폭의 72%)가 헤엄쳐도 옆 칸과 겹치지 않을 만큼만 — 1 − 0.08 − 2×0.07 > 0.72.
    const x = x0 + (rng() - 0.5) * cellW * 0.08;
    const y = SKY + (r + 0.62) * cellH + (rng() - 0.5) * cellH * 0.12;
    fish.push({
      x,
      y,
      range: cellW * (0.04 + rng() * 0.03),
      periodMs: Math.round(2600 + rng() * 1800),
      delayMs: -Math.round(rng() * 3000),
    });
  }
  return { cols, rows, aspect, cellH, fish };
}

export interface Bite {
  /** 다가오는 물고기(후보 인덱스). */
  fish: number;
  /** 낚싯줄이 이 물고기 위로 옮겨 가기 시작하는 시각(ms). */
  moveMs: number;
  /** 물고기가 다가와 찌가 흔들리기 시작하는 시각. */
  biteMs: number;
  /** 입질: 물고기가 떠나는 시각. 마지막(당첨): 챔질 — 찌가 쑥 들어가는 시각. */
  leaveMs: number;
}

export interface FishingPlan {
  /** 줄이 처음 물에 들어가는 데 걸리는 시간. 첫 입질 moveMs 가 이것이다. */
  castMs: number;
  /** 입질들. 마지막 하나가 당첨 물고기다. */
  bites: Bite[];
  /** 당첨 물고기가 물 위로 올라온 시각. */
  landMs: number;
  /** 반짝임까지 끝난 시각 — 여기서 onSpinEnd 를 부른다. 4~6초 안이다. */
  endMs: number;
}

const CAST_MS = 500;
/** 줄이 다음 물고기 위로 옮겨 가는 시간(CSS transition 과 같다). */
export const MOVE_MS = 350;
/** 입질 하나가 머무는 시간(450~650) · 떠난 뒤 다음으로 옮기기까지. */
const NIBBLE_MIN = 450;
const NIBBLE_SPAN = 200;
const AFTER_LEAVE = 80;
/** 당첨 물고기 입질(600~800) · 챔질에서 물 위까지 · 반짝임. */
const CATCH_MIN = 600;
const CATCH_SPAN = 200;
export const REEL_MS = 600;
const SHINE_MS = 450;

/**
 * 입질 순서와 시각.
 *
 * 1) 헛입질 2~3번. 당첨이 아닌 물고기에서 고르고, 같은 물고기가 연달아 오지 않게 한다
 *    (두 곳이면 남은 한 마리가 두 번 온다 — 그래도 사이에 줄이 한 번 옮겨 간다).
 * 2) 마지막에 당첨 물고기가 다가와 물고, 챔질 뒤 REEL_MS 만에 물 위로 올라온다.
 * 3) 길이는 계산으로 4.26~5.94초 안에 든다 — 최소(헛입질 2번·짧은 입질)와 최대(3번·긴 입질)를 더해 보면 된다.
 */
export function fishingPlan(count: number, winnerIndex: number, rng: () => number = Math.random): FishingPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const others: number[] = [];
  for (let i = 0; i < count; i += 1) if (i !== winnerIndex) others.push(i);

  const misses = rng() < 0.5 ? 2 : 3;
  const bites: Bite[] = [];
  let t = 0;
  let prev = -1;
  for (let k = 0; k < misses; k += 1) {
    const pool = others.length > 1 ? others.filter((i) => i !== prev) : others;
    const fish = pool[Math.floor(rng() * pool.length)];
    const moveMs = k === 0 ? CAST_MS : t;
    const biteMs = moveMs + MOVE_MS;
    const leaveMs = biteMs + NIBBLE_MIN + Math.round(rng() * NIBBLE_SPAN);
    bites.push({ fish, moveMs, biteMs, leaveMs });
    t = leaveMs + AFTER_LEAVE;
    prev = fish;
  }
  const biteMs = t + MOVE_MS;
  const strikeMs = biteMs + CATCH_MIN + Math.round(rng() * CATCH_SPAN);
  bites.push({ fish: winnerIndex, moveMs: t, biteMs, leaveMs: strikeMs });
  const landMs = strikeMs + REEL_MS;
  return { castMs: CAST_MS, bites, landMs, endMs: landMs + SHINE_MS };
}
