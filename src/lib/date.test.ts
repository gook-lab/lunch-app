import { describe, it, expect } from 'vitest';
import { todayKST, daysBetween, dayIdBefore } from './date';

// 테스트 계획 T1~T5.
// 기대값을 toISOString().slice(0,10) 으로 만들면 00:00~09:00 KST 구간에만 깨지는
// 9시간짜리 flaky 테스트가 된다. 기대값은 전부 손으로 적는다.

describe('todayKST', () => {
  it('T1 — KST 자정 1분 전은 그날', () => {
    // 2026-09-16T14:59Z = 2026-09-16 23:59 KST
    expect(todayKST(new Date('2026-09-16T14:59:00Z'))).toBe('20260916');
  });

  it('T2 — KST 자정 1분 후는 다음 날', () => {
    // 2026-09-16T15:01Z = 2026-09-17 00:01 KST
    expect(todayKST(new Date('2026-09-16T15:01:00Z'))).toBe('20260917');
  });

  it('T3/T4 — 기기 타임존이 무엇이든 같은 결과', () => {
    const instant = new Date('2026-09-16T15:01:00Z');
    const original = process.env.TZ;
    const results: string[] = [];
    for (const tz of ['UTC', 'America/New_York', 'Asia/Seoul', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      results.push(todayKST(instant));
    }
    process.env.TZ = original;
    expect(new Set(results)).toEqual(new Set(['20260917']));
  });

  it('T5 — 한 자리 월·일도 zero-pad 한다', () => {
    // 2026-03-04T15:30Z = 2026-03-05 00:30 KST
    expect(todayKST(new Date('2026-03-04T15:30:00Z'))).toBe('20260305');
    expect(todayKST(new Date('2026-03-04T15:30:00Z'))).not.toBe('202635');
  });
});

describe('daysBetween', () => {
  it('같은 날은 0, 어제는 1', () => {
    expect(daysBetween('20260916', '20260916')).toBe(0);
    expect(daysBetween('20260915', '20260916')).toBe(1);
  });

  it('월 경계를 넘어도 실제 일수로 센다', () => {
    // 9월은 30일. 20260925 -> 20261003 은 8일.
    expect(daysBetween('20260925', '20261003')).toBe(8);
  });

  it('해 경계를 넘어도 맞다', () => {
    expect(daysBetween('20261230', '20270102')).toBe(3);
  });

  it('윤년 2월을 넘어도 맞다', () => {
    // 2028 은 윤년 — 2월 29일이 있다.
    expect(daysBetween('20280228', '20280301')).toBe(2);
  });
});

describe('dayIdBefore', () => {
  it('14일 전을 돌려준다', () => {
    expect(dayIdBefore('20260916', 14)).toBe('20260902');
  });

  it('월 경계를 넘어간다', () => {
    expect(dayIdBefore('20261003', 14)).toBe('20260919');
  });

  it('daysBetween 과 왕복이 맞다', () => {
    const lower = dayIdBefore('20260916', 14);
    expect(daysBetween(lower, '20260916')).toBe(14);
  });
});
