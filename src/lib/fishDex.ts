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
