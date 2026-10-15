/**
 * 게임 효과음 — 파일 없이 WebAudio 로 합성한다.
 *
 * 소리는 기본으로 끈다(celebrate.ts 의 soundOn, localStorage 'lunch-app:sound').
 * 사무실에서 쓰는 앱이라 볼륨은 작게, 같은 소리는 최소 간격을 둬서 쏟아지지 않게 한다.
 * 소리는 연출일 뿐이라 당첨과 무관하다. 오디오를 못 쓰는 환경(jsdom 등)에선 조용히 넘어간다.
 */

const SOUND_KEY = 'lunch-app:sound';

function enabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

let ctx: AudioContext | null = null;

/** 공유 AudioContext. 못 만들면 null. */
export function audio(): AudioContext | null {
  try {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AC =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  hz: number;
  /** 끝 주파수. 주면 그 사이를 미끄러진다. */
  to?: number;
  dur: number;
  type?: OscillatorType;
  vol?: number;
  at?: number;
}

function tone(ac: AudioContext, { hz, to, dur, type = 'triangle', vol = 0.06, at = 0 }: ToneOpts) {
  const t0 = ac.currentTime + 0.005 + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.01, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuf: AudioBuffer | null = null;

interface NoiseOpts {
  dur: number;
  /** 대역 통과 중심 주파수. to 를 주면 그쪽으로 쓸어 간다. */
  hz: number;
  to?: number;
  q?: number;
  vol?: number;
  at?: number;
  filter?: BiquadFilterType;
}

function noise(ac: AudioContext, { dur, hz, to, q = 1, vol = 0.08, at = 0, filter = 'bandpass' }: NoiseOpts) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i += 1) d[i] = Math.random() * 2 - 1;
  }
  const t0 = ac.currentTime + 0.005 + at;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = filter;
  f.Q.value = q;
  f.frequency.setValueAtTime(hz, t0);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.008, dur / 4));
  gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(f).connect(gain).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

const SOUNDS = {
  /** 돌림판·슬롯이 칸을 지날 때 — 짧은 딸깍. */
  tick: (ac: AudioContext) => tone(ac, { hz: 1500, dur: 0.025, type: 'square', vol: 0.025 }),
  /** 사다리·주사위가 한 칸 갈 때. */
  step: (ac: AudioContext) => tone(ac, { hz: 660, dur: 0.06, vol: 0.05 }),
  /** 고르기·누르기. */
  tap: (ac: AudioContext) => noise(ac, { dur: 0.03, hz: 2500, q: 2, vol: 0.1 }),
  /** 카드 뒤집기. */
  flip: (ac: AudioContext) => {
    noise(ac, { dur: 0.07, hz: 1200, to: 3200, q: 1.5, vol: 0.09 });
    tone(ac, { hz: 900, to: 1300, dur: 0.05, vol: 0.025, at: 0.02 });
  },
  /** 카드 섞기 — 잔 소리 여럿. */
  shuffle: (ac: AudioContext) => {
    for (let i = 0; i < 7; i += 1) noise(ac, { dur: 0.03, hz: rand(1800, 3200), q: 2, vol: 0.07, at: i * 0.05 });
  },
  /** 흔들기·굴리기 — 달그락. */
  rattle: (ac: AudioContext) => {
    for (let i = 0; i < 5; i += 1)
      noise(ac, { dur: 0.025, hz: rand(900, 2000), q: 4, vol: 0.09, at: i * 0.045 + rand(0, 0.015) });
  },
  /** 캡슐이 떨어져 닿을 때. */
  thunk: (ac: AudioContext) => {
    tone(ac, { hz: 170, to: 70, dur: 0.14, type: 'sine', vol: 0.16 });
    noise(ac, { dur: 0.05, hz: 400, q: 1, vol: 0.06 });
  },
  /** 캡슐이 열릴 때 — 뽁. */
  pop: (ac: AudioContext) => {
    tone(ac, { hz: 320, to: 980, dur: 0.08, type: 'sine', vol: 0.1 });
    noise(ac, { dur: 0.04, hz: 3000, q: 1, vol: 0.05 });
  },
  /** 풍선이 터질 때 — 짧고 마른 펑. 터질 때마다 높이가 조금 다르다. */
  burst: (ac: AudioContext) => {
    noise(ac, { dur: 0.06, hz: rand(1800, 2600), q: 0.6, vol: 0.12, filter: 'highpass' });
    tone(ac, { hz: rand(180, 240), to: 70, dur: 0.07, type: 'sine', vol: 0.07 });
  },
  /** 낚시 찌가 톡 — 줄이 물에 들어갈 때·입질할 때. */
  plop: (ac: AudioContext) => tone(ac, { hz: rand(520, 640), to: rand(900, 1100), dur: 0.07, type: 'sine', vol: 0.07 }),
  /** 낚시 챔질 — 물을 가르며 끌어올리는 촤악. */
  splash: (ac: AudioContext) => {
    noise(ac, { dur: 0.35, hz: 900, to: 3200, q: 0.8, vol: 0.1 });
    tone(ac, { hz: 300, to: 120, dur: 0.12, type: 'sine', vol: 0.05 });
  },
  /** 핀볼 범퍼 — 칠 때마다 높이가 조금 다르다. */
  bump: (ac: AudioContext) => tone(ac, { hz: rand(420, 720), to: rand(200, 300), dur: 0.09, type: 'sine', vol: 0.08 }),
  /** 플링코 핀. pitch 0~1 로 높이를 정한다(아래로 갈수록 낮게). */
  peg: (ac: AudioContext, pitch = 0.5) => tone(ac, { hz: 1500 - pitch * 800 + rand(-40, 40), dur: 0.05, vol: 0.045 }),
  /** 출발 신호 — 삐. */
  beep: (ac: AudioContext) => tone(ac, { hz: 880, dur: 0.14, type: 'square', vol: 0.03 }),
  /** 출발 — 높은 삐. */
  go: (ac: AudioContext) => tone(ac, { hz: 1320, dur: 0.35, type: 'square', vol: 0.035 }),
  /** 부스터 — 올라가는 소리. */
  boost: (ac: AudioContext) => tone(ac, { hz: 220, to: 880, dur: 0.3, type: 'sawtooth', vol: 0.025 }),
  /** 전복·펑크 — 쿵. */
  crash: (ac: AudioContext) => {
    noise(ac, { dur: 0.3, hz: 700, to: 150, q: 0.7, vol: 0.18, filter: 'lowpass' });
    tone(ac, { hz: 110, to: 50, dur: 0.25, type: 'sine', vol: 0.12 });
  },
  /** 미끄러짐 — 내려가는 슬라이드 휘슬. */
  slip: (ac: AudioContext) => tone(ac, { hz: 1300, to: 320, dur: 0.38, type: 'sine', vol: 0.05 }),
  /** 비틀거림 — 흔들리는 음. */
  wobble: (ac: AudioContext) => {
    for (let i = 0; i < 3; i += 1)
      tone(ac, { hz: i % 2 ? 420 : 520, dur: 0.08, type: 'sine', vol: 0.05, at: i * 0.08 });
  },
  /** 관중이 던진 것 — 휙. */
  whoosh: (ac: AudioContext) => noise(ac, { dur: 0.28, hz: 400, to: 3000, q: 1.2, vol: 0.08 }),
  /** 토너먼트 한 경기 — 챙. */
  clash: (ac: AudioContext) => {
    noise(ac, { dur: 0.09, hz: 4000, q: 0.8, vol: 0.07, filter: 'highpass' });
    tone(ac, { hz: 1760, dur: 0.18, type: 'triangle', vol: 0.03 });
    tone(ac, { hz: 2350, dur: 0.12, type: 'triangle', vol: 0.02 });
  },
  /** 짝 맞춤 — 딩동. */
  match: (ac: AudioContext) => {
    tone(ac, { hz: 880, dur: 0.12, vol: 0.06 });
    tone(ac, { hz: 1320, dur: 0.2, vol: 0.06, at: 0.09 });
  },
  /** 시작 — 짧게 올라가는 뾰롱. */
  start: (ac: AudioContext) => {
    tone(ac, { hz: 440, to: 880, dur: 0.12, vol: 0.06 });
    tone(ac, { hz: 660, to: 1320, dur: 0.12, vol: 0.04, at: 0.06 });
  },
  /** 당첨 — 도·미·솔·도. */
  chime: (ac: AudioContext) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((hz, i) =>
      tone(ac, { hz, dur: i === 3 ? 0.45 : 0.16, vol: 0.12, at: 0.02 + i * 0.09 }),
    );
  },
} satisfies Record<string, (ac: AudioContext, arg?: number) => void>;

export type SfxName = keyof typeof SOUNDS;

/** 같은 소리의 최소 간격(ms). */
const MIN_GAP: Partial<Record<SfxName, number>> = { tick: 28, peg: 35, bump: 45, step: 40, burst: 40, plop: 60 };
const last = new Map<SfxName, number>();

/** 효과음 한 번. 소리를 끈 사람에겐 아무 일도 없다. */
export function sfx(name: SfxName, arg?: number): void {
  if (!enabled()) return;
  const now = performance.now();
  const gap = MIN_GAP[name] ?? 30;
  if (now - (last.get(name) ?? -Infinity) < gap) return;
  last.set(name, now);
  const ac = audio();
  if (!ac) return;
  try {
    SOUNDS[name](ac, arg);
  } catch {
    // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
  }
}

/** 나중에 울릴 소리들. cancel 로 한꺼번에 취소한다(연출이 취소되면 소리도 멈춘다). */
export function sfxLater(plan: [ms: number, name: SfxName, arg?: number][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name, arg]) => window.setTimeout(() => sfx(name, arg), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/**
 * CSS transition 으로 움직이는 요소를 따라가며, 값이 step 만큼 지날 때마다 소리를 낸다.
 * 돌림판(각도)·슬롯(세로 위치)이 쓴다. 칸을 지나는 순간 딸깍해서 점점 느려지는 틱이 된다.
 */
export function followTicks(
  el: HTMLElement | null,
  read: (el: HTMLElement) => number,
  step: number,
  durMs: number,
  name: SfxName = 'tick',
): () => void {
  if (!el || !enabled() || step <= 0) return () => {};
  let raf = 0;
  let prev: number | null = null;
  const until = performance.now() + durMs + 100;
  const loop = (now: number) => {
    const v = read(el);
    if (Number.isFinite(v)) {
      if (prev !== null && Math.floor(v / step) !== Math.floor(prev / step)) sfx(name);
      prev = v;
    }
    if (now < until) raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(raf);
}

/** 계산된 transform 의 회전각(도, 0~360). */
export function readRotation(el: HTMLElement): number {
  const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
  const deg = (Math.atan2(m.b, m.a) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** 계산된 transform 의 세로 이동(px). */
export function readTranslateY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === 'none') return 0;
  return new DOMMatrixReadOnly(t).m42;
}

/* ───────── 활쏘기 ─────────
 * 활쏘기 소리는 위 SOUNDS 표 밖에 둔다 — 다른 게임 작업과 같은 줄을 고치지 않게(10/15 동시 작업).
 * 켜기·최소 간격·오디오 없음 처리는 sfx() 와 같다.
 */
const ARCHERY_SOUNDS = {
  /** 활시위를 당길 때 — 끼이익. 낮은 톱니파가 조금씩 올라간다. */
  creak: (ac: AudioContext) => {
    tone(ac, { hz: 140, to: 210, dur: 0.5, type: 'sawtooth', vol: 0.018 });
    for (let i = 0; i < 4; i += 1) noise(ac, { dur: 0.04, hz: rand(600, 900), q: 6, vol: 0.03, at: i * 0.11 });
  },
  /** 시위를 놓을 때 — 퉁 + 바람 가르는 푸슝. */
  twang: (ac: AudioContext) => {
    tone(ac, { hz: 220, to: 110, dur: 0.18, type: 'triangle', vol: 0.08 });
    noise(ac, { dur: 0.3, hz: 600, to: 4000, q: 1.4, vol: 0.09, at: 0.02 });
  },
  /** 과녁에 꽂힐 때 — 퍽. */
  thwack: (ac: AudioContext) => {
    noise(ac, { dur: 0.08, hz: 900, to: 300, q: 0.8, vol: 0.14, filter: 'lowpass' });
    tone(ac, { hz: 260, to: 120, dur: 0.1, type: 'sine', vol: 0.08 });
  },
  /** 테에 맞고 튕길 때 — 팅. */
  ting: (ac: AudioContext) => {
    tone(ac, { hz: 2400, to: 2200, dur: 0.3, type: 'sine', vol: 0.05 });
    tone(ac, { hz: 3600, dur: 0.12, type: 'sine', vol: 0.025 });
  },
  /** 새가 지나갈 때 — 짹짹. */
  tweet: (ac: AudioContext) => {
    tone(ac, { hz: 2600, to: 3400, dur: 0.07, type: 'sine', vol: 0.035 });
    tone(ac, { hz: 2800, to: 3600, dur: 0.07, type: 'sine', vol: 0.035, at: 0.11 });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type ArcherySfx = keyof typeof ARCHERY_SOUNDS;
const archeryLast = new Map<ArcherySfx, number>();

/** 활쏘기 소리 한 번. 이름이 위 SOUNDS 표에 있으면 sfx() 로 넘긴다. */
export function archerySfx(name: ArcherySfx | SfxName): void {
  if (!(name in ARCHERY_SOUNDS)) {
    sfx(name as SfxName);
    return;
  }
  if (!enabled()) return;
  const key = name as ArcherySfx;
  const now = performance.now();
  if (now - (archeryLast.get(key) ?? -Infinity) < 60) return;
  archeryLast.set(key, now);
  const ac = audio();
  if (!ac) return;
  try {
    ARCHERY_SOUNDS[key](ac);
  } catch {
    // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
  }
}

/** 활쏘기 소리 일정. sfxLater 와 같이 취소 함수를 돌려준다. */
export function archerySfxLater(plan: [ms: number, name: ArcherySfx | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name]) => window.setTimeout(() => archerySfx(name), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/* ───────── 종이비행기 전용 소리 ─────────
 * 위 SOUNDS 와 같은 규칙이다 — 소리를 끈 사람에겐 아무 일도 없고, 같은 소리는 최소 간격을 둔다.
 * 종이비행기만 쓰는 소리라 따로 두고, planeSfxLater 가 위 SOUNDS 와 섞어 울린다.
 */
const PLANE_SOUNDS = {
  /** 종이가 구겨지는 바스락. */
  crumple: (ac: AudioContext) => {
    for (let i = 0; i < 6; i += 1)
      noise(ac, { dur: 0.035, hz: rand(2500, 5500), q: 3, vol: 0.06, at: i * 0.035 + rand(0, 0.012) });
  },
  /** 비둘기 구구. */
  coo: (ac: AudioContext) => {
    tone(ac, { hz: 430, to: 360, dur: 0.16, type: 'sine', vol: 0.06 });
    tone(ac, { hz: 400, to: 330, dur: 0.2, type: 'sine', vol: 0.06, at: 0.2 });
  },
  /** 유리창에 부딪힘 — 쨍. */
  glass: (ac: AudioContext) => {
    tone(ac, { hz: 2600, dur: 0.14, type: 'sine', vol: 0.04 });
    noise(ac, { dur: 0.05, hz: 5000, q: 1, vol: 0.05, filter: 'highpass' });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type PlaneSfxName = keyof typeof PLANE_SOUNDS;

const planeLast = new Map<PlaneSfxName, number>();

/** 종이비행기 효과음 예약. SfxName 과 PlaneSfxName 을 섞어 받는다. cancel 로 한꺼번에 취소. */
export function planeSfxLater(plan: [ms: number, name: SfxName | PlaneSfxName][]): () => void {
  if (!enabled()) return () => {};
  const play = (name: SfxName | PlaneSfxName) => {
    if (!(name in PLANE_SOUNDS)) return sfx(name as SfxName);
    const key = name as PlaneSfxName;
    const now = performance.now();
    if (now - (planeLast.get(key) ?? -Infinity) < 60) return;
    planeLast.set(key, now);
    const ac = audio();
    if (!ac) return;
    try {
      PLANE_SOUNDS[key](ac);
    } catch {
      // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
    }
  };
  const timers = plan.map(([ms, name]) => window.setTimeout(() => play(name), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/* ───────── 컬링 ───────── */

/** 컬링 소리. 위 SOUNDS 와 따로 둬서 다른 게임 소리 목록을 건드리지 않는다. */
const CURL_SOUNDS = {
  /** 스톤이 얼음을 미끄러지는 낮은 우르르. */
  rumble: (ac: AudioContext) => {
    noise(ac, { dur: 0.9, hz: 160, to: 110, q: 0.9, vol: 0.07, filter: 'lowpass' });
    tone(ac, { hz: 62, to: 52, dur: 0.8, type: 'sine', vol: 0.035 });
  },
  /** 스톤끼리 부딪치는 딱 — 화강암이라 맑고 짧다. */
  clack: (ac: AudioContext) => {
    noise(ac, { dur: 0.05, hz: rand(2200, 2800), q: 3, vol: 0.14 });
    tone(ac, { hz: rand(820, 960), to: 520, dur: 0.09, type: 'triangle', vol: 0.07 });
  },
  /** 스위퍼 빗자루 쓱. */
  sweep: (ac: AudioContext) => noise(ac, { dur: 0.12, hz: rand(3000, 4200), q: 0.7, vol: 0.05, filter: 'highpass' }),
  /** 측정 테이프가 풀리는 찌릭. */
  tape: (ac: AudioContext) => {
    for (let i = 0; i < 6; i += 1) noise(ac, { dur: 0.018, hz: 5200, q: 4, vol: 0.05, at: i * 0.045 });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type CurlSfxName = keyof typeof CURL_SOUNDS;

/** 컬링 소리(또는 공용 소리)를 나중에 울린다. 취소는 sfxLater 와 같다. 소리를 끈 사람에겐 아무 일도 없다. */
export function curlSfxLater(plan: [ms: number, name: CurlSfxName | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name]) =>
    window.setTimeout(() => {
      if (!(name in CURL_SOUNDS)) {
        sfx(name as SfxName);
        return;
      }
      const ac = audio();
      if (!ac) return;
      try {
        CURL_SOUNDS[name as CurlSfxName](ac);
      } catch {
        // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
      }
    }, ms),
  );
  return () => timers.forEach((t) => window.clearTimeout(t));
}
/* ───────── 보물찾기 ───────── */

/** 보물찾기 소리. 위 SOUNDS 와 따로 둬서 다른 게임 소리 목록을 건드리지 않는다. */
const TREASURE_SOUNDS = {
  /** 지도가 펼쳐지는 사르륵. */
  unroll: (ac: AudioContext) => noise(ac, { dur: 0.45, hz: 1800, to: 4200, q: 0.8, vol: 0.05 }),
  /** 삽질 파바박 — 흙을 퍼내는 짧은 사각 소리 세 번. */
  shovel: (ac: AudioContext) => {
    for (let i = 0; i < 3; i += 1) noise(ac, { dur: 0.06, hz: rand(700, 1100), q: 1.4, vol: 0.09, at: i * 0.11 });
  },
  /** 삽이 상자에 닿는 퉁. */
  clunk: (ac: AudioContext) => {
    tone(ac, { hz: 180, to: 120, dur: 0.14, type: 'triangle', vol: 0.09 });
    noise(ac, { dur: 0.04, hz: 900, q: 2, vol: 0.06 });
  },
  /** 미믹이 덥석. */
  chomp: (ac: AudioContext) => {
    tone(ac, { hz: 140, to: 70, dur: 0.12, type: 'square', vol: 0.05 });
    noise(ac, { dur: 0.05, hz: 1600, q: 2, vol: 0.1, at: 0.02 });
  },
  /** 앵무새 깍깍. */
  squawk: (ac: AudioContext) => {
    tone(ac, { hz: 1500, to: 2300, dur: 0.09, type: 'sawtooth', vol: 0.025 });
    tone(ac, { hz: 1700, to: 2600, dur: 0.1, type: 'sawtooth', vol: 0.025, at: 0.13 });
  },
  /** 꽃게 집게 찰칵. */
  snip: (ac: AudioContext) => {
    noise(ac, { dur: 0.025, hz: 4200, q: 4, vol: 0.09 });
    noise(ac, { dur: 0.025, hz: 3600, q: 4, vol: 0.08, at: 0.07 });
  },
  /** 동전 한 닢 — 띵. */
  coin: (ac: AudioContext) => {
    tone(ac, { hz: 1980, dur: 0.08, type: 'square', vol: 0.025 });
    tone(ac, { hz: 2640, dur: 0.22, type: 'square', vol: 0.025, at: 0.07 });
  },
  /** 보물 — 금빛 화음과 동전 소나기. */
  fanfare: (ac: AudioContext) => {
    [523, 659, 784, 1047].forEach((hz, i) => tone(ac, { hz, dur: 0.32, type: 'triangle', vol: 0.05, at: i * 0.07 }));
    for (let i = 0; i < 6; i += 1) tone(ac, { hz: rand(2200, 3200), dur: 0.06, type: 'square', vol: 0.015, at: 0.3 + i * 0.05 });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type TreasureSfxName = keyof typeof TREASURE_SOUNDS;

/** 보물찾기 소리(또는 공용 소리)를 나중에 울린다. 취소는 sfxLater 와 같다. 소리를 끈 사람에겐 아무 일도 없다. */
export function treasureSfxLater(plan: [ms: number, name: TreasureSfxName | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name]) =>
    window.setTimeout(() => {
      if (!(name in TREASURE_SOUNDS)) {
        sfx(name as SfxName);
        return;
      }
      const ac = audio();
      if (!ac) return;
      try {
        TREASURE_SOUNDS[name as TreasureSfxName](ac);
      } catch {
        // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
      }
    }, ms),
  );
  return () => timers.forEach((t) => window.clearTimeout(t));
}
/* ───────── 인형뽑기 ─────────
 * 인형뽑기 소리는 위 표들 밖에 따로 둔다 — 다른 게임 작업과 같은 줄을 고치지 않게(10/15 동시 작업).
 * 켜기·최소 간격·오디오 없음 처리는 sfx() 와 같다. 표에 없는 이름은 sfx() 로 넘긴다.
 */
const CLAW_SOUNDS = {
  /** 집게 모터 — 낮게 웅. */
  whirr: (ac: AudioContext) => {
    tone(ac, { hz: 110, to: 150, dur: 0.32, type: 'sawtooth', vol: 0.016 });
    noise(ac, { dur: 0.3, hz: 300, q: 2, vol: 0.025, filter: 'bandpass' });
  },
  /** 집게가 오므라드는 철컥. */
  clank: (ac: AudioContext) => {
    noise(ac, { dur: 0.05, hz: 3200, q: 4, vol: 0.12 });
    tone(ac, { hz: 1250, to: 900, dur: 0.07, type: 'square', vol: 0.025 });
    noise(ac, { dur: 0.04, hz: 2400, q: 5, vol: 0.08, at: 0.06 });
  },
  /** 인형이 튀어나올 때 — 띠용. */
  boing: (ac: AudioContext) => tone(ac, { hz: 260, to: 720, dur: 0.22, type: 'sine', vol: 0.07 }),
} satisfies Record<string, (ac: AudioContext) => void>;

export type ClawSfxName = keyof typeof CLAW_SOUNDS;
const clawLast = new Map<ClawSfxName, number>();

/** 인형뽑기 소리 한 번. 이름이 위 SOUNDS 표에 있으면 sfx() 로 넘긴다. */
export function clawSfx(name: ClawSfxName | SfxName): void {
  if (!(name in CLAW_SOUNDS)) {
    sfx(name as SfxName);
    return;
  }
  if (!enabled()) return;
  const key = name as ClawSfxName;
  const now = performance.now();
  if (now - (clawLast.get(key) ?? -Infinity) < 60) return;
  clawLast.set(key, now);
  const ac = audio();
  if (!ac) return;
  try {
    CLAW_SOUNDS[key](ac);
  } catch {
    // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
  }
}

/** 인형뽑기 소리 일정. sfxLater 와 같이 취소 함수를 돌려준다. 소리를 끈 사람에겐 아무 일도 없다. */
export function clawSfxLater(plan: [ms: number, name: ClawSfxName | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name]) => window.setTimeout(() => clawSfx(name), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}
/* ───────── 승부차기 ───────── */

/** 승부차기 소리. 위 SOUNDS 와 따로 둬서 다른 게임 소리 목록을 건드리지 않는다. */
const PENALTY_SOUNDS = {
  /** 심판 호루라기 — 짧게 삑. */
  whistle: (ac: AudioContext) => {
    tone(ac, { hz: 2900, dur: 0.22, type: 'square', vol: 0.02 });
    tone(ac, { hz: 3050, dur: 0.22, type: 'square', vol: 0.012 });
  },
  /** 도움닫기 발소리 — 다다닥. */
  steps: (ac: AudioContext) => {
    for (let i = 0; i < 4; i += 1) noise(ac, { dur: 0.04, hz: rand(500, 800), q: 1.5, vol: 0.07, at: i * 0.09 });
  },
  /** 뻥 — 낮고 둔한 킥. */
  kick: (ac: AudioContext) => {
    tone(ac, { hz: 150, to: 55, dur: 0.16, type: 'sine', vol: 0.18 });
    noise(ac, { dur: 0.06, hz: 900, q: 0.8, vol: 0.1 });
  },
  /** 골대 — 깡. 쇠가 울린다. */
  clang: (ac: AudioContext) => {
    tone(ac, { hz: 1180, dur: 0.5, type: 'triangle', vol: 0.06 });
    tone(ac, { hz: 1770, dur: 0.35, type: 'sine', vol: 0.035 });
    noise(ac, { dur: 0.04, hz: 4200, q: 1, vol: 0.06, filter: 'highpass' });
  },
  /** 장갑에 맞음 — 퍽. */
  glove: (ac: AudioContext) => {
    noise(ac, { dur: 0.08, hz: 600, to: 300, q: 0.9, vol: 0.14, filter: 'lowpass' });
    tone(ac, { hz: 200, to: 90, dur: 0.08, type: 'sine', vol: 0.08 });
  },
  /** 골망 — 촤르륵. */
  net: (ac: AudioContext) => noise(ac, { dur: 0.32, hz: 2600, to: 1200, q: 0.7, vol: 0.08 }),
  /** 관중 탄식 — 아아~ 내려간다. */
  groan: (ac: AudioContext) => {
    noise(ac, { dur: 0.7, hz: 700, to: 300, q: 2, vol: 0.06 });
    tone(ac, { hz: 320, to: 210, dur: 0.6, type: 'sawtooth', vol: 0.012 });
  },
  /** 관중 함성 — 와아. */
  roar: (ac: AudioContext) => {
    noise(ac, { dur: 1.1, hz: 900, to: 1400, q: 0.8, vol: 0.1 });
    noise(ac, { dur: 0.9, hz: 2200, q: 1.2, vol: 0.04, at: 0.05 });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type PenaltySfxName = keyof typeof PENALTY_SOUNDS;

/** 승부차기 소리(또는 공용 소리)를 나중에 울린다. 취소는 sfxLater 와 같다. 소리를 끈 사람에겐 아무 일도 없다. */
export function penaltySfxLater(plan: [ms: number, name: PenaltySfxName | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const timers = plan.map(([ms, name]) =>
    window.setTimeout(() => {
      if (!(name in PENALTY_SOUNDS)) {
        sfx(name as SfxName);
        return;
      }
      const ac = audio();
      if (!ac) return;
      try {
        PENALTY_SOUNDS[name as PenaltySfxName](ac);
      } catch {
        // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
      }
    }, ms),
  );
  return () => timers.forEach((t) => window.clearTimeout(t));
}
/* ───────── 볼링 ───────── */

/** 볼링 소리. 위 SOUNDS 와 따로 둬서 다른 게임 소리 목록을 건드리지 않는다(10/15 동시 작업). */
const BOWL_SOUNDS = {
  /** 공이 레인을 구르는 낮은 우르르. */
  roll: (ac: AudioContext) => {
    noise(ac, { dur: 0.75, hz: 140, to: 220, q: 0.8, vol: 0.07, filter: 'lowpass' });
    tone(ac, { hz: 58, to: 70, dur: 0.7, type: 'sine', vol: 0.03 });
  },
  /** 핀이 와르르 — 짧은 나무 부딪힘을 여러 번. */
  crash: (ac: AudioContext) => {
    for (let i = 0; i < 6; i += 1) {
      const at = i * 0.035 + rand(0, 0.02);
      noise(ac, { dur: 0.06, hz: rand(1400, 2600), q: 2.5, vol: 0.1, at });
      tone(ac, { hz: rand(500, 820), to: rand(260, 380), dur: 0.08, type: 'triangle', vol: 0.04, at });
    }
  },
  /** 핀 하나가 쓰러지는 톡. */
  tok: (ac: AudioContext) => {
    noise(ac, { dur: 0.05, hz: rand(1600, 2200), q: 3, vol: 0.09 });
    tone(ac, { hz: rand(620, 760), to: 360, dur: 0.07, type: 'triangle', vol: 0.04 });
  },
  /** 거터에 빠지는 텅 — 낮고 빈 소리. */
  gutter: (ac: AudioContext) => {
    tone(ac, { hz: 160, to: 90, dur: 0.22, type: 'sine', vol: 0.07 });
    noise(ac, { dur: 0.5, hz: 260, to: 160, q: 1, vol: 0.05, filter: 'lowpass', at: 0.05 });
  },
  /** 치우는 바가 내려와 쓸어 가는 기계음. */
  rake: (ac: AudioContext) => {
    tone(ac, { hz: 110, to: 150, dur: 0.32, type: 'square', vol: 0.012 });
    noise(ac, { dur: 0.3, hz: 900, to: 500, q: 1.2, vol: 0.04 });
  },
  /** 끝까지 버텼어요 — 짧은 팡파르. */
  fanfare: (ac: AudioContext) => {
    [523, 659, 784, 1047].forEach((hz, i) =>
      tone(ac, { hz, dur: i === 3 ? 0.4 : 0.12, type: 'triangle', vol: 0.05, at: i * 0.09 }),
    );
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type BowlSfxName = keyof typeof BOWL_SOUNDS;

const bowlLast = new Map<BowlSfxName, number>();

/** 볼링 소리(또는 공용 소리)를 나중에 울린다. 취소 함수를 돌려준다. 소리를 끈 사람에겐 아무 일도 없다. */
export function bowlSfxLater(plan: [ms: number, name: BowlSfxName | SfxName][]): () => void {
  if (!enabled()) return () => {};
  const play = (name: BowlSfxName | SfxName) => {
    if (!(name in BOWL_SOUNDS)) {
      sfx(name as SfxName);
      return;
    }
    const key = name as BowlSfxName;
    const now = performance.now();
    if (now - (bowlLast.get(key) ?? -Infinity) < 50) return;
    bowlLast.set(key, now);
    const ac = audio();
    if (!ac) return;
    try {
      BOWL_SOUNDS[key](ac);
    } catch {
      // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
    }
  };
  const timers = plan.map(([ms, name]) => window.setTimeout(() => play(name), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}

/* ───────── 폭탄 돌리기 ───────── */

/** 폭탄 소리. 위 SOUNDS 와 따로 둬서 다른 게임 소리 목록을 건드리지 않는다(10/15 동시 작업). */
const BOMB_SOUNDS = {
  /** 심지에 불이 붙는 치익. */
  fuse: (ac: AudioContext) => {
    noise(ac, { dur: 0.32, hz: 5200, to: 3200, q: 0.8, vol: 0.06, filter: 'highpass' });
    tone(ac, { hz: 2400, to: 1800, dur: 0.05, type: 'square', vol: 0.012 });
  },
  /** 시계 초침 째깍 — 짧고 마른 딸깍 두 겹. */
  clock: (ac: AudioContext) => {
    noise(ac, { dur: 0.018, hz: 3800, q: 6, vol: 0.09 });
    tone(ac, { hz: 2100, dur: 0.02, type: 'square', vol: 0.014 });
  },
  /** 폭탄이 휙 날아가는 바람 소리. */
  whoosh: (ac: AudioContext) => noise(ac, { dur: 0.13, hz: rand(700, 900), to: rand(2400, 3000), q: 1.4, vol: 0.06 }),
  /** 앗 뜨거! — 위로 꺾이는 짧은 비명 + 손에서 튀는 톡. */
  hot: (ac: AudioContext) => {
    tone(ac, { hz: 520, to: 1250, dur: 0.12, type: 'sawtooth', vol: 0.025 });
    tone(ac, { hz: 1250, to: 880, dur: 0.1, type: 'triangle', vol: 0.03, at: 0.12 });
    noise(ac, { dur: 0.03, hz: 2200, q: 2, vol: 0.06, at: 0.05 });
  },
  /** 심지가 끝까지 타 들어가는 치이이익 — 길게, 점점 높게. */
  hiss: (ac: AudioContext) => noise(ac, { dur: 0.72, hz: 3000, to: 7000, q: 0.7, vol: 0.07, filter: 'highpass' }),
  /** 불발 — 피식 하고 김빠지는 소리. */
  puff: (ac: AudioContext) => {
    noise(ac, { dur: 0.35, hz: 700, to: 220, q: 0.8, vol: 0.08, filter: 'lowpass' });
    tone(ac, { hz: 300, to: 120, dur: 0.3, type: 'sine', vol: 0.05 });
  },
  /** 삐-익 — 높은 경고음 하나가 길게, 끝에 살짝 꺾인다. */
  beep: (ac: AudioContext) => {
    tone(ac, { hz: 1760, dur: 0.5, type: 'square', vol: 0.025 });
    tone(ac, { hz: 1760, to: 1500, dur: 0.16, type: 'square', vol: 0.02, at: 0.5 });
  },
  /** 3·2·1 카운트 — 낮은 띵. */
  count: (ac: AudioContext) => {
    tone(ac, { hz: 880, dur: 0.16, type: 'triangle', vol: 0.06 });
    tone(ac, { hz: 440, dur: 0.2, type: 'sine', vol: 0.05 });
  },
  /** 받아치기 — 퍽. */
  kick: (ac: AudioContext) => {
    noise(ac, { dur: 0.06, hz: 1200, q: 1, vol: 0.12 });
    tone(ac, { hz: 220, to: 90, dur: 0.1, type: 'sine', vol: 0.1 });
  },
  /** 심장 쿵-쿵. */
  thump: (ac: AudioContext) => {
    tone(ac, { hz: 70, to: 45, dur: 0.14, type: 'sine', vol: 0.2 });
    tone(ac, { hz: 62, to: 40, dur: 0.12, type: 'sine', vol: 0.14, at: 0.16 });
  },
  /** 펑 — 낮게 깔리는 폭발 + 높은 파편. */
  boom: (ac: AudioContext) => {
    noise(ac, { dur: 0.9, hz: 900, to: 120, q: 0.5, vol: 0.22, filter: 'lowpass' });
    tone(ac, { hz: 110, to: 32, dur: 0.8, type: 'sine', vol: 0.24 });
    for (let i = 0; i < 4; i += 1) noise(ac, { dur: 0.05, hz: rand(2400, 4200), q: 2, vol: 0.05, at: 0.08 + i * 0.07 });
  },
} satisfies Record<string, (ac: AudioContext) => void>;

export type BombSfxName = keyof typeof BOMB_SOUNDS;

const bombLast = new Map<BombSfxName, number>();

/** 폭탄 소리를 나중에 울린다. 취소 함수를 돌려준다. 소리를 끈 사람에겐 아무 일도 없다. */
export function bombSfxLater(plan: [ms: number, name: BombSfxName][]): () => void {
  if (!enabled()) return () => {};
  const play = (name: BombSfxName) => {
    const now = performance.now();
    if (now - (bombLast.get(name) ?? -Infinity) < 40) return;
    bombLast.set(name, now);
    const ac = audio();
    if (!ac) return;
    try {
      BOMB_SOUNDS[name](ac);
    } catch {
      // 오디오 노드를 못 만드는 환경 — 소리 없이 넘어간다.
    }
  };
  const timers = plan.map(([ms, name]) => window.setTimeout(() => play(name), ms));
  return () => timers.forEach((t) => window.clearTimeout(t));
}
