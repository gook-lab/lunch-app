/**
 * 보물 도감 — 보물찾기에서 연 상자 속 보물을 localStorage 에 모은다(낚시 도감과 같은 짜임, 10/18).
 *
 * 보물 7종 × (계절 4 + 특별한 날 4) = 56칸. 이름은 '계절-종류' 또는 '특별한날-종류'.
 * 어떤 보물이 나올지는 판 번호 시드로 정하는 연출이다 — 당첨(App 의 winnerIndex)과 상관없다.
 * 이미 있는 이름을 바꾸거나 지울 때만 DEX_VERSION 을 올린다.
 */
import { SPECIAL_LABEL, SPECIAL_MARK, FISH_SPECIALS, type FishSpecial } from './fishDex';

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type TreasureGroup = Season | FishSpecial;
export const TREASURE_KINDS = ['crown', 'gem', 'pouch', 'compass', 'spyglass', 'key', 'map'] as const;
export type TreasureKind = (typeof TREASURE_KINDS)[number];
export type TreasureId = `${TreasureGroup}-${TreasureKind}`;

export const TREASURE_EMOJI: Record<TreasureKind, string> = {
  crown: '👑',
  gem: '💎',
  pouch: '💰',
  compass: '🧭',
  spyglass: '🔭',
  key: '🗝️',
  map: '📜',
};

const NAMES: Record<TreasureGroup, Record<TreasureKind, string>> = {
  spring: { crown: '벚꽃 왕관', gem: '꽃잎 루비', pouch: '봄바람 금화', compass: '새싹 나침반', spyglass: '나비 망원경', key: '꽃봉오리 열쇠', map: '봄꽃 지도' },
  summer: { crown: '산호 왕관', gem: '바다 사파이어', pouch: '조개 금화', compass: '파도 나침반', spyglass: '등대 망원경', key: '소라 열쇠', map: '열대섬 지도' },
  autumn: { crown: '단풍 왕관', gem: '호박 보석', pouch: '도토리 금화', compass: '낙엽 나침반', spyglass: '달맞이 망원경', key: '밤송이 열쇠', map: '추수 지도' },
  winter: { crown: '얼음 왕관', gem: '눈꽃 다이아', pouch: '은화 주머니', compass: '북극성 나침반', spyglass: '오로라 망원경', key: '고드름 열쇠', map: '설원 지도' },
  rain: { crown: '무지개 왕관', gem: '빗방울 진주', pouch: '물웅덩이 금화', compass: '폭풍 나침반', spyglass: '우산 망원경', key: '녹슨 열쇠', map: '젖은 지도' },
  snow: { crown: '눈사람 왕관', gem: '서리 수정', pouch: '눈덩이 은화', compass: '썰매 나침반', spyglass: '눈보라 망원경', key: '얼음 열쇠', map: '눈 덮인 지도' },
  fog: { crown: '유령 왕관', gem: '달빛 오팔', pouch: '안개 은화', compass: '길 잃은 나침반', spyglass: '그림자 망원경', key: '비밀 열쇠', map: '투명 잉크 지도' },
  fri: { crown: '불금 왕관', gem: '파티 보석', pouch: '불꽃 금화', compass: '퇴근 나침반', spyglass: '축제 망원경', key: '주말 열쇠', map: '맛집 지도' },
};

export const TREASURE_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
export const TREASURE_GROUPS: TreasureGroup[] = [...TREASURE_SEASONS, ...FISH_SPECIALS];
export const TREASURE_TOTAL = TREASURE_KINDS.length * TREASURE_GROUPS.length;

const SEASON_LABEL: Record<Season, string> = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
export const TREASURE_GROUP_LABEL: Record<TreasureGroup, string> = {
  ...SEASON_LABEL,
  rain: `${SPECIAL_MARK.rain} ${SPECIAL_LABEL.rain}`,
  snow: `${SPECIAL_MARK.snow} ${SPECIAL_LABEL.snow}`,
  fog: `${SPECIAL_MARK.fog} ${SPECIAL_LABEL.fog}`,
  fri: `${SPECIAL_MARK.fri} ${SPECIAL_LABEL.fri}`,
};

export function treasureName(id: TreasureId): string {
  const [group, kind] = id.split('-') as [TreasureGroup, TreasureKind];
  return NAMES[group]?.[kind] ?? '';
}

/** 이번 판 상자 속 보물 종류. 판 번호만으로 정한다(같은 판은 몇 번 그려도 같다). */
export function treasureKindFor(rand: () => number): TreasureKind {
  return TREASURE_KINDS[Math.min(TREASURE_KINDS.length - 1, Math.floor(rand() * TREASURE_KINDS.length))];
}

const DEX_KEY = 'lunch-app:treasure-dex';
const DEX_VERSION = 1;

export function getTreasureDex(): TreasureId[] {
  try {
    const raw = localStorage.getItem(DEX_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { version: number; found: TreasureId[] };
    return data.version === DEX_VERSION && Array.isArray(data.found) ? data.found : [];
  } catch {
    return [];
  }
}

export function recordTreasures(ids: TreasureId[]): void {
  try {
    const found = getTreasureDex();
    const next = [...found, ...ids.filter((id) => !found.includes(id))];
    if (next.length !== found.length) localStorage.setItem(DEX_KEY, JSON.stringify({ version: DEX_VERSION, found: next }));
  } catch {
    // 저장 실패는 무시한다(시크릿 창 등).
  }
}

export function treasureGroupComplete(found: Iterable<string>, group: TreasureGroup): boolean {
  const set = new Set(found);
  return TREASURE_KINDS.every((k) => set.has(`${group}-${k}`));
}

/** 이번에 연 보물로 도감에 생긴 일 한 줄. 다 채움 > 한 줄 완성 > 새 보물 순. 새로 든 게 없으면 null. */
export function treasureNews(before: TreasureId[], added: TreasureId[]): { text: string; big: boolean } | null {
  const had = new Set(before);
  const fresh = added.filter((id) => !had.has(id));
  if (fresh.length === 0) return null;
  const after = new Set([...before, ...fresh]);
  if (after.size >= TREASURE_TOTAL) return { text: `🏆 보물 ${TREASURE_TOTAL}개를 다 모았어요!`, big: true };
  const groups = [...new Set(fresh.map((id) => id.split('-')[0] as TreasureGroup))];
  const done = groups.find((g) => treasureGroupComplete(after, g) && !treasureGroupComplete(had, g));
  if (done) return { text: `🎉 ${TREASURE_GROUP_LABEL[done]} 보물을 다 모았어요!`, big: true };
  return { text: `✨ 새 보물! 도감 ${after.size}/${TREASURE_TOTAL}`, big: false };
}
