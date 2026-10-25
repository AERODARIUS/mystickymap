import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './i18n';
import { registerSW } from 'virtual:pwa-register';
import { logger } from './services/logger';
import { ErrorBoundary } from './components/ErrorBoundary';

// Clean up any stale or poisoned Google Maps caches created by previous Service Worker configurations
if (typeof window !== 'undefined' && 'caches' in window) {
  caches.keys().then((keys) => {
    for (const key of keys) {
      if (key.includes('google-maps') || key.includes('maps-api')) {
        caches.delete(key).catch(() => {});
      }
    }
  }).catch(() => {});
}

// Register service worker
registerSW({ immediate: true });

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled Promise Rejection', event.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
