import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@gook-lab/tokens/styles.css';
import './index.css';
import App from './App.tsx';
import { NotFound, isKnownPath } from './components/StatusScreen';
import { initTheme } from './lib/theme';

// 첫 그리기 전에 테마를 정해야 밝은 화면이 한 번 번쩍이지 않는다.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isKnownPath(window.location.pathname) ? <App /> : <NotFound />}
  </StrictMode>,
);
