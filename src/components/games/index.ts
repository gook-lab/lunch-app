/**
 * 게임 열 가지 — 고른 것만 받는다(lazy.tsx). 돌림판은 첫 화면 기본값이라 바로 싣는다.
 */
import { lazyGame } from './lazy';

export { Wheel } from './Wheel';
export const Ladder = lazyGame(() => import('./Ladder').then((m) => m.Ladder));
export const Slot = lazyGame(() => import('./Slot').then((m) => m.Slot));
export const Pinball = lazyGame(() => import('./Pinball').then((m) => m.Pinball));
export const Cards = lazyGame(() => import('./Cards').then((m) => m.Cards));
export const Memory = lazyGame(() => import('./Memory').then((m) => m.Memory));
export const Tournament = lazyGame(() => import('./Tournament').then((m) => m.Tournament));
export const Gacha = lazyGame(() => import('./Gacha').then((m) => m.Gacha));
export const Plinko = lazyGame(() => import('./Plinko').then((m) => m.Plinko));
export const Dice = lazyGame(() => import('./Dice').then((m) => m.Dice));

/** 나머지 게임을 미리 받는다. 첫 화면을 그린 뒤 쉬는 시간에, 테스트는 시작 전에 부른다. */
export function preloadGames(): Promise<void> {
  return Promise.all(
    [Ladder, Slot, Pinball, Cards, Memory, Tournament, Gacha, Plinko, Dice].map((g) => g.preload()),
  ).then(() => undefined);
}
