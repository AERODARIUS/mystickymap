import React from 'react';
import { Logo } from './Logo';
import { useTranslation } from 'react-i18next';

export const SplashScreen = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#081e2b] p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-8">
        <div className="flex justify-center">
          <Logo variant="full" color="light" className="w-36 h-36" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{t('splash.heading')}</h2>
          <p className="text-[#a7f3d0] opacity-90 text-sm">{t('splash.description')}</p>
        </div>
        <div className="bg-[#0e2a38] p-6 rounded-3xl shadow-2xl border border-[#0d9488]/30 text-left space-y-4">
          <p className="font-bold text-white text-base">{t('splash.instructions_heading')}</p>
          <ol className="list-decimal list-inside space-y-2 text-stone-300 text-sm">
            <li>{t('splash.step1')} <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" className="text-[#00a88f] hover:underline font-bold">Google Cloud Console</a>.</li>
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

