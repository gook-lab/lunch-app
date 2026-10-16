/**
 * 캐릭터 옷차림 — 날씨가 계절보다 앞선다(비 오면 우비, 눈 오면 털모자).
 * 게임은 루트에 `outfit--${outfitOf(a)}` 클래스를 붙이고, 캐릭터 SVG 의 덧옷(.acc-*)을 CSS 로 켠다.
 */
import type { Ambience } from '../../../lib/ambience';

export type Outfit = 'rain' | 'winter' | 'summer' | 'spring' | 'autumn';

export function outfitOf(a: Pick<Ambience, 'season' | 'weather'>): Outfit {
  if (a.weather === 'rain') return 'rain';
  if (a.weather === 'snow' || a.season === 'winter') return 'winter';
  return a.season;
}

/** 루트에 붙일 클래스 묶음. amb--계절 amb--w-날씨 outfit--옷 (금요일이면 amb--fri). */
export function ambienceClasses(a: Ambience): string {
  return [`amb--${a.season}`, `amb--w-${a.weather}`, `outfit--${outfitOf(a)}`, a.weekday === 5 ? 'amb--fri' : ''].filter(Boolean).join(' ');
}
