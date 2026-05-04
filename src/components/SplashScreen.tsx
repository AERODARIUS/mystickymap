import React from 'react';
import { MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const SplashScreen = () => {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-50 p-6 font-sans">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="p-4 bg-emerald-100 rounded-full">
            <MapPin className="w-12 h-12 text-emerald-600" />
          </div>
        </div>
        <h2 className="text-3xl font-bold text-stone-900 tracking-tight">{t('splash.heading')}</h2>
        <p className="text-stone-600">{t('splash.description')}</p>
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 text-left space-y-4">
          <p className="font-semibold text-stone-800">{t('splash.instructions_heading')}</p>
          <ol className="list-decimal list-inside space-y-2 text-stone-600 text-sm">
            <li>{t('splash.step1')} <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener" className="text-emerald-600 hover:underline">Google Cloud Console</a>.</li>
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
