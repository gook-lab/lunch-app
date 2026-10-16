/**
 * 낚시 도감 — 낚은 물고기 종류를 localStorage 에 기록한다.
 *
 * 종류는 '계절-물고기종류' 형식이다. 예: 'spring-carp', 'winter-mackerel'.
 * 특별한 날은 'rain-carp' 처럼 날씨·금요일이 앞에 온다(10/16 — 계절 28 + 특별 28 = 56칸).
 * 이미 있는 이름을 바꾸거나 지울 때만 DEX_VERSION 을 올린다(더하기만 하면 기록은 그대로 둔다).
 */

/** 특별한 날 — 날씨(비·눈·안개)나 금요일에 낚으면 계절 물고기와 함께 하나 더 기록된다. */
export type FishSpecial = 'rain' | 'snow' | 'fog' | 'fri';
export type FishSpeciesId = `${'spring' | 'summer' | 'autumn' | 'winter' | FishSpecial}-${'carp' | 'puffer' | 'mackerel' | 'angel' | 'sardine' | 'whale' | 'squid'}`;

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

/** 특별한 날 물고기(도감 28칸 더). 이름만 다르고 몸 모양은 같은 종류를 따른다. */
export const SPECIAL_FISH: Record<FishSpecial, Record<Kind, string>> = {
  rain: { carp: '빗물 미꾸라지', puffer: '물방울 복어', mackerel: '장마 갈치', angel: '무지개 엔젤', sardine: '빗방울 송사리', whale: '먹구름 고래', squid: '먹물 문어' },
  snow: { carp: '눈송이 송어', puffer: '눈사람 복어', mackerel: '대구', angel: '오로라 엔젤', sardine: '도루묵', whale: '북극고래', squid: '얼음 해파리' },
  fog: { carp: '안개 메기', puffer: '유령 복어', mackerel: '은갈치', angel: '달빛 엔젤', sardine: '그림자 은어', whale: '안개 고래', squid: '반딧불 오징어' },
  fri: { carp: '황금 잉어', puffer: '불금 복어', mackerel: '불꽃 참치', angel: '파티 엔젤', sardine: '금멸치', whale: '축제 고래', squid: '네온 오징어' },
};
export const SPECIAL_LABEL: Record<FishSpecial, string> = { rain: '비 오는 날', snow: '눈 오는 날', fog: '안개 낀 날', fri: '불금' };
export const SPECIAL_MARK: Record<FishSpecial, string> = { rain: '💧', snow: '❄️', fog: '🌫️', fri: '✨' };
export const FISH_SPECIALS: FishSpecial[] = ['rain', 'snow', 'fog', 'fri'];

/** 오늘 조건에서 나오는 특별한 날 — 날씨 하나(있으면)와 금요일. */
export function specialsFor(a: { weather: string; weekday: number }): FishSpecial[] {
  const out: FishSpecial[] = [];
  if (a.weather === 'rain' || a.weather === 'snow' || a.weather === 'fog') out.push(a.weather);
  if (a.weekday === 5) out.push('fri');
  return out;
}

/** 계절 빛깔 — 물고기 hue 에 더한다(연출 전용). */
export const SEASON_HUE: Record<Season, number> = { spring: -45, summer: 0, autumn: 25, winter: 160 };

export const FISH_EMOJI: Record<Kind, string> = { carp: '🐟', puffer: '🐡', mackerel: '🐟', angel: '🐠', sardine: '🐟', whale: '🐋', squid: '🦑' };

export function fishName(id: FishSpeciesId): string {
  const [group, kind] = id.split('-') as [Season | FishSpecial, Kind];
  return (SEASON_FISH as Record<string, Record<Kind, string>>)[group]?.[kind] ?? (SPECIAL_FISH as Record<string, Record<Kind, string>>)[group]?.[kind] ?? FISH_SPECIES_NAMES[kind];
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
