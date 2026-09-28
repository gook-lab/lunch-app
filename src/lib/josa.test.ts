import { describe, it, expect } from 'vitest';
import { josa, withJosa } from './josa';

describe('josa — 한글 받침', () => {
  it('받침이 있으면 은·이·을·과·으로', () => {
    expect(josa('국밥', '은/는')).toBe('은');
    expect(josa('국밥', '이/가')).toBe('이');
    expect(josa('국밥', '을/를')).toBe('을');
    expect(josa('국밥', '과/와')).toBe('과');
    expect(josa('국밥', '으로/로')).toBe('으로');
  });

  it('받침이 없으면 는·가·를·와·로', () => {
    expect(josa('국수', '은/는')).toBe('는');
    expect(josa('국수', '이/가')).toBe('가');
    expect(josa('국수', '을/를')).toBe('를');
    expect(josa('국수', '과/와')).toBe('와');
    expect(josa('국수', '으로/로')).toBe('로');
  });

  it('ㄹ 받침은 으로/로 에서만 받침 없는 쪽으로 친다', () => {
    // "서울로 갑니다" 가 맞고 "서울으로" 는 틀리다.
    expect(josa('서울', '으로/로')).toBe('로');
    // 다른 조사는 그대로 받침 취급이다 — "서울은", "서울이".
    expect(josa('서울', '은/는')).toBe('은');
    expect(josa('서울', '이/가')).toBe('이');
  });
});

describe('josa — 숫자로 끝나는 이름', () => {
  it('화면에 실제로 떠 있던 오류를 잡는다', () => {
    // "샘플 면집 2 으로 바꿀까요?" 가 잘못이었다. 2 는 "이" 라 받침이 없다.
    expect(withJosa('샘플 면집 2', '으로/로')).toBe('샘플 면집 2로');
  });

  it('1·7·8 은 ㄹ 받침이라 로', () => {
    expect(josa('1호점 1', '으로/로')).toBe('로'); // 일
    expect(josa('7', '으로/로')).toBe('로'); // 칠
    expect(josa('8', '으로/로')).toBe('로'); // 팔
  });

  it('0·3·6 은 받침이 있어 으로', () => {
    expect(josa('10', '으로/로')).toBe('으로'); // 십 → 영
    expect(josa('3', '으로/로')).toBe('으로'); // 삼
    expect(josa('6', '으로/로')).toBe('으로'); // 육
  });

  it('2·4·5·9 는 받침이 없다', () => {
    for (const d of ['2', '4', '5', '9']) {
      expect(josa(`가게 ${d}`, '이/가'), `숫자 ${d}`).toBe('가');
    }
  });
});

describe('josa — 로마자로 끝나는 이름', () => {
  it('GS25 는 5(오)로 끝나 받침이 없다', () => {
    expect(withJosa('GS25', '이/가')).toBe('GS25가');
  });

  it('알파벳 이름의 끝소리를 본다', () => {
    expect(josa('CU', '이/가')).toBe('가'); // 유
    expect(josa('KFC', '이/가')).toBe('가'); // 씨
    expect(josa('SPC', '으로/로')).toBe('로'); // 씨
    expect(josa('McDonald', '이/가')).toBe('가'); // 디 — 받침 없음
    expect(josa('Seoul', '으로/로')).toBe('로'); // 엘 → ㄹ
    expect(josa('Burger King', '이/가')).toBe('가'); // 지
  });

  it('대소문자를 가리지 않는다', () => {
    expect(josa('abcL', '으로/로')).toBe(josa('abcl', '으로/로'));
  });
});

describe('josa — 가장자리', () => {
  it('끝의 괄호·따옴표·마침표는 건너뛴다', () => {
    expect(josa('김밥천국 (시청점)', '이/가')).toBe('이'); // 점 → ㅁ 받침
    expect(josa('본죽.', '이/가')).toBe('이'); // 죽 → ㄱ 받침
    expect(josa('국수.', '이/가')).toBe('가'); // 수 → 받침 없음
  });

  it('판정할 글자가 없으면 받침 있는 쪽으로 본다', () => {
    expect(josa('', '은/는')).toBe('은');
    expect(josa('   ', '은/는')).toBe('은');
    expect(josa('!!!', '은/는')).toBe('은');
  });

  it('withJosa 는 단어와 조사를 붙여 준다', () => {
    expect(withJosa('국밥', '은/는')).toBe('국밥은');
    expect(withJosa('국수', '은/는')).toBe('국수는');
  });
});
