import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { isDevice } from './lib/api.ts';
import { AppProvider } from './context/AppContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// Service worker: mantém o app abrindo offline (os dados vêm do cache local). No Android os arquivos já vêm no APK.
if ('serviceWorker' in navigator && import.meta.env.PROD && !isDevice) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
