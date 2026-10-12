import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@gook-lab/tokens/styles.css';
import './index.css';
import App from './App.tsx';
import { NotFound, isKnownPath } from './components/StatusScreen';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isKnownPath(window.location.pathname) ? <App /> : <NotFound />}
  </StrictMode>,
);
