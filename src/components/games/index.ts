/**
 * 게임 스물한 가지 — 고른 것만 받는다(lazy.tsx). 활쏘기는 첫 화면 기본값이라 바로 싣는다(10/15, 전엔 돌림판).
 */
import { lazyGame } from './lazy';
import { preloadDeferred } from '../deferred';

export { Archery } from './Archery';
export const Wheel = lazyGame(() => import('./Wheel').then((m) => m.Wheel));
export const Ladder = lazyGame(() => import('./Ladder').then((m) => m.Ladder));
export const Slot = lazyGame(() => import('./Slot').then((m) => m.Slot));
export const Pinball = lazyGame(() => import('./Pinball').then((m) => m.Pinball));
export const Cards = lazyGame(() => import('./Cards').then((m) => m.Cards));
export const Memory = lazyGame(() => import('./Memory').then((m) => m.Memory));
export const Tournament = lazyGame(() => import('./Tournament').then((m) => m.Tournament));
export const Gacha = lazyGame(() => import('./Gacha').then((m) => m.Gacha));
export const Plinko = lazyGame(() => import('./Plinko').then((m) => m.Plinko));
export const Dice = lazyGame(() => import('./Dice').then((m) => m.Dice));
export const HorseRace = lazyGame(() => import('./PixelRace').then((m) => m.HorseRace));
export const CarRace = lazyGame(() => import('./PixelRace').then((m) => m.CarRace));
export const Bomb = lazyGame(() => import('./Bomb').then((m) => m.Bomb));
export const Balloon = lazyGame(() => import('./Balloon').then((m) => m.Balloon));
export const Fishing = lazyGame(() => import('./Fishing').then((m) => m.Fishing));
export const Curling = lazyGame(() => import('./Curling').then((m) => m.Curling));
export const PaperPlane = lazyGame(() => import('./PaperPlane').then((m) => m.PaperPlane));
export const Treasure = lazyGame(() => import('./Treasure').then((m) => m.Treasure));
export const Claw = lazyGame(() => import('./Claw').then((m) => m.Claw));
export const Penalty = lazyGame(() => import('./Penalty').then((m) => m.Penalty));
export const Bowling = lazyGame(() => import('./Bowling').then((m) => m.Bowling));

/** 나머지 게임을 미리 받는다. 첫 화면을 그린 뒤 쉬는 시간에, 테스트는 시작 전에 부른다. */
export function preloadGames(): Promise<void> {
  return Promise.all(
    [Wheel, Ladder, Slot, Pinball, Cards, Memory, Tournament, Gacha, Plinko, Dice, HorseRace, CarRace, Bomb, Balloon, Fishing, Curling, PaperPlane, Treasure, Claw, Penalty, Bowling]
      .map((g) => g.preload())
      // 설정·목록도 같은 쉬는 시간에 받는다(components/deferred.tsx).
      .concat(preloadDeferred()),
  ).then(() => undefined);
}
