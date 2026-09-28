/**
 * 한국어 조사 선택.
 *
 * 가게 이름은 카카오에서 그대로 온다. "샘플 면집 2", "GS25", "본죽" 처럼
 * 끝 글자가 제각각인데 조사를 문자열에 박아두면 절반이 틀린다 —
 * 실제로 "샘플 면집 2 으로 바꿀까요?" 가 화면에 떠 있었다.
 *
 * 받침 판정은 세 갈래다.
 *  1. 한글 음절: (코드 − 0xAC00) % 28 이 0 이 아니면 받침이 있다. 8 이 ㄹ.
 *  2. 숫자: 읽는 소리로 본다. 1(일)·7(칠)·8(팔)은 ㄹ 받침, 2·4·5·9 는 받침 없음.
 *  3. 로마자: 알파벳 이름의 소리로 본다. L(엘)·M(엠)·N(엔)·R(알) 처럼.
 *
 * 그 밖의 문자(기호 등)는 받침이 있는 쪽으로 본다. "은/는" 에서 "는" 이
 * 잘못 붙는 것보다 "은" 이 붙는 쪽이 덜 어색하다.
 */

/** 조사 쌍. 앞이 받침 있을 때, 뒤가 받침 없을 때. */
export type JosaPair = '은/는' | '이/가' | '을/를' | '과/와' | '으로/로';

interface Ending {
  /** 받침이 있는가. */
  batchim: boolean;
  /** 그 받침이 ㄹ 인가. '으로/로' 만 이걸 본다. */
  rieul: boolean;
}

/** 숫자를 읽었을 때의 끝소리. 0 영, 1 일, 2 이 … */
const DIGIT: Record<string, Ending> = {
  '0': { batchim: true, rieul: false }, // 영 (ㅇ)
  '1': { batchim: true, rieul: true }, // 일 (ㄹ)
  '2': { batchim: false, rieul: false }, // 이
  '3': { batchim: true, rieul: false }, // 삼 (ㅁ)
  '4': { batchim: false, rieul: false }, // 사
  '5': { batchim: false, rieul: false }, // 오
  '6': { batchim: true, rieul: false }, // 육 (ㄱ)
  '7': { batchim: true, rieul: true }, // 칠 (ㄹ)
  '8': { batchim: true, rieul: true }, // 팔 (ㄹ)
  '9': { batchim: false, rieul: false }, // 구
};

/** 알파벳 이름의 끝소리. 에이·비·씨 … 엘·엠·엔 … */
const LATIN: Record<string, Ending> = {
  a: { batchim: false, rieul: false }, // 에이
  b: { batchim: false, rieul: false }, // 비
  c: { batchim: false, rieul: false }, // 씨
  d: { batchim: false, rieul: false }, // 디
  e: { batchim: false, rieul: false }, // 이
  f: { batchim: true, rieul: false }, // 에프
  g: { batchim: false, rieul: false }, // 지
  h: { batchim: false, rieul: false }, // 에이치
  i: { batchim: false, rieul: false }, // 아이
  j: { batchim: false, rieul: false }, // 제이
  k: { batchim: false, rieul: false }, // 케이
  l: { batchim: true, rieul: true }, // 엘
  m: { batchim: true, rieul: false }, // 엠
  n: { batchim: true, rieul: false }, // 엔
  o: { batchim: false, rieul: false }, // 오
  p: { batchim: false, rieul: false }, // 피
  q: { batchim: false, rieul: false }, // 큐
  r: { batchim: true, rieul: true }, // 알
  s: { batchim: true, rieul: false }, // 에스
  t: { batchim: false, rieul: false }, // 티
  u: { batchim: false, rieul: false }, // 유
  v: { batchim: false, rieul: false }, // 브이
  w: { batchim: false, rieul: false }, // 더블유
  x: { batchim: true, rieul: false }, // 엑스
  y: { batchim: false, rieul: false }, // 와이
  z: { batchim: false, rieul: false }, // 지
};

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;
const JONG_COUNT = 28;
const JONG_RIEUL = 8;

/** 마지막 글자의 끝소리. 판정할 글자가 없으면 null. */
function endingOf(word: string): Ending | null {
  // 괄호 안의 지점명 등은 조사와 상관없다. 뒤에서부터 쓸 만한 글자를 찾는다.
  const trimmed = word.trim().replace(/[)\]}>'"”』」\s.]+$/, '');
  const last = trimmed.at(-1);
  if (last === undefined) return null;

  const code = last.charCodeAt(0);
  if (code >= HANGUL_START && code <= HANGUL_END) {
    const jong = (code - HANGUL_START) % JONG_COUNT;
    return { batchim: jong !== 0, rieul: jong === JONG_RIEUL };
  }
  if (DIGIT[last]) return DIGIT[last];

  const lower = last.toLowerCase();
  if (LATIN[lower]) return LATIN[lower];

  return null;
}

/** 단어에 붙일 조사만 돌려준다. */
export function josa(word: string, pair: JosaPair): string {
  const [withBatchim, withoutBatchim] = pair.split('/') as [string, string];
  const ending = endingOf(word);

  // 판정할 글자가 없으면 받침이 있는 쪽으로 본다.
  if (ending === null) return withBatchim;

  // '으로/로' 만 ㄹ 을 받침 없는 쪽으로 친다. "서울로", "1호점으로".
  if (pair === '으로/로' && ending.rieul) return withoutBatchim;

  return ending.batchim ? withBatchim : withoutBatchim;
}

/** 단어 + 조사. 화면에서는 대개 이걸 쓴다. */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
