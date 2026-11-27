#!/usr/bin/env node
/**
 * 첫인상 확인 촬영 — 첫 화면 세 크기 · 로딩(보통 · 느린 망 · 실패 · JS 꺼짐) · 404 두 크기.
 *
 *   node scripts/capture-first-impression.mjs --url http://localhost:5351/ --out docs/art/first-impression/check
 *
 * 그림은 1280px 이하로 줄여 남긴다(macOS sips). 화면마다 가로 넘침(scrollWidth > clientWidth)을 함께 적는다.
 * Playwright 는 이 레포 의존성이 아니다. PLAYWRIGHT 환경변수나 기본 위치($HOME/sonix/toy/dokkaebi-quest)에서 읽는다.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const BASE = (args.url ?? 'http://localhost:5351/').replace(/\/$/, '');
const OUT = args.out ?? 'docs/art/first-impression/check';
const ONLY = args.only ? new RegExp(args.only) : null;
mkdirSync(OUT, { recursive: true });

const pwDir = process.env.PLAYWRIGHT ?? join(homedir(), 'sonix/toy/dokkaebi-quest/node_modules/playwright');
const { chromium } = createRequire(import.meta.url)(pwDir);
const DEMO_KEY = 'lunch-app:demo-v4';
const SIZES = [
  [1440, 900],
  [844, 390],
  [390, 844],
];
const report = {};

const shrink = (file) => execFileSync('sips', ['-Z', '1280', file], { stdio: 'ignore' });

async function shot(browser, name, { size, path = '/', seed = null, tour = false, js = true, colorScheme = 'light', prep, wait }) {
  if (ONLY && !ONLY.test(name)) return;
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] }, javaScriptEnabled: js, colorScheme });
  await ctx.addInitScript(
    ([k, s, t]) => {
      try {
        if (!t) localStorage.setItem('lunch-app:tour-v1', 'done');
        if (s) localStorage.setItem(k, s);
      } catch {
        /* 저장 막힘 */
      }
    },
    [DEMO_KEY, seed, tour],
  );
  const page = await ctx.newPage();
  if (prep) await prep(page);
  // 진입 스크립트를 붙잡은 촬영은 load 를 기다리면 붙잡은 만큼 늦어진다. 응답 시작만 보고 시간을 잰다.
  await page.goto(BASE + path, { waitUntil: prep ? 'commit' : js ? 'load' : 'domcontentloaded' }).catch(() => {});
  if (wait) await wait(page);
  else await page.waitForTimeout(1200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const file = join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  shrink(file);
  report[name] = { size: size.join('x'), overflowX: overflow };
  console.log(name.padEnd(28), 'overflowX', overflow);
  await ctx.close();
}

const browser = await chromium.launch();
// 예시 가게를 깐 상태를 한 번 만들어 둔다.
const seed = await (async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/');
  await page.getByRole('button', { name: '예시로 둘러보기' }).click();
  await page.waitForFunction((k) => !!localStorage.getItem(k), DEMO_KEY);
  const s = await page.evaluate((k) => localStorage.getItem(k), DEMO_KEY);
  await ctx.close();
  return s;
})();

for (const size of SIZES) {
  const tag = size.join('x');
  await shot(browser, `first-empty-${tag}`, { size });
  await shot(browser, `first-sample-${tag}`, { size, seed });
}
await shot(browser, 'first-tour-390x844', { size: [390, 844], tour: true });
await shot(browser, 'first-empty-dark-390x844', { size: [390, 844], colorScheme: 'dark' });

// 로딩 — 진입 스크립트를 붙잡아 인라인 화면만 보이게 한다.
const hold = (ms) => async (page) => {
  await page.route(/\/assets\/index-[^/]+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
};
await shot(browser, 'loading-1440x900', { size: [1440, 900], prep: hold(60_000), wait: (p) => p.waitForTimeout(800) });
await shot(browser, 'loading-390x844', { size: [390, 844], prep: hold(60_000), wait: (p) => p.waitForTimeout(800) });
await shot(browser, 'loading-dark-390x844', { size: [390, 844], colorScheme: 'dark', prep: hold(60_000), wait: (p) => p.waitForTimeout(800) });
await shot(browser, 'loading-slow-390x844', { size: [390, 844], prep: hold(60_000), wait: (p) => p.waitForTimeout(15_800) });
await shot(browser, 'loading-fail-390x844', {
  size: [390, 844],
  prep: (page) => page.route(/\/assets\/index-[^/]+\.js$/, (route) => route.abort()),
  wait: (p) => p.waitForTimeout(800),
});
await shot(browser, 'loading-nojs-390x844', { size: [390, 844], js: false, wait: (p) => p.waitForTimeout(300) });

// 404 — 앱 안 화면(재작성 경로)과 정적 404.html.
await shot(browser, '404-1440x900', { size: [1440, 900], path: '/menu/today' });
await shot(browser, '404-390x844', { size: [390, 844], path: '/menu/today' });
await shot(browser, '404-dark-390x844', { size: [390, 844], path: '/menu/today', colorScheme: 'dark' });
await shot(browser, '404-static-1440x900', { size: [1440, 900], path: '/404.html', js: false, wait: (p) => p.waitForTimeout(300) });
await shot(browser, '404-static-390x844', { size: [390, 844], path: '/404.html', js: false, wait: (p) => p.waitForTimeout(300) });

await browser.close();
writeFileSync(join(OUT, 'overflow.json'), JSON.stringify(report, null, 2) + '\n');
