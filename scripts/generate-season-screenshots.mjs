#!/usr/bin/env node

/**
 * Playwright를 이용해 각 계절 테마의 스크린샷을 생성한다.
 * Usage: node scripts/generate-season-screenshots.mjs
 */

import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = '/private/tmp/claude-501/-Users-kyb-ontact-sonix-toy/29b507b8-a1c7-405b-a89a-f1ae3129e15d/scratchpad/seasons';
const VIEWPORT_DESKTOP = { width: 1440, height: 900 };
const VIEWPORT_MOBILE = { width: 390, height: 844 };

const THEMES = ['light', 'dark'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

async function generateScreenshots() {
  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch();

  try {
    for (const theme of THEMES) {
      for (const season of SEASONS) {
        // 데스크톱 스크린샷
        {
          const context = await browser.newContext({
            viewport: VIEWPORT_DESKTOP,
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
          });
          const page = await context.newPage();

          // 로컬스토리지에 테마와 계절 설정
          await page.goto('http://localhost:6198/');
          await page.evaluate(({ theme, season }) => {
            localStorage.setItem('lunch-app:theme', theme);
            localStorage.setItem('lunch-app:season', season);
          }, { theme, season });

          // 페이지 새로고침해서 설정 적용
          await page.goto('http://localhost:6198/');

          // "예시로 둘러보기" 클릭 (데모 샘플 로드)
          try {
            await page.click('button:has-text("예시로 둘러보기")');
          } catch {
            // 이미 로드되어 있을 수 있음
          }

          // 페이지 로드 완료 대기
          try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
          } catch {
            // 타임아웃해도 계속 진행
          }

          // "건너뛰기" 클릭해서 투어 닫기 (있으면)
          try {
            await page.click('button:has-text("건너뛰기")');
          } catch {
            // 투어가 없을 수 있음
          }

          // 조금 대기해서 렌더링 완료
          await page.waitForTimeout(500);

          const filename = `${season}-${theme}-1440.png`;
          const filepath = path.join(OUTPUT_DIR, filename);
          await page.screenshot({ path: filepath });
          console.log(`✓ ${filename}`);

          await context.close();
        }

        // 모바일 스크린샷
        {
          const context = await browser.newContext({
            viewport: VIEWPORT_MOBILE,
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
          });
          const page = await context.newPage();

          await page.goto('http://localhost:6198/');
          await page.evaluate(({ theme, season }) => {
            localStorage.setItem('lunch-app:theme', theme);
            localStorage.setItem('lunch-app:season', season);
          }, { theme, season });

          await page.goto('http://localhost:6198/');

          try {
            await page.click('button:has-text("예시로 둘러보기")');
          } catch {
            //
          }
          try {
            await page.waitForLoadState('networkidle', { timeout: 5000 });
          } catch {
            //
          }
          try {
            await page.click('button:has-text("건너뛰기")');
          } catch {
            //
          }
          await page.waitForTimeout(500);

          const filename = `${season}-${theme}-390.png`;
          const filepath = path.join(OUTPUT_DIR, filename);
          await page.screenshot({ path: filepath });
          console.log(`✓ ${filename}`);

          await context.close();
        }
      }
    }

    console.log(`\n✓ 스크린샷이 ${OUTPUT_DIR} 에 저장되었습니다`);
  } finally {
    await browser.close();
  }
}

generateScreenshots().catch((err) => {
  console.error('❌ 스크린샷 생성 실패:', err);
  process.exit(1);
});
