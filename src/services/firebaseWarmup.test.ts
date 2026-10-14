// @vitest-environment node
/**
 * 팀용 index.html 이 Firebase 두 서버 연결을 HTML 단계에서 먼저 여는지 확인한다(vite.config.ts 의 WARM_FIREBASE).
 * 빠지면 첫 방문이 로그인 뒤 Firestore 연결 맺기(실측 약 0.4초)를 다시 기다린다. 실제 빌드를 돌려 결과 HTML 을 본다.
 */
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build, type Rollup } from 'vite';
import { WARM_FIREBASE } from '../../vite.config';

const root = fileURLToPath(new URL('../..', import.meta.url));
const saved = { demo: process.env.VITE_DEMO, emulator: process.env.VITE_FIREBASE_EMULATOR };

afterEach(() => {
  for (const [k, v] of [
    ['VITE_DEMO', saved.demo],
    ['VITE_FIREBASE_EMULATOR', saved.emulator],
  ] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** 환경 변수를 정해 빌드하고 index.html 을 돌려준다. process.env 의 VITE_ 값이 .env 파일보다 우선한다. */
async function builtHtml(env: { demo: string; emulator: string }): Promise<string> {
  process.env.VITE_DEMO = env.demo;
  process.env.VITE_FIREBASE_EMULATOR = env.emulator;
  const out = (await build({ root, configFile: `${root}/vite.config.ts`, logLevel: 'silent', build: { write: false } })) as Rollup.RollupOutput;
  const html = out.output.find((o) => o.fileName === 'index.html');
  if (!html || html.type !== 'asset') throw new Error('index.html 이 빌드 결과에 없다');
  return String(html.source);
}

describe('팀용 index.html — Firebase 연결 미리 열기', () => {
  it('팀용 빌드는 다른 태그보다 앞에서 두 서버로 요청을 보낸다', async () => {
    const html = await builtHtml({ demo: '', emulator: '' });
    const at = html.indexOf(WARM_FIREBASE);
    expect(at).toBeGreaterThan(-1);
    expect(WARM_FIREBASE).toContain('https://identitytoolkit.googleapis.com/');
    expect(WARM_FIREBASE).toContain('https://firestore.googleapis.com/');
    // 막는 스타일시트·모듈 스크립트보다 앞이어야 HTML 을 읽자마자 출발한다.
    expect(at).toBeLessThan(html.indexOf('rel="stylesheet"'));
    expect(at).toBeLessThan(html.indexOf('<script type="module"'));
  }, 60_000);

  it('데모 빌드와 에뮬레이터 빌드에는 넣지 않는다', async () => {
    expect(await builtHtml({ demo: '1', emulator: '' })).not.toContain(WARM_FIREBASE);
    expect(await builtHtml({ demo: '', emulator: '1' })).not.toContain(WARM_FIREBASE);
  }, 60_000);
});
