/**
 * index.html 의 인라인 로딩 화면(#boot)을 걷는다.
 *
 * 로딩 화면은 JS 없이 HTML 만으로 뜨고, 앱이 첫 화면(목록 준비 · 불러오기 실패 · 없는 주소)을 그릴 때까지 덮어 둔다.
 * 그사이 앱 안의 "불러오는 중" 화면은 가려져 두 로딩 화면이 번갈아 깜빡이지 않는다.
 * 그린 다음 프레임에 걷어야 빈 바탕이 한 번 비치지 않는다.
 */
declare global {
  interface Window {
    __lunchBoot?: { done: () => void };
  }
}

export function hideBoot(): void {
  const boot = window.__lunchBoot;
  if (!boot) return;
  requestAnimationFrame(() => boot.done());
}
