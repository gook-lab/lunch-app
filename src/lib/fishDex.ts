/**
 * 낚시 도감 — 낚은 물고기 종류를 localStorage 에 기록한다.
 *
 * 종류는 '계절-물고기종류' 형식이다. 예: 'spring-carp', 'winter-mackerel'.
 * 종을 변경할 때 '낚은 도감'이 리셋되므로, 변경 전에 번들 버전을 올려야 한다.
 */

export type FishSpeciesId = `${'spring' | 'summer' | 'autumn' | 'winter'}-${'carp' | 'puffer' | 'mackerel' | 'angel' | 'sardine' | 'whale' | 'squid'}`;

export const FISH_SPECIES_NAMES: Record<'carp' | 'puffer' | 'mackerel' | 'angel' | 'sardine' | 'whale' | 'squid', string> = {
  carp: '붕어',
  puffer: '복어',
  mackerel: '고등어',
  angel: '엔젤피시',
  sardine: '멸치',
  whale: '고래',
  squid: '오징어',
};

type Season = 'spring' | 'summer' | 'autumn' | 'winter';
type Kind = keyof typeof FISH_SPECIES_NAMES;

/** 계절마다 같은 몸 모양이 다른 이름·빛깔로 나온다(도감 28칸). */
export const SEASON_FISH: Record<Season, Record<Kind, string>> = {
  spring: { carp: '벚꽃 붕어', puffer: '꽃복어', mackerel: '봄 삼치', angel: '나비 엔젤', sardine: '봄 멸치', whale: '아기 고래', squid: '꼴뚜기' },
  summer: { carp: '연못 잉어', puffer: '가시복', mackerel: '전갱이', angel: '열대 엔젤', sardine: '꽁치', whale: '혹등고래', squid: '한치' },
  autumn: { carp: '황금 붕어', puffer: '황복', mackerel: '가을 고등어', angel: '단풍 엔젤', sardine: '전어', whale: '향유고래', squid: '오징어' },
  winter: { carp: '얼음 붕어', puffer: '참복', mackerel: '방어', angel: '눈꽃 엔젤', sardine: '빙어', whale: '흰돌고래', squid: '대왕오징어' },
};

/** 계절 빛깔 — 물고기 hue 에 더한다(연출 전용). */
export const SEASON_HUE: Record<Season, number> = { spring: -45, summer: 0, autumn: 25, winter: 160 };

export const FISH_EMOJI: Record<Kind, string> = { carp: '🐟', puffer: '🐡', mackerel: '🐟', angel: '🐠', sardine: '🐟', whale: '🐋', squid: '🦑' };

export function fishName(id: FishSpeciesId): string {
  const [season, kind] = id.split('-') as [Season, Kind];
  return SEASON_FISH[season]?.[kind] ?? FISH_SPECIES_NAMES[kind];
}

const DEX_KEY = 'lunch-app:fish-dex';
const DEX_VERSION = 1;

interface DexData {
  version: number;
  caught: FishSpeciesId[];
}

/**
 * 도감에서 낚은 물고기 목록을 읽는다.
 */
export function getFishDex(): FishSpeciesId[] {
  try {
    const raw = localStorage.getItem(DEX_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as DexData;
    if (data.version !== DEX_VERSION) return []; // 버전이 다르면 리셋
    return data.caught;
  } catch {
    return [];
  }
}

/**
 * 낚은 물고기를 도감에 기록한다. 중복은 무시한다.
 */
export function recordCaughtFish(speciesId: FishSpeciesId): void {
  try {
    const current = getFishDex();
    if (!current.includes(speciesId)) {
      current.push(speciesId);
      const data: DexData = { version: DEX_VERSION, caught: current };
      localStorage.setItem(DEX_KEY, JSON.stringify(data));
    }
  } catch {
    // 저장 실패는 무시한다.
  }
}

/**
 * 도감을 초기화한다. (개발 또는 테스트용)
 */
export function clearFishDex(): void {
  try {
    localStorage.removeItem(DEX_KEY);
  } catch {
    // 무시
  }
}
