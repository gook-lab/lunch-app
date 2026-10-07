/**
 * 재현 가능한 난수 (mulberry32). 같은 시드는 항상 같은 수열을 낸다.
 *
 * 핀볼 경기 시뮬레이션과 사다리 생성이 같이 쓴다. 당첨을 정하는 데는
 * 쓰지 않는다 — 당첨은 App 이 Math.random 으로 정하고, 여기 난수는
 * "정해진 당첨이 이기는 연출" 을 재현 가능하게 그리는 용도다.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
