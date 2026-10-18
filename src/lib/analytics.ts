/**
 * 사용 기록 — Vercel Web Analytics. 팀 사이트 배포본에서만 보낸다(데모·개발·테스트는 안 보냄).
 *
 * 가게 이름·아바타·uid 같은 사람·가게를 가리키는 값은 보내지 않는다. 게임 종류·메뉴 같은
 * 고정된 이름과 횟수만. 무슨 기능이 실제로 쓰이는지 보려는 것이다(10/17 사용자).
 * Pro 는 이벤트 1천 건당 $0.03 이라 속성은 2개까지만 쓴다(Pro 사용자 지정 이벤트 한도).
 */
import { inject, track as vaTrack } from '@vercel/analytics';

// 프로젝트 대시보드에서 Web Analytics 를 켠 뒤에만 VITE_ANALYTICS=1 로 빌드한다. 켜기 전에 넣으면
// /_vercel/insights/script.js 가 앱 화면(HTML)으로 와서 콘솔에 스크립트 오류가 남는다.
const ON =
  import.meta.env.PROD &&
  import.meta.env.VITE_ANALYTICS === '1' &&
  import.meta.env.VITE_DEMO !== '1' &&
  import.meta.env.MODE !== 'test';

export type AppEvent =
  | 'game_start'
  | 'respin'
  | 'decide'
  | 'share'
  | 'predict'
  | 'party_open'
  | 'party_join'
  | 'party_game'
  | 'party_guess'
  | 'cat_view'
  // 함께 고르기를 직접 펼침 — 접어 둔 뒤 실제로 덜 쓰이는지 본다(10/18).
  | 'together_open'
  // 가게 고치기 위치 검색. 검색어는 남기지 않고 결과 유무만.
  | 'place_search'
  // 별점 카드 보임 / 별점 남기기 누름 — placement(top·below)별로 비율을 본다.
  | 'rate_prompt_view'
  | 'rate_prompt_open';

export function initAnalytics(): void {
  if (!ON) return;
  try {
    inject({ mode: 'production' });
  } catch {
    // 막혀 있어도 앱은 그대로.
  }
}

export function track(event: AppEvent, props?: Record<string, string | number>): void {
  if (!ON) return;
  try {
    vaTrack(event, props);
  } catch {
    // 기록 실패는 조용히 넘긴다.
  }
}
