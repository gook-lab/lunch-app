import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// 에이전트 작업 공간(.claude/worktrees)에 저장소 사본이 생기면 vitest 가 그 테스트까지
// 집어 두 배로 돌고, 부하로 시드 탐색 테스트가 시간 초과했다(10/13). 사본은 뺀다.
// vite.config.ts 를 건드리면 돌고 있는 개발 서버가 다시 뜨므로 따로 둔다.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, '.claude/**'],
      setupFiles: ['src/test/setup.ts'],
      // 도보 시간은 사무실 좌표가 있어야 계산된다. 좌표는 개발자 .env.local 에만 있어서, 없는 CI 에서는
      // 테스트가 대부분 떨어졌다. 데모와 같은 값을 넣어 어느 기기에서든 같은 결과를 낸다.
      env: { VITE_OFFICE_LAT: '37.5663', VITE_OFFICE_LNG: '126.9779' },
      // 게임 21종 테스트가 각본을 시드 여러 개 × 2~20곳으로 끝까지 돌린다. 기계가 바쁘면 기본 5초를 넘겨
      // 매번 다른 테스트가 시간 초과로 떨어졌다(10/15). 실패는 단언으로 잡고 시간은 넉넉히 둔다.
      testTimeout: 20_000,
    },
  }),
);
