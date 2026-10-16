import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@gook-lab/tokens/styles.css';
import './index.css';
import App from './App.tsx';
import { NotFound, isKnownPath } from './components/StatusScreen';
import { initTheme } from './lib/theme';
import { initSeason } from './lib/season';
import { SeasonSky } from './components/SeasonSky';
import './season.css';
import './a11y.css';

// 첫 그리기 전에 테마와 계절을 정해야 밝은 화면이 한 번 번쩍이지 않는다.
initTheme();
initSeason();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SeasonSky />
    {isKnownPath(window.location.pathname) ? <App /> : <NotFound />}
  </StrictMode>,
);
