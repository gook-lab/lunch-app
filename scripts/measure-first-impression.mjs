#!/usr/bin/env node
/**
 * 첫 화면 측정 — 프로덕션 빌드(vite preview)를 빈 캐시 Chromium 으로 열어 잰다.
 *
 *   node scripts/measure-first-impression.mjs --url http://localhost:5351/ --label after --out docs/art/first-impression/check/measure.json
 *
 * 조건 둘(제한 없음 · 느린 망 4 Mbps / 40 ms RTT, CDP) × 화면 둘(빈 데모 · 예시 가게를 깐 데모)을 3회씩 재고 중앙값을 남긴다.
 * - fcp: 첫 그림(paint 항목)
 * - usable: 첫 화면을 쓸 수 있는 시각. 빈 데모는 「회사 위치 정하기」, 예시 데모는 실행 단추가 눌릴 수 있게 그려진 때
 * - bootGone: 인라인 로딩 화면(#boot)이 걷힌 때(없으면 null)
 * - reqUsable · kbUsable: usable 까지 끝난 요청 수 · 전송량, reqAll · kbAll: 3초 더 기다린 뒤 합계
 *
 * Playwright 는 이 레포 의존성이 아니다. PLAYWRIGHT 환경변수나 기본 위치($HOME/sonix/toy/dokkaebi-quest)에서 읽는다.
 */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const URL_ = args.url ?? 'http://localhost:5351/';
const RUNS = Number(args.runs ?? 3);
const LABEL = args.label ?? 'run';
const OUT = args.out;

const pwDir = process.env.PLAYWRIGHT ?? join(homedir(), 'sonix/toy/dokkaebi-quest/node_modules/playwright');
const { chromium } = createRequire(import.meta.url)(pwDir);

const SLOW = { offline: false, latency: 40, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (4 * 1024 * 1024) / 8 };
const DEMO_KEY = 'lunch-app:demo-v4';

/** 페이지 안에서 시각을 적는다. MutationObserver 로 처음 보인 순간을 performance.now() 로 남긴다. */
const PROBE = () => {
  const marks = (window.__fi = { fcp: null, lcp: null, usable: null, bootGone: null });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') marks.fcp = e.startTime;
  }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => {
    const es = l.getEntries();
    marks.lcp = es[es.length - 1].startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  const check = () => {
    const now = performance.now();
    if (marks.usable === null) {
      const run = document.querySelector('.stage__run');
      const office = [...document.querySelectorAll('.status button')].find((b) => /회사 위치 정하기|지도에서 가게 넣기/.test(b.textContent));
      const el = (run && !run.disabled ? run : null) ?? office;
      if (el && el.getBoundingClientRect().height > 0) marks.usable = now;
    }
    if (marks.bootGone === null && document.readyState !== 'loading' && !document.getElementById('boot')) marks.bootGone = now;
  };
  new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
  document.addEventListener('DOMContentLoaded', check);
};

async function sampleState(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL_);
  await page.getByRole('button', { name: '예시로 둘러보기' }).click();
  await page.waitForFunction((k) => !!localStorage.getItem(k), DEMO_KEY);
  const s = await page.evaluate((k) => localStorage.getItem(k), DEMO_KEY);
  await ctx.close();
  return s;
}

async function once(browser, { slow, seed }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(
    ([k, s]) => {
      try {
        localStorage.setItem('lunch-app:tour-v1', 'done');
        if (s) localStorage.setItem(k, s);
      } catch {
        /* 저장 막힘 */
      }
    },
    [DEMO_KEY, seed],
  );
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (slow) await cdp.send('Network.emulateNetworkConditions', SLOW);
  const done = [];
  cdp.on('Network.loadingFinished', (e) => done.push({ t: Date.now(), bytes: e.encodedDataLength }));
  const t0 = Date.now();
  await page.goto(URL_, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__fi && window.__fi.usable !== null, null, { timeout: 60_000, polling: 50 });
  const usableWall = Date.now();
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => window.__fi);
  // 탐침의 usable 은 페이지 시계 기준, 요청 집계는 벽시계 기준이라 usable 을 확인한 벽시계 시각으로 자른다.
  const upto = done.filter((d) => d.t <= usableWall);
  await ctx.close();
  const r = (x) => (x === null ? null : Math.round(x));
  return {
    fcp: r(m.fcp),
    lcp: r(m.lcp),
    usable: r(m.usable),
    bootGone: r(m.bootGone),
    reqUsable: upto.length,
    kbUsable: Math.round(upto.reduce((a, d) => a + d.bytes, 0) / 1024),
    reqAll: done.length,
    kbAll: Math.round(done.reduce((a, d) => a + d.bytes, 0) / 1024),
    wallUsable: usableWall - t0,
  };
}

const median = (xs) => {
  const v = xs.filter((x) => x !== null).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : null;
};

const browser = await chromium.launch();
const seed = await sampleState(browser);
const result = { label: LABEL, url: URL_, viewport: '1440x900', runs: RUNS, slow: '4 Mbps / 40 ms RTT (CDP)', at: new Date().toISOString(), cases: {} };
for (const [name, opt] of Object.entries({
  'empty/fast': { slow: false, seed: null },
  'empty/slow': { slow: true, seed: null },
  'sample/fast': { slow: false, seed },
  'sample/slow': { slow: true, seed },
})) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(await once(browser, opt));
  const med = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, median(runs.map((x) => x[k]))]));
  result.cases[name] = { median: med, runs };
  console.log(name.padEnd(12), JSON.stringify(med));
}
await browser.close();
if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
}
