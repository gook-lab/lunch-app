import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type Rollup } from 'vite'

/**
 * MODUL styles.css 맨 위의 Archivo 글꼴 @import 를 뺀다. CSS 를 받은 뒤에야 글꼴 CSS 를
 * 또 받으러 가서 첫 그리기를 0.86초 막았다(Lighthouse 10/14). 같은 글꼴은 index.html 이
 * 렌더링을 막지 않는 방식(media=print → all)으로 받는다.
 */
function deferModulFont(): Plugin {
  return {
    name: 'defer-modul-font',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('@gook-lab/tokens/styles.css')) return null
      return code.replace(/@import url\('https:\/\/fonts\.googleapis\.com[^)]*'\);?/, '')
    },
  }
}

/**
 * 팀용 빌드에서 Firebase 청크를 index.html 에 modulepreload 로 건다. lunch.ts 의 동적 import 는
 * index.js 를 다 받고 실행한 뒤에야 시작돼, Slow 4G 에서 firebase 청크(154KB gz)가 한 단계
 * 늦게 출발했다(10/15). 미리 받아 두면 index.js 와 나란히 받는다. 데모 빌드엔 이 청크가 없어 아무것도 안 붙는다.
 *
 * 대가가 있다. 같은 대역폭을 나눠 index.js 가 늦게 끝나 FCP 는 1.20→1.66초로 늦고, 대신 LCP 는
 * 2.97→2.31초, firebase 청크 끝은 2.49→1.83초로 당겨졌다(Slow 4G·CPU 4배, 10/15). 팀용 첫 화면은
 * 데이터가 와야 쓸 수 있어 LCP 를 택했다. fetchpriority=low 는 이 측정에서 차이가 없었다.
 */
/**
 * 첫 방문은 익명 로그인(signUp → lookup) → Firestore 첫 읽기가 한 줄로 이어지고, 두 서버에 처음
 * 붙는 데(DNS·TCP·TLS) 각각 0.4초쯤 든다(로컬 팀용 빌드+실서버·Chromium: identitytoolkit 402ms,
 * firestore 393ms · 10/15). Firestore 연결은 로그인이 끝난 뒤에야 시작돼 그 0.4초가 그대로 기다림에 더해졌다.
 *
 * 그래서 HTML 을 읽자마자 두 서버로 빈 요청을 하나씩 보내 연결을 먼저 열어 둔다. 응답(404)은 쓰지 않는다.
 * <link rel="preconnect"> 가 정석이지만 Playwright Chromium 에선 연결을 열지 않아 효과를 확인할 수 없었고,
 * 이 방식은 같은 측정에서 Firestore 첫 왕복을 390ms → 23ms 로 줄였다.
 *
 * 브라우저는 쿠키를 싣는 요청과 안 싣는 요청의 연결을 따로 쓴다. 로그인 SDK 의 fetch 는 쿠키 없이,
 * Firestore 의 WebChannel XHR 은 withCredentials 로 보내므로 credentials 를 각각 맞춘다 —
 * Firestore 쪽을 쿠키 없이 데웠을 때는 Listen 이 연결을 새로 맺었다(같은 측정).
 */
export const WARM_FIREBASE =
  "[['https://identitytoolkit.googleapis.com/','omit'],['https://firestore.googleapis.com/','include']]" +
  ".forEach(function(w){fetch(w[0],{mode:'no-cors',credentials:w[1]}).catch(function(){})})"

function preloadFirebase(): Plugin {
  let base = '/'
  let emulator = false
  return {
    name: 'preload-firebase',
    configResolved(config) {
      base = config.base
      emulator = config.env.VITE_FIREBASE_EMULATOR === '1'
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (!ctx.bundle) return
        const chunks = Object.values(ctx.bundle).filter((c): c is Rollup.OutputChunk => c.type === 'chunk')
        const entry = chunks.find((c) => c.facadeModuleId?.endsWith('/services/lunch.firebase.ts'))
        if (!entry) return
        // 그 청크가 정적으로 끌어오는 청크까지(firebase SDK 묶음). index 가 이미 받는 것은 뺀다.
        const files = new Set<string>()
        const walk = (c: Rollup.OutputChunk) => {
          if (files.has(c.fileName) || c.isEntry) return
          files.add(c.fileName)
          for (const f of c.imports) {
            const next = chunks.find((x) => x.fileName === f)
            if (next) walk(next)
          }
        }
        walk(entry)
        const preloads = [...files].map((f) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: base + f },
          injectTo: 'head' as const,
        }))
        // 에뮬레이터 빌드는 Google 서버에 붙지 않으니 미리 열 연결도 없다.
        if (emulator) return preloads
        // 맨 앞에 둔다. 막는 스타일시트(index.css) 뒤의 인라인 스크립트는 그 CSS 를 다 받을 때까지 기다린다.
        return [{ tag: 'script', children: WARM_FIREBASE, injectTo: 'head-prepend' as const }, ...preloads]
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [deferModulFont(), preloadFirebase(), react()],
  build: {
    // firebase 청크(526KB, gzip 154KB)만 500KB 를 넘는다. onSnapshot 을 써서 firestore/lite 로 못 줄이고,
    // 첫 화면은 이 청크를 기다리지 않는다(위 modulepreload 로 나란히 받음). 알고 둔 크기라 기준을 600 으로 둔다.
    chunkSizeWarningLimit: 600,
  },
})
