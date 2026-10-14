import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [deferModulFont(), react()],
})
