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
function preloadFirebase(): Plugin {
  let base = '/'
  return {
    name: 'preload-firebase',
    configResolved(config) {
      base = config.base
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
        return [...files].map((f) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', crossorigin: true, href: base + f },
          injectTo: 'head' as const,
        }))
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
