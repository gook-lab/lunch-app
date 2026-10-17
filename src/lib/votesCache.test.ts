import { describe, expect, it } from 'vitest';
import { cacheable, pruneCachedVotes, readCachedVotes, writeCachedVotes } from './votesCache';

function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
  };
}

const TODAY = '20261017';
const V = [{ uid: 'u1', placeId: 'p1', name: '민지' }];

describe('지난 날 예측 표 보관', () => {
  it('그저께부터만 둔다 — 오늘·어제는 아직 바뀔 수 있다', () => {
    expect(cacheable('20261015', TODAY)).toBe(true);
    expect(cacheable('20261016', TODAY)).toBe(false);
    expect(cacheable(TODAY, TODAY)).toBe(false);
  });

  it('쓴 것을 그대로 읽고, 어제 표는 쓰지 않는다', () => {
    const s = memStore();
    writeCachedVotes('live', '20261015', TODAY, V, s);
    writeCachedVotes('live', '20261016', TODAY, V, s);
    expect(readCachedVotes('live', '20261015', s)).toEqual(V);
    expect(readCachedVotes('live', '20261016', s)).toBeNull();
  });

  it('빈 표도 보관한다 — 아무도 안 맞힌 날을 매번 다시 읽지 않는다', () => {
    const s = memStore();
    writeCachedVotes('live', '20261014', TODAY, [], s);
    expect(readCachedVotes('live', '20261014', s)).toEqual([]);
  });

  it('데모와 실제 표는 섞이지 않는다', () => {
    const s = memStore();
    writeCachedVotes('demo', '20261015', TODAY, V, s);
    expect(readCachedVotes('live', '20261015', s)).toBeNull();
  });

  it('깨진 값은 없는 것으로 본다', () => {
    const s = memStore();
    s.setItem('lunch-app:votes:v1:live:20261015', '{not json');
    expect(readCachedVotes('live', '20261015', s)).toBeNull();
  });

  it('이번 달이 아닌 날은 지우고 다른 키는 건드리지 않는다', () => {
    const s = memStore();
    writeCachedVotes('live', '20260930', TODAY, V, s);
    writeCachedVotes('live', '20261015', TODAY, V, s);
    writeCachedVotes('demo', '20260930', TODAY, V, s);
    s.setItem('lunch-app:other', 'x');
    pruneCachedVotes('live', ['20261015'], s);
    expect(readCachedVotes('live', '20260930', s)).toBeNull();
    expect(readCachedVotes('live', '20261015', s)).toEqual(V);
    expect(readCachedVotes('demo', '20260930', s)).toEqual(V);
    expect(s.getItem('lunch-app:other')).toBe('x');
  });
});
