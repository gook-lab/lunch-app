/**
 * 픽셀 경마·레이싱 경주 — 정해진 당첨이 1등으로 들어오는 경기를 만든다.
 *
 * 당첨은 App 이 정했다(winnerIndex). 핀볼과 같은 방식이다: 주자마다 구간 속도를
 * 무작위로 뽑아 경기를 한 번 만들고, 1등한 주자의 기록과 당첨 주자의 기록을
 * 맞바꾼다. 주자는 이름(가게)만 다르고 능력 차이가 없으므로 맞바꾼 경기도 똑같이
 * 그럴듯하다. 중간 선두가 바뀌는 긴장은 무작위 구간 속도가 만든다.
 *
 * 시간 단위: 경기 시간 t. 주자는 구간(SLICE)마다 속도 v 로 달린다(거리 1 이 결승).
 *
 * 돌발 상황(사고·부스트·휘청)은 그 주자 기록의 일부다 — 구간 속도를 바꿔 넣고
 * 화면에 알릴 사건으로 남긴다. 기록을 맞바꿀 때 사건도 같이 옮겨 가므로, 넘어진
 * 말이 끝내 1등 하는 역전도 그대로 공정하다.
 */

/** 구간 길이와 개수. 가장 느린 속도(0.72)로도 SLICES·SLICE 안에 결승한다. */
export const SLICE = 0.125;
export const SLICES = 18;

/** 사고(크게 느려짐) · 부스트(크게 빨라짐) · 휘청(조금 느려짐). */
export type RaceEventKind = 'crash' | 'boost' | 'wobble';

export interface RaceEvent {
  /** 몇 번째 구간에서 일어나나. 시작 시간은 slice * SLICE. */
  slice: number;
  kind: RaceEventKind;
}

export interface Race {
  /** paces[i][k] — 주자 i 의 k 번째 구간 속도. */
  paces: number[][];
  /** events[i] — 주자 i 에게 일어나는 돌발 상황(구간 순). */
  events: RaceEvent[][];
  /** 주자별 결승 시간. */
  finish: number[];
  /** 들어온 순서(주자 번호). order[0] 이 당첨. */
  order: number[];
}

function finishTime(pace: number[]): number {
  let d = 0;
  for (let k = 0; k < pace.length; k += 1) {
    const step = pace[k] * SLICE;
    if (d + step >= 1) return k * SLICE + (1 - d) / pace[k];
    d += step;
  }
  return pace.length * SLICE + (1 - d) / pace[pace.length - 1];
}

/** 주자 i 가 경기 시간 t 에 달린 거리(0~1, 결승 뒤엔 1). */
export function progress(pace: number[], t: number): number {
  let d = 0;
  for (let k = 0; k < pace.length; k += 1) {
    const start = k * SLICE;
    if (t <= start) break;
    d += pace[k] * Math.min(SLICE, t - start);
    if (d >= 1) return 1;
  }
  return Math.min(1, d);
}

export function buildRace(count: number, winnerIndex: number, random: () => number = Math.random): Race {
  const runners = Array.from({ length: count }, () => {
    // 기본 속도에 구간마다 흔들림. 막판 스퍼트를 하는 주자가 섞여 역전이 생긴다.
    const base = 0.86 + random() * 0.16;
    const kick = random() < 0.4 ? 0.12 + random() * 0.1 : 0;
    const pace = Array.from({ length: SLICES }, (_, k) => {
      const wobble = (random() - 0.5) * 0.28;
      const late = k >= 5 ? kick : 0;
      return Math.max(0.72, base + wobble + late);
    });
    // 돌발 상황 — 주자 셋 중 하나꼴. 결승 직전(7구간~)엔 안 일으킨다: 끝 장면이 어수선해진다.
    const events: RaceEvent[] = [];
    if (random() < 0.38) {
      const slice = 1 + Math.floor(random() * 5);
      const roll = random();
      const kind: RaceEventKind = roll < 0.4 ? 'crash' : roll < 0.75 ? 'boost' : 'wobble';
      pace[slice] = kind === 'crash' ? 0.15 : kind === 'boost' ? pace[slice] + 0.75 : pace[slice] * 0.6;
      events.push({ slice, kind });
    }
    return { pace, events };
  });
  let finish = runners.map((r) => finishTime(r.pace));
  const fastest = finish.indexOf(Math.min(...finish));
  if (fastest !== winnerIndex) {
    [runners[fastest], runners[winnerIndex]] = [runners[winnerIndex], runners[fastest]];
    finish = runners.map((r) => finishTime(r.pace));
  }
  // 동시 도착이면 당첨을 살짝 앞당겨 단독 1등으로.
  const others = finish.filter((_, i) => i !== winnerIndex);
  if (others.length && Math.min(...others) - finish[winnerIndex] < 0.004) {
    runners[winnerIndex].pace = runners[winnerIndex].pace.map((v) => v * 1.01);
    finish = runners.map((r) => finishTime(r.pace));
  }
  const order = finish.map((f, i) => [f, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  return { paces: runners.map((r) => r.pace), events: runners.map((r) => r.events), finish, order };
}
