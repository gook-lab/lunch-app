/**
 * 첫 화면에 안 쓰는 조각 — 나중에 받는다(게임과 같은 lazyGame).
 * 설정 팝오버와 목록 탭의 ⋯ 메뉴가 radix 팝오버·메뉴와 floating-ui 를 끌고 와서
 * 첫 화면 JS 가 374KB 에서 400KB 로 늘었다(10/14). 둘 다 누르기 전엔 필요 없다.
 */
import { lazyGame } from './games/lazy';

export const Settings = lazyGame(
  () => import('./Settings').then((m) => m.Settings),
  // 받는 동안에도 자리를 지킨다. 머리말이 들썩이지 않게 같은 모양의 단추를 둔다.
  () => (
    <button type="button" className="linkish app__tool" disabled>
      설정
    </button>
  ),
);

export const PlaceList = lazyGame(() => import('./PlaceList').then((m) => m.PlaceList));

export function preloadDeferred(): Promise<void> {
  return Promise.all([Settings.preload(), PlaceList.preload()]).then(() => undefined);
}
