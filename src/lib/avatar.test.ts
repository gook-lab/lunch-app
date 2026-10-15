import { describe, expect, it } from 'vitest';
import { ADJECTIVES, ANIMALS, avatarOf, avatarsIn } from './avatar';

describe('익명 아바타', () => {
  it('같은 uid·같은 날이면 늘 같다', () => {
    expect(avatarOf('uid-1', '20261015')).toEqual(avatarOf('uid-1', '20261015'));
  });

  it('날이 바뀌면 대개 바뀐다', () => {
    const days = Array.from({ length: 10 }, (_, i) => `202610${String(i + 10)}`);
    const labels = new Set(days.map((d) => avatarOf('uid-1', d).label));
    expect(labels.size).toBeGreaterThan(5);
  });

  it('형용사 20 × 동물 20 이 고르게 나온다', () => {
    expect(ADJECTIVES.length).toBe(20);
    expect(ANIMALS.length).toBe(20);
    const adj = new Map<string, number>();
    const ani = new Map<string, number>();
    const pairs = new Set<string>();
    for (let i = 0; i < 4000; i += 1) {
      const a = avatarOf(`anon-${i}`, '20261015');
      adj.set(a.adjective, (adj.get(a.adjective) ?? 0) + 1);
      ani.set(a.animal, (ani.get(a.animal) ?? 0) + 1);
      pairs.add(a.label);
    }
    expect(adj.size).toBe(20);
    expect(ani.size).toBe(20);
    // 기대값 200. 한쪽으로 쏠리면(해시가 짝을 묶으면) 여기서 걸린다.
    for (const n of [...adj.values(), ...ani.values()]) expect(n).toBeGreaterThan(120);
    // 형용사와 동물이 따로 놀아야 400칸 대부분이 나온다.
    expect(pairs.size).toBeGreaterThan(380);
  });

  it('이름표는 "형용사 동물" 이고 그림은 따로 둔다', () => {
    const a = avatarOf('x', '20261015');
    expect(a.label).toBe(`${a.adjective} ${a.animal}`);
    expect(ANIMALS.find((x) => x.name === a.animal)?.emoji).toBe(a.emoji);
  });

  it('한 팟 안에서 같은 이름이 겹치면 뒤 사람에 번호를 붙인다', () => {
    // 같은 이름이 나오는 서로 다른 uid 두 개를 찾는다.
    const day = '20261015';
    const seen = new Map<string, string>();
    let pair: [string, string] | null = null;
    for (let i = 0; !pair; i += 1) {
      const uid = `u${i}`;
      const label = avatarOf(uid, day).label;
      const prev = seen.get(label);
      if (prev) pair = [prev, uid];
      else seen.set(label, uid);
    }
    const list = avatarsIn([pair[0], 'other', pair[1]], day);
    expect(list[0].label).toBe(avatarOf(pair[0], day).label);
    expect(list[2].label).toBe(`${avatarOf(pair[1], day).label} 2`);
    expect(list.map((a) => a.uid)).toEqual([pair[0], 'other', pair[1]]);
  });
});
