/**
 * 낚시 일정·연못 배치 테스트.
 *
 * 마지막에 걸리는 물고기가 당첨이고 그 앞 입질은 당첨이 아닌지, 시각이 차례대로이고
 * 끝이 4~6초인지, 물고기 자리가 연못(물) 안에 겹치지 않게 놓이는지 본다. 후보는 2~20곳.
 */
import { describe, it, expect } from 'vitest';
import { fishingPlan, pondColumns, pondLayout, SKY } from './fishing';
import { seededRandom } from './random';

describe('낚시 입질 일정', () => {
  it('모든 후보 수·당첨·시드에서: 마지막은 당첨, 앞은 당첨 아님, 시각 증가, 4~6초', () => {
    for (let count = 2; count <= 20; count += 1) {
      for (const winner of [0, Math.floor(count / 2), count - 1]) {
        for (let k = 0; k < 30; k += 1) {
          const plan = fishingPlan(count, winner, () => k / 30)!;
          expect(plan).not.toBeNull();
          const { bites } = plan;
          expect(bites.at(-1)!.fish).toBe(winner);
          // 헛입질 2~3번.
          expect(bites.length).toBeGreaterThanOrEqual(3);
          expect(bites.length).toBeLessThanOrEqual(4);
          for (const b of bites.slice(0, -1)) {
            expect(b.fish).not.toBe(winner);
            expect(b.fish).toBeGreaterThanOrEqual(0);
            expect(b.fish).toBeLessThan(count);
          }
          // 같은 물고기가 연달아 오지 않는다(다른 물고기가 둘 이상일 때).
          if (count > 2) for (let i = 1; i < bites.length - 1; i += 1) expect(bites[i].fish).not.toBe(bites[i - 1].fish);

          expect(bites[0].moveMs).toBe(plan.castMs);
          let prev = 0;
          for (const b of bites) {
            expect(b.moveMs).toBeGreaterThanOrEqual(prev);
            expect(b.biteMs).toBeGreaterThan(b.moveMs);
            expect(b.leaveMs).toBeGreaterThan(b.biteMs);
            prev = b.leaveMs;
          }
          expect(plan.landMs).toBeGreaterThan(prev);
          expect(plan.endMs).toBeGreaterThan(plan.landMs);
          expect(plan.endMs).toBeGreaterThanOrEqual(4000);
          expect(plan.endMs).toBeLessThanOrEqual(6000);
        }
      }
    }
  });

  it('당첨 입질이 헛입질보다 길게 뜸을 들인다', () => {
    for (let s = 0; s < 50; s += 1) {
      const { bites } = fishingPlan(12, 4, seededRandom(s))!;
      const hold = bites.map((b) => b.leaveMs - b.biteMs);
      expect(hold.at(-1)).toBeGreaterThanOrEqual(Math.max(...hold.slice(0, -1)));
    }
  });

  it('입질하는 물고기는 시드마다 달라진다', () => {
    const seqs = new Set(
      Array.from({ length: 20 }, (_, s) => fishingPlan(10, 3, seededRandom(s))!.bites.map((b) => b.fish).join(',')),
    );
    expect(seqs.size).toBeGreaterThan(10);
  });

  it('같은 시드는 같은 일정', () => {
    expect(fishingPlan(12, 5, seededRandom(42))).toEqual(fishingPlan(12, 5, seededRandom(42)));
  });

  it('후보가 두 곳보다 적거나 당첨이 범위 밖이면 null', () => {
    expect(fishingPlan(0, 0)).toBeNull();
    expect(fishingPlan(1, 0)).toBeNull();
    expect(fishingPlan(5, 5)).toBeNull();
    expect(fishingPlan(5, -1)).toBeNull();
  });
});

describe('연못 배치', () => {
  it('물고기는 모두 물 안에 있고, 칸이 달라 이름표 자리가 겹치지 않는다', () => {
    for (let count = 2; count <= 20; count += 1) {
      const { fish, cols, cellH } = pondLayout(count, seededRandom(count));
      expect(fish).toHaveLength(count);
      const cellW = 100 / cols;
      for (const f of fish) {
        expect(f.y).toBeGreaterThan(SKY);
        expect(f.y).toBeLessThan(100);
        // 헤엄쳐도 연못 밖으로 안 나간다(이름표 반 폭(칸의 36%)만큼 여유).
        expect(f.x - f.range - cellW * 0.36).toBeGreaterThanOrEqual(0);
        expect(f.x + f.range + cellW * 0.36).toBeLessThanOrEqual(100);
      }
      // 같은 줄의 이웃은 칸 폭의 70% 넘게, 다른 줄은 칸 높이의 70% 넘게 떨어진다.
      for (let i = 0; i < count; i += 1) {
        for (let j = i + 1; j < count; j += 1) {
          const dx = Math.abs(fish[i].x - fish[j].x);
          const dy = Math.abs(fish[i].y - fish[j].y);
          expect(dx > cellW * 0.7 || dy > cellH * 0.7).toBe(true);
        }
      }
    }
  });

  it('열 수: 20곳은 4열(5줄), 5곳은 3열, 2곳은 2열', () => {
    expect(pondColumns(20)).toBe(4);
    expect(pondColumns(5)).toBe(3);
    expect(pondColumns(2)).toBe(2);
    expect(pondLayout(20).rows).toBe(5);
  });
});
