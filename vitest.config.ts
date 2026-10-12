import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// 에이전트 작업 공간(.claude/worktrees)에 저장소 사본이 생기면 vitest 가 그 테스트까지
// 집어 두 배로 돌고, 부하로 시드 탐색 테스트가 시간 초과했다(10/13). 사본은 뺀다.
// vite.config.ts 를 건드리면 돌고 있는 개발 서버가 다시 뜨므로 따로 둔다.
export default mergeConfig(
  viteConfig,
  defineConfig({ test: { exclude: [...configDefaults.exclude, '.claude/**'] } }),
);
