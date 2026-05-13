import React from 'react';
import { Logo } from './Logo';
import { useTranslation } from 'react-i18next';

export const SplashScreen = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950 p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <Logo variant="full" color="light" className="w-32 h-32" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white tracking-tight">{t('splash.heading')}</h2>
          <p className="text-slate-400">{t('splash.description')}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-2xl shadow-2xl border border-slate-800 text-left space-y-4">
          <p className="font-semibold text-slate-200">{t('splash.instructions_heading')}</p>
          <ol className="list-decimal list-inside space-y-2 text-slate-400 text-sm">
            <li>{t('splash.step1')} <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">Google Cloud Console</a>.</li>
            <li>{t('splash.step2')}</li>
            <li>{t('splash.step3')}</li>
            <li>{t('splash.step4')}</li>
            <li>{t('splash.step5')}</li>
          </ol>
        </div>
        <p className="text-xs text-stone-400 italic">{t('splash.footer')}</p>
      </div>
    </div>
  );
};
