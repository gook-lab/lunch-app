import { describe, expect, it } from 'vitest';
import { shortName } from './name';

describe('shortName', () => {
  it('샘플 접두를 뗀다', () => {
    expect(shortName('샘플 국밥집')).toBe('국밥집');
  });
  it('기본 6글자까지는 그대로', () => {
    expect(shortName('여섯글자이름')).toBe('여섯글자이름');
  });
  it('넘치면 max-1 글자 + 줄임표로 max 글자를 맞춘다', () => {
    expect(shortName('일곱글자이름임')).toBe('일곱글자이…');
    expect(shortName('일곱글자이름임')).toHaveLength(6);
    expect(shortName('샘플 돈까스 전문점 3', 8)).toBe('돈까스 전문점…');
  });
  it('접두만 있는 이름은 빈 문자열이 된다', () => {
    expect(shortName('샘플 ')).toBe('');
  });
});
