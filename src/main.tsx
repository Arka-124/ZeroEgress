import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// Register offline Service Worker caching
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Signal cinematic preloader that React bundle has mounted and rendered
if (typeof window !== 'undefined') {
  window.dispatchEvent(new Event('zeroegress:app-ready'));
}
