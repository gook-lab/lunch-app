// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { addShown, readShown, readSkipShown, withoutShown, writeSkipShown } from './shownToday';

const c = (...ids: string[]) => ids.map((id) => ({ id }));

describe('withoutShown — 오늘 나온 곳 빼기', () => {
  it('나온 곳이 없으면 그대로', () => {
    expect(withoutShown(c('a', 'b', 'c'), [], 2)).toEqual({ list: c('a', 'b', 'c'), skipped: 0, restarted: false });
  });

  it('나온 곳을 빼고 뺀 수를 센다', () => {
    expect(withoutShown(c('a', 'b', 'c', 'd'), ['b', 'x'], 2)).toEqual({
      list: c('a', 'c', 'd'),
      skipped: 1,
      restarted: false,
    });
  });

  it('빼고 나서 min 보다 적으면 처음부터 다시 돈다', () => {
    expect(withoutShown(c('a', 'b', 'c'), ['a', 'b'], 2)).toEqual({ list: c('a', 'b', 'c'), skipped: 0, restarted: true });
  });

  it('딱 min 곳 남으면 뺀다', () => {
    expect(withoutShown(c('a', 'b', 'c'), ['a'], 2).list).toEqual(c('b', 'c'));
  });
});

describe('저장', () => {
  beforeEach(() => localStorage.clear());

  it('같은 날만 읽고, 날이 바뀌면 비운다', () => {
    const ids = addShown('20261015', [], 'a');
    expect(addShown('20261015', ids, 'a')).toEqual(['a']);
    expect(readShown('20261015')).toEqual(['a']);
    expect(readShown('20261016')).toEqual([]);
  });

  it('깨진 값은 빈 목록', () => {
    localStorage.setItem('lunch-app:shown', '{oops');
    expect(readShown('20261015')).toEqual([]);
  });

  it('설정은 켜고 끈다', () => {
    expect(readSkipShown()).toBe(false);
    writeSkipShown(true);
    expect(readSkipShown()).toBe(true);
    writeSkipShown(false);
    expect(readSkipShown()).toBe(false);
  });
});
