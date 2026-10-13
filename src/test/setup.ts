// 테스트 공통 준비. 첫 방문 안내는 화면 전체를 덮으므로 앱 테스트에서는 이미 본 것으로 둔다.
// 테스트가 localStorage 를 비우기도 하므로 매 테스트 전에 다시 넣는다.
// 안내 자체는 tour.test.tsx 가 이 값을 지우고 따로 본다.
import { beforeEach } from 'vitest';

beforeEach(() => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem('lunch-app:tour-v1', 'done');
  } catch {
    // node 환경 테스트에는 localStorage 가 없다.
  }
});
