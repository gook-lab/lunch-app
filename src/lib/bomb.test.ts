/**
 * 폭탄 돌리기 각본 테스트.
 *
 * 공정성: 어떤 후보 수·출발 자리·당첨·시드에서도 지난 판 자리에서 출발해 당첨 자리에서 터진다.
 * 사건(앗 뜨거·도로 넘기기·불발·삐-익·받아치기)은 연출일 뿐 당첨을 바꾸지 않는다.
 */
import { describe, it, expect } from 'vitest';
import { bombPlan, type BombPlan } from './bomb';
import { seededRandom } from './random';

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** 후보 2~20곳 × 출발 4 × 당첨 3 × 시드 16 — 한 번만 만들어 여러 테스트가 같이 본다. */
let cache: [BombPlan, number, number, number][] | null = null;
function eachPlan(fn: (p: BombPlan, count: number, start: number, winner: number) => void) {
  if (!cache) {
    cache = [];
    for (let count = 2; count <= 20; count += 1) {
      for (const start of [0, 1, count - 1, 37]) {
        for (const winner of [0, Math.floor(count / 2), count - 1]) {
          for (let seed = 0; seed < 16; seed += 1) {
            const p = bombPlan(count, start, winner, seededRandom(seed * 7919 + count * 31 + winner));
            expect(p).not.toBeNull();
            cache.push([p!, count, start, winner]);
          }
        }
      }
    }
  }
  for (const [p, count, start, winner] of cache) fn(p, count, start, winner);
}

describe('폭탄 각본 — 공정성', () => {
  it('후보 2~20곳 · 출발·당첨·시드 어디서든: 지난 판 자리에서 출발해 당첨 자리에서 터진다', () => {
    eachPlan((p, count, start, winner) => {
      expect(p.beats[0].seat).toBe(mod(start, count));
      expect(p.beats[0].cue).toBe('light');
      const last = p.beats.at(-1)!;
      expect(last.cue).toBe('boom');
      expect(last.seat).toBe(winner);
      expect(last.atMs).toBe(p.boomMs);
      // 펑은 한 번, 마지막에만.
      expect(p.beats.filter((b) => b.cue === 'boom')).toHaveLength(1);
    });
  });

  it('폭탄은 한 번에 한 칸씩만 — 앞으로, 도로 넘길 땐 뒤로', () => {
    eachPlan((p, count) => {
      for (let i = 1; i < p.beats.length; i += 1) {
        const a = p.beats[i - 1].seat;
        const b = p.beats[i];
        if (b.cue === 'back') expect(b.seat).toBe(mod(a - 1, count));
        else if (b.cue === 'kick') expect(b.seat).toBe(mod(a - 1, count));
        else if (b.seat !== a) expect(b.seat).toBe(mod(a + 1, count));
        if (b.seat !== a) expect(b.moveMs).toBeGreaterThan(0);
      }
    });
  });

  it('가짜 위기는 당첨이 아닌 곳에서만: 멈춤(불발·삐-익) 자리, 받아치기 직전 "1" 자리', () => {
    eachPlan((p, _count, _start, winner) => {
      for (const b of p.beats) {
        if (['stop', 'hiss', 'dud', 'relit', 'beep', 'phew'].includes(b.cue)) expect(b.seat).not.toBe(winner);
      }
      if (p.stop) expect(p.stopSeat).not.toBe(winner);
      const one = p.beats.find((b) => b.cue === 'one')!;
      if (p.final === 'kick') expect(one.seat).not.toBe(winner);
      else expect(one.seat).toBe(winner);
    });
  });
});

describe('폭탄 각본 — 박자·심지', () => {
  it('박자는 시간 순, 3·2·1 은 차례로 펑 직전에, 마지막 패스("1")가 가장 느리다', () => {
    eachPlan((p) => {
      for (let i = 1; i < p.beats.length; i += 1) expect(p.beats[i].atMs).toBeGreaterThan(p.beats[i - 1].atMs);
      const counts = p.beats.filter((b) => b.cue === 'three' || b.cue === 'two' || b.cue === 'one');
      expect(counts.map((b) => b.count)).toEqual([3, 2, 1]);
      const one = counts[2];
      const otherMoves = p.beats.filter((b) => b !== one).map((b) => b.moveMs);
      expect(one.moveMs).toBeGreaterThan(Math.max(...otherMoves));
    });
  });

  it('심지는 줄기만 한다(불발 뒤 새 심지만 예외), 펑에서 0, 불발이면 멈춘 자리에서 끝까지 탄다', () => {
    eachPlan((p) => {
      let prev = 1;
      for (const b of p.beats) {
        if (b.cue === 'relit') {
          expect(b.fuseFrom).toBeGreaterThan(0);
        } else {
          expect(b.fuseFrom).toBeLessThanOrEqual(prev + 1e-9);
        }
        expect(b.fuseTo).toBeLessThanOrEqual(b.fuseFrom + 1e-9);
        prev = b.fuseTo;
      }
      expect(p.beats.at(-1)!.fuseFrom).toBe(0);
      if (p.stop === 'dud') {
        const dud = p.beats.find((b) => b.cue === 'dud')!;
        expect(dud.fuseFrom).toBe(0);
        const relit = p.beats.find((b) => b.cue === 'relit')!;
        expect(relit.fuseFrom).toBeGreaterThan(0.3);
      }
      if (p.stop === 'beep') {
        // 얼어붙은 동안은 심지도 멈춘다.
        const beep = p.beats.find((b) => b.cue === 'beep')!;
        expect(beep.fuseTo).toBe(beep.fuseFrom);
      }
    });
  });

  it('째깍 소리는 갈수록 빨라지고, 심장 소리는 마지막 3·2·1 동안 뛴다', () => {
    eachPlan((p) => {
      const t = p.ticks;
      expect(t.length).toBeGreaterThan(8);
      const gaps = t.slice(1).map((x, i) => x - t[i]).filter((g) => g < 600); // 얼어붙은 틈은 뺀다
      const third = Math.floor(gaps.length / 3);
      const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
      expect(avg(gaps.slice(-third))).toBeLessThan(avg(gaps.slice(0, third)));
      const three = p.beats.find((b) => b.cue === 'three')!;
      expect(p.thumps.filter((x) => x >= three.atMs - 400 && x < p.boomMs).length).toBeGreaterThanOrEqual(3);
      for (const x of [...t, ...p.thumps]) expect(x).toBeLessThan(p.boomMs);
    });
  });

  it('펑까지 4.4~6.5초, 끝(onSpinEnd)까지 4.5~7.2초', () => {
    let min = Infinity;
    let max = 0;
    eachPlan((p) => {
      expect(p.boomMs).toBeGreaterThanOrEqual(4400);
      expect(p.boomMs).toBeLessThanOrEqual(6500);
      expect(p.endMs).toBeGreaterThanOrEqual(4500);
      expect(p.endMs).toBeLessThanOrEqual(7200);
      min = Math.min(min, p.endMs);
      max = Math.max(max, p.endMs);
    });
    expect(max - min).toBeGreaterThan(800); // 판마다 길이가 다르다
  });
});

describe('폭탄 각본 — 사건', () => {
  it('사건이 판마다 고루 나오고, 거의 모든 판에 가짜 위기(불발·삐-익·받아치기)가 있다', () => {
    const n = 3000;
    const tally = { dud: 0, beep: 0, kick: 0, bounce: 0, fumble: 0, fake: 0 };
    for (let s = 0; s < n; s += 1) {
      const count = 2 + (s % 19);
      const p = bombPlan(count, s % count, (s * 7) % count, seededRandom(s + 1))!;
      if (p.stop === 'dud') tally.dud += 1;
      if (p.stop === 'beep') tally.beep += 1;
      if (p.final === 'kick') tally.kick += 1;
      if (p.bounce) tally.bounce += 1;
      if (p.fumbles > 0) tally.fumble += 1;
      if (p.stop || p.final === 'kick') tally.fake += 1;
      // 표시와 박자가 맞는다.
      expect(p.beats.some((b) => b.cue === 'back')).toBe(p.bounce);
      expect(p.beats.filter((b) => b.cue === 'fumble')).toHaveLength(p.fumbles);
    }
    const rate = (k: keyof typeof tally) => tally[k] / n;
    expect(rate('dud')).toBeGreaterThan(0.35);
    expect(rate('dud')).toBeLessThan(0.55);
    expect(rate('beep')).toBeGreaterThan(0.25);
    expect(rate('beep')).toBeLessThan(0.45);
    expect(rate('kick')).toBeGreaterThan(0.3);
    expect(rate('kick')).toBeLessThan(0.5);
    expect(rate('bounce')).toBeGreaterThan(0.35);
    expect(rate('fumble')).toBeGreaterThan(0.5);
    expect(rate('fake')).toBeGreaterThan(0.8);
  });

  it('같은 시드는 같은 각본, 시드가 다르면 달라진다', () => {
    expect(bombPlan(8, 3, 5, seededRandom(42))).toEqual(bombPlan(8, 3, 5, seededRandom(42)));
    const shapes = new Set(
      Array.from({ length: 20 }, (_, s) => {
        const p = bombPlan(8, 3, 5, seededRandom(s))!;
        return p.beats.map((b) => `${b.cue}@${b.atMs}`).join(',');
      }),
    );
    expect(shapes.size).toBeGreaterThan(15);
  });

  it('후보가 두 곳보다 적거나 당첨이 범위 밖이면 null', () => {
    expect(bombPlan(0, 0, 0)).toBeNull();
    expect(bombPlan(1, 0, 0)).toBeNull();
    expect(bombPlan(5, 0, 5)).toBeNull();
    expect(bombPlan(5, 0, -1)).toBeNull();
  });
});
