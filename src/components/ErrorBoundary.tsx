import React, { useState, useEffect } from 'react';
import { logger } from '../services/logger';

export const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [errorInfo, setErrorInfo] = useState<string | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setErrorInfo(event.message);
      
      logger.critical('Uncaught window error in ErrorBoundary', event.error || event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      });
    };
    
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  const [isClearing, setIsClearing] = useState(false);

  const handleClearCacheAndReload = async () => {
    setIsClearing(true);
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
      sessionStorage.clear();
    } catch (e) {
      console.error('Failed to clear caches:', e);
    } finally {
      window.location.reload();
    }
  };

  if (hasError) {
    const isMapsAuth = errorInfo?.includes('AuthFailure') || errorInfo?.includes('APIProvider.apiKey');

    if (isMapsAuth) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-stone-900 p-6">
          <div className="max-w-md w-full bg-stone-800 text-stone-100 p-8 rounded-2xl shadow-2xl border border-stone-700">
            <div className="w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4 text-2xl">
              🗺️
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Google Maps Auth Issue</h2>
            <p className="text-stone-300 text-sm mb-4 leading-relaxed">
              If the map works in incognito mode but fails in regular mode, this is typically caused by a stale Service Worker cache or a browser extension (such as an ad-blocker) blocking Google Maps requests.
            </p>

            <div className="bg-stone-900/80 p-3.5 rounded-xl border border-stone-700/60 mb-5 text-xs text-stone-300 space-y-2">
              <p className="font-semibold text-amber-300">Quick Fixes:</p>
              <ul className="list-disc list-inside space-y-1 text-stone-400">
                <li>Click <strong className="text-white">Clear Cache & Reload</strong> below to flush outdated PWA caches.</li>
                <li>Pause any ad-blocker or privacy extension for <code className="bg-stone-800 px-1 py-0.5 rounded text-amber-200">spotheon.app</code>.</li>
                <li>Verify your Google Cloud API key allows <code className="bg-stone-800 px-1 py-0.5 rounded text-amber-200">https://spotheon.app/*</code> in HTTP referrers.</li>
              </ul>
            </div>

            {errorInfo && (
              <pre className="bg-black/40 p-3 rounded-lg text-[11px] text-stone-400 overflow-auto max-h-24 mb-5 border border-stone-800">
                {errorInfo}
              </pre>
            )}

            <div className="space-y-2.5">
              <button 
                onClick={handleClearCacheAndReload}
                disabled={isClearing}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isClearing ? 'Clearing cache...' : 'Clear Cache & Reload'}
              </button>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-2.5 bg-stone-700 hover:bg-stone-600 text-stone-200 rounded-xl font-medium text-sm transition-colors cursor-pointer"
              >
                Normal Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center min-h-screen bg-red-50 p-6">
        <div className="max-w-md bg-white p-8 rounded-2xl shadow-lg border border-red-100">
          <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
          <p className="text-stone-600 mb-4">An error occurred in the application. Please try refreshing.</p>
          {errorInfo && (
            <pre className="bg-stone-100 p-4 rounded-lg text-xs overflow-auto max-h-40">
              {errorInfo}
            </pre>
          )}
          <button 
            onClick={() => window.location.reload()}
            className="mt-6 w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
          >
            Reload App
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
