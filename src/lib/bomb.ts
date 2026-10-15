/**
 * 폭탄 돌리기 — 심지에 불 붙은 폭탄을 식탁에 둘러앉은 가게끼리 뜨거운 감자처럼 돌린다.
 * 심지가 다 타는 순간 폭탄을 들고 있던 곳이 당첨이다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 여기서는 판 번호 rng 로 각본(박자표)만 짠다 — 폭탄이 언제
 * 어느 자리로 넘어가는지, 그 사이 어떤 사건이 끼는지, 심지가 얼마나 남았는지. 마지막 박자는 언제나
 * 당첨 자리에서 터진다(boom). 사건은 연출일 뿐 당첨을 바꾸지 않는다.
 *
 * 흐름: 불붙이기 → 뜨거운 감자 패스(점점 빨라진다) → (가짜 위기) → 3·2·1 마지막 세 패스(마지막은 슬로모션) → 펑.
 * 사건
 *  - fumble  앗 뜨거! 받은 곳이 손에서 폭탄을 튕기며 허둥댄다(잠깐 더 머문다).
 *  - bounce  받자마자 도로 넘긴다(한 칸 뒤로 갔다 다시 앞으로).
 *  - dud     당첨 아닌 곳에서 멈추고 심지가 끝까지 타 들어간다… 휴, 불발! 새 심지로 계속.
 *  - beep    당첨 아닌 곳에서 삐-익 소리와 함께 모든 게 얼어붙는다… 휴, 살았다.
 *  - kick    마지막 "1" 에 당첨 다음 자리로 갔다가 거기서 당첨 자리로 받아친다.
 *
 * 약속(bomb.test.ts 가 본다)
 *  - 첫 박자는 지난 판 자리(startSeat), 마지막 박자(boom)는 언제나 winnerIndex.
 *  - 멈춤(dud·beep)과 받아치기 직전 자리는 당첨이 아니다.
 *  - 폭탄은 한 번에 한 칸씩만 옮긴다(앞으로, 받아칠 땐 뒤로).
 *  - 터지기까지 4.5~6.5초, 끝(onSpinEnd)까지 7.2초 안.
 */

export type Cue =
  | 'light'
  | 'pass'
  | 'fumble'
  | 'back'
  | 'stop'
  | 'hiss'
  | 'dud'
  | 'relit'
  | 'beep'
  | 'phew'
  | 'three'
  | 'two'
  | 'one'
  | 'kick'
  | 'fizz'
  | 'boom';

export interface Beat {
  /** 판 시작 기준 ms. */
  atMs: number;
  /** 이 박자부터 폭탄을 든 자리. */
  seat: number;
  /** 폭탄이 앞 자리에서 여기로 옮겨 가는 시간(ms). 제자리면 0. */
  moveMs: number;
  cue: Cue;
  /** 심지 남은 양(0~1) — 이 박자 시작과 다음 박자 시작. 그 사이는 일정하게 탄다. */
  fuseFrom: number;
  fuseTo: number;
  /** 다음 박자까지(ms). 마지막 박자는 끝까지. */
  spanMs: number;
  /** 폭탄이 얼마나 달아올랐나(0~1). 부풀고·흔들리고·붉어진다. */
  heat: number;
  /** 화면 가운데 큰 숫자(3·2·1). */
  count: 3 | 2 | 1 | null;
}

export type StopKind = 'dud' | 'beep';

export interface BombPlan {
  beats: Beat[];
  /** 째깍 소리 시각 — 심지가 줄수록 촘촘해진다. 얼어붙는 동안은 멈춘다. */
  ticks: number[];
  /** 심장 소리 시각 — 위기와 마지막 카운트다운 동안. */
  thumps: number[];
  stop: StopKind | null;
  /** 멈춘 자리(당첨 아님). */
  stopSeat: number | null;
  final: 'straight' | 'kick';
  fumbles: number;
  bounce: boolean;
  boomMs: number;
  /** onSpinEnd 시각. */
  endMs: number;
}

/** 불붙이기(치익) 뒤 첫 패스까지. */
export const LIGHT_MS = 320;
/** 펑 뒤 끝 장면을 보여 주는 시간. */
export const TAIL_MS = 700;
const FUMBLE_MS = 300;
const BOUNCE_BACK_MS = 170;
const BOUNCE_AGAIN_MS = 200;
/** 불발: 멈춤 → 치이이익(심지가 끝까지) → 피식 → 새 심지 → 다음 패스. */
const DUD = { hiss: 160, puff: 860, relit: 1100, next: 1240 };
/** 삐-익: 멈춤 → 삐 → 휴 → 다음 패스. */
const BEEP = { beep: 120, phew: 800, next: 960 };
/** 마지막 세 패스: 앞 박자에서 "3" 까지 · "3"→"2" · "2"→"1" · "1" 슬로모션 이동. */
const FINAL = { three: 340, two: 420, one: 500, slow: 760 };
/** 곧장: "1" 이 당첨에 닿고 → 치지직(fizz) → 펑. */
const STRAIGHT = { fizz: 820, boom: 1120 };
/** 받아치기: "1" 이 다음 자리에 닿고 → 받아침 → 펑. */
const KICK = { kick: 960, kickMove: 190, boom: 1300 };
const MIN_GAP = 46;
const MAX_GAP = 360;

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 0..1 → 0..1, 갈수록 빨리 탄다. */
const burn = (u: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, u)), 0.7);

/**
 * 폭탄 각본. 후보가 두 곳보다 적거나 당첨이 범위 밖이면 null.
 * startSeat 는 지난 판에서 터진 자리(처음엔 0) — 자리 수가 줄었으면 접어서 쓴다.
 */
export function bombPlan(
  count: number,
  startSeat: number,
  winnerIndex: number,
  rng: () => number = Math.random,
): BombPlan | null {
  if (count < 2 || winnerIndex < 0 || winnerIndex >= count) return null;
  const start = mod(startSeat, count);
  const W = winnerIndex;

  // 판의 성격을 먼저 정한다.
  const r1 = rng();
  const stop: StopKind | null = r1 < 0.45 ? 'dud' : r1 < 0.8 ? 'beep' : null;
  const final: BombPlan['final'] = rng() < 0.4 ? 'kick' : 'straight';
  const bounce = rng() < 0.5;
  const r2 = rng();
  let fumbles = r2 < 0.35 ? 0 : r2 < 0.8 ? 1 : 2;
  if (stop === 'dud') fumbles = Math.min(fumbles, 1);

  // 뜨거운 감자 구간(main)이 끝나는 자리 — 거기서 3·2·1 세 패스로 당첨에 닿는다(받아치기는 한 칸 덜 가서 시작).
  const mainEnd = mod(final === 'kick' ? W - 2 : W - 3, count);
  const distance = mod(mainEnd - start, count);
  // 자리가 적으면 여러 바퀴, 많으면 한 바퀴 안쪽도 괜찮다 — 스무 곳을 두 바퀴 돌면 패스가 너무 잘다.
  const minHops = count >= 10 ? 6 : 9 + Math.floor(rng() * 3);
  // 길이 예산: 터지기까지 목표 시간에서 고정 구간을 빼고 남는 만큼 패스에 나눈다.
  const target = 5100 + Math.floor(rng() * 1200);
  const fixedFor = (fumbleN: number, bounced: boolean) =>
    LIGHT_MS +
    FINAL.three +
    FINAL.two +
    FINAL.one +
    (final === 'kick' ? KICK.boom : STRAIGHT.boom) +
    (stop === 'dud' ? DUD.next : stop === 'beep' ? BEEP.next : 0) +
    fumbleN * FUMBLE_MS +
    (bounced ? BOUNCE_BACK_MS + BOUNCE_AGAIN_MS : 0);
  let hops = distance;
  // 패스가 너무 느긋하면(평균 220ms 넘게) 한 바퀴 더 — 뜨거운 감자는 빨라야 한다.
  while (hops < minHops || (target - fixedFor(fumbles, bounce)) / Math.max(1, hops) > 220) hops += count;

  // 사건 자리(main 의 몇 번째 패스인가, 1..hops).
  const seatAt = (j: number) => mod(start + j, count);
  let stopHop = -1;
  if (stop) {
    const lo = Math.max(3, Math.floor(hops * 0.5));
    const hi = Math.max(lo, Math.floor(hops * 0.8));
    stopHop = lo + Math.floor(rng() * (hi - lo + 1));
    if (seatAt(stopHop) === W) stopHop = stopHop + 1 <= hops ? stopHop + 1 : stopHop - 1;
  }
  const free = Array.from({ length: hops }, (_, k) => k + 1).filter((j) => j !== stopHop && j < hops);
  const pick = () => (free.length ? free.splice(Math.floor(rng() * free.length), 1)[0] : -1);
  const fumbleHops = new Set<number>();
  for (let k = 0; k < fumbles; k += 1) {
    const j = pick();
    if (j > 0) fumbleHops.add(j);
  }
  const bounceHop = bounce ? pick() : -1;
  fumbles = fumbleHops.size;

  const fixed = fixedFor(fumbleHops.size, bounceHop > 0);
  const budget = Math.max(hops * 62, target - fixed);
  // 처음엔 느긋하게, 갈수록 빨리(뜨거운 감자). 칸마다 조금씩 흔든다.
  const weights = Array.from({ length: hops }, (_, k) => (1.5 - 0.85 * (k / Math.max(1, hops - 1))) * (0.85 + rng() * 0.3));
  const wSum = weights.reduce((a, w) => a + w, 0);
  const gaps = weights.map((w) => Math.round(Math.min(MAX_GAP, Math.max(MIN_GAP, (w / wSum) * budget))));

  // 박자를 쌓는다. 심지는 나중에 채운다.
  type Raw = Omit<Beat, 'fuseFrom' | 'fuseTo' | 'spanMs' | 'heat'>;
  const raw: Raw[] = [];
  const push = (atMs: number, seat: number, cue: Cue, moveMs = 0, count: Beat['count'] = null) =>
    raw.push({ atMs: Math.round(atMs), seat, cue, moveMs: Math.round(moveMs), count });
  const moveFor = (gap: number) => Math.max(40, Math.min(170, gap * 0.75));

  push(0, start, 'light');
  let t = LIGHT_MS;
  let seat = start;
  let stopAt = -1;
  let freezeFrom = -1;
  let freezeTo = -1;
  for (let j = 1; j <= hops; j += 1) {
    if (j > 1) t += gaps[j - 1];
    seat = seatAt(j);
    if (j === stopHop && stop) {
      push(t, seat, 'stop', moveFor(gaps[j - 1]));
      stopAt = t;
      if (stop === 'dud') {
        push(t + DUD.hiss, seat, 'hiss');
        push(t + DUD.puff, seat, 'dud');
        push(t + DUD.relit, seat, 'relit');
        freezeFrom = t + DUD.hiss;
        freezeTo = t + DUD.relit;
        t += DUD.next;
      } else {
        push(t + BEEP.beep, seat, 'beep');
        push(t + BEEP.phew, seat, 'phew');
        freezeFrom = t + BEEP.beep;
        freezeTo = t + BEEP.phew;
        t += BEEP.next;
      }
      // 멈춘 뒤 다음 패스는 곧장 이어진다.
      t -= gaps[j] ?? 0;
      continue;
    }
    if (fumbleHops.has(j)) {
      push(t, seat, 'fumble', moveFor(gaps[j - 1]));
      t += FUMBLE_MS;
      continue;
    }
    push(t, seat, 'pass', moveFor(gaps[j - 1]));
    if (j === bounceHop) {
      // 받자마자 도로 넘긴다 → 다시 받아서 앞으로.
      t += BOUNCE_BACK_MS;
      push(t, mod(seat - 1, count), 'back', 110);
      t += BOUNCE_AGAIN_MS;
      push(t, seat, 'pass', 110);
    }
  }

  // 3·2·1.
  const finalStart = t;
  t += FINAL.three;
  push(t, mod(mainEnd + 1, count), 'three', 200, 3);
  t += FINAL.two;
  push(t, mod(mainEnd + 2, count), 'two', 240, 2);
  t += FINAL.one;
  push(t, mod(mainEnd + 3, count), 'one', FINAL.slow, 1);
  const oneAt = t;
  let boomMs: number;
  if (final === 'kick') {
    push(oneAt + KICK.kick, W, 'kick', KICK.kickMove, 1);
    boomMs = oneAt + KICK.boom;
  } else {
    push(oneAt + STRAIGHT.fizz, W, 'fizz', 0, 1);
    boomMs = oneAt + STRAIGHT.boom;
  }
  push(boomMs, W, 'boom');
  boomMs = Math.round(boomMs);
  const endMs = boomMs + TAIL_MS;

  // 심지: 불붙인 뒤부터 펑까지 갈수록 빨리 탄다. 얼어붙은 동안(삐-익·불발)은 그 시간을 빼고 잰다.
  // 불발이면 멈춘 자리에서 남은 심지가 끝까지 타 들어갔다가(치이이익) 피식 — 새 심지는 멈추기 전 길이로 다시.
  const frozen = freezeTo - freezeFrom;
  const lifetime = boomMs - LIGHT_MS - Math.max(0, frozen);
  const base = (time: number) => {
    if (time < LIGHT_MS) return 1;
    const lived = time <= freezeFrom || freezeFrom < 0 ? time - LIGHT_MS : time < freezeTo ? freezeFrom - LIGHT_MS : time - LIGHT_MS - frozen;
    return Math.max(0, 1 - burn(lived / lifetime));
  };
  const puffAt = stopAt + DUD.puff;
  const fuseAt = (time: number) => {
    if (stop !== 'dud' || time < freezeFrom || time >= freezeTo) return base(time);
    if (time >= puffAt) return 0;
    return base(freezeFrom) * (1 - (time - freezeFrom) / (puffAt - freezeFrom));
  };

  const beats: Beat[] = raw.map((b, i) => {
    const next = raw[i + 1]?.atMs ?? endMs;
    const fuseFrom = b.cue === 'boom' ? 0 : fuseAt(b.atMs);
    const fuseTo = b.cue === 'boom' ? 0 : fuseAt(next - 0.001);
    const hot = ['hiss', 'dud', 'beep', 'three', 'two', 'one', 'kick', 'fizz', 'boom'].includes(b.cue);
    const heat = hot ? 1 : b.cue === 'stop' ? Math.max(0.7, 1 - fuseFrom) : Math.min(1, 1 - fuseFrom);
    return { ...b, fuseFrom: round3(fuseFrom), fuseTo: round3(fuseTo), spanMs: next - b.atMs, heat: round3(heat) };
  });

  // 째깍: 심지가 줄수록 촘촘하게(380ms → 90ms). 얼어붙은 동안과 펑 뒤는 조용하다.
  const ticks: number[] = [];
  for (let at = LIGHT_MS; at < boomMs - 60; ) {
    if (at >= freezeFrom && at < freezeTo) {
      at = freezeTo;
      continue;
    }
    ticks.push(Math.round(at));
    at += 90 + 290 * fuseAt(at);
  }
  // 심장: 위기(멈춤)와 마지막 3·2·1 동안. 점점 빨라진다.
  const thumps: number[] = [];
  const beatRange = (from: number, to: number, first: number, last: number) => {
    for (let at = from; at < to; ) {
      thumps.push(Math.round(at));
      const u = (at - from) / Math.max(1, to - from);
      at += first + (last - first) * u;
    }
  };
  if (stopAt >= 0) beatRange(stopAt + 80, freezeTo, 520, 400);
  beatRange(finalStart, boomMs - 120, 480, 300);

  return {
    beats,
    ticks,
    thumps,
    stop,
    stopSeat: stopHop > 0 ? seatAt(stopHop) : null,
    final,
    fumbles,
    bounce: bounceHop > 0,
    boomMs,
    endMs,
  };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
