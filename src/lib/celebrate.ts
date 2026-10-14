/**
 * 당첨 축하 — 짧은 효과음과 진동.
 *
 * 소리는 기본으로 끈다. 사무실에서 갑자기 울리면 곤란하다 — 켜 둔 사람만 듣는다
 * (localStorage). 진동은 소리를 켠 사람에게만, 지원하는 휴대폰에서만 준다.
 * 동작 줄이기 기기에선 둘 다 하지 않는다(꽃가루와 같은 기준).
 */

import { sfx } from './sfx';

const KEY = 'lunch-app:sound';

export function soundOn(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundOn(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // 사생활 보호 모드 등 — 이번 방문 동안만 켜진다.
  }
}

/** 도·미·솔·도 — 한 음 90ms, 다 합쳐 0.5초 남짓. 소리는 lib/sfx.ts 가 합성한다. */
export function playChime(): void {
  sfx('chime');
}

export function buzz(): void {
  try {
    navigator.vibrate?.([30, 40, 70]);
  } catch {
    // 지원하지 않는 기기.
  }
}
