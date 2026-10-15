/**
 * 익명 아바타 — "배고픈 너구리 🦝" 처럼 형용사 + 동물.
 *
 * 점심 팟에는 실명이 없다. 기기(익명 uid)마다 그날 하루 같은 이름을 주고, 날이 바뀌면 바꾼다.
 * 저장하지 않는다 — uid 와 날짜만 있으면 누구 화면에서나 같은 이름이 나오므로 문서에는 uid 만 둔다.
 * 날마다 바꾸는 이유: 고정 별명이면 며칠 쌓여 "너구리 = 누구" 가 굳는다.
 */
import type { DayId } from './date';

export const ADJECTIVES = [
  '배고픈',
  '졸린',
  '신난',
  '수줍은',
  '용감한',
  '느긋한',
  '부지런한',
  '엉뚱한',
  '다정한',
  '씩씩한',
  '꼼꼼한',
  '명랑한',
  '조용한',
  '든든한',
  '재빠른',
  '말랑한',
  '반짝이는',
  '궁금한',
  '포근한',
  '당당한',
] as const;

export const ANIMALS = [
  { name: '너구리', emoji: '🦝' },
  { name: '판다', emoji: '🐼' },
  { name: '고양이', emoji: '🐱' },
  { name: '강아지', emoji: '🐶' },
  { name: '토끼', emoji: '🐰' },
  { name: '여우', emoji: '🦊' },
  { name: '곰', emoji: '🐻' },
  { name: '코알라', emoji: '🐨' },
  { name: '호랑이', emoji: '🐯' },
  { name: '사자', emoji: '🦁' },
  { name: '펭귄', emoji: '🐧' },
  { name: '병아리', emoji: '🐥' },
  { name: '햄스터', emoji: '🐹' },
  { name: '수달', emoji: '🦦' },
  { name: '고슴도치', emoji: '🦔' },
  { name: '부엉이', emoji: '🦉' },
  { name: '돌고래', emoji: '🐬' },
  { name: '거북이', emoji: '🐢' },
  { name: '다람쥐', emoji: '🐿️' },
  { name: '개구리', emoji: '🐸' },
] as const;

export interface Avatar {
  adjective: string;
  animal: string;
  emoji: string;
  /** "배고픈 너구리" — 그림 없이. */
  label: string;
}

/** FNV-1a 32비트. 암호용이 아니라 고르게 흩는 용도다. */
function fnv1a(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 그날의 아바타. 같은 uid·같은 날이면 늘 같다. */
export function avatarOf(uid: string, day: DayId): Avatar {
  const h = fnv1a(`${uid}|${day}`);
  // 형용사와 동물을 서로 다른 자리에서 뽑는다. 같은 나머지를 쓰면 짝이 묶여 400칸 중 20칸만 나온다.
  const adjective = ADJECTIVES[h % ADJECTIVES.length];
  const animal = ANIMALS[Math.floor(h / ADJECTIVES.length) % ANIMALS.length];
  return { adjective, animal: animal.name, emoji: animal.emoji, label: `${adjective} ${animal.name}` };
}

/**
 * 한 팟 안의 이름표. 같은 이름이 둘이면 뒤 사람에 번호를 붙인다("졸린 판다 2").
 * 순서는 넘겨준 순서(참여 순)를 따른다 — 먼저 온 사람 이름이 바뀌지 않게.
 */
export function avatarsIn(uids: readonly string[], day: DayId): (Avatar & { uid: string })[] {
  const seen = new Map<string, number>();
  return uids.map((uid) => {
    const a = avatarOf(uid, day);
    const n = (seen.get(a.label) ?? 0) + 1;
    seen.set(a.label, n);
    return n === 1 ? { ...a, uid } : { ...a, uid, label: `${a.label} ${n}` };
  });
}
