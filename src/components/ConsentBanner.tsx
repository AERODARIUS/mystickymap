import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Cookie, Settings2, Check, X, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getStoredConsent, updateGoogleConsent } from '../lib/consent';

interface ConsentBannerProps {
  isOpenManually?: boolean;
  onCloseManual?: () => void;
}

export const ConsentBanner: React.FC<ConsentBannerProps> = ({
  isOpenManually = false,
  onCloseManual
}) => {
  const { t } = useTranslation();
  const [hasDecided, setHasDecided] = useState<boolean>(() => {
    return getStoredConsent() !== null;
  });
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  // Customization state initialized from stored consent or true by default
  const [analyticsConsent, setAnalyticsConsent] = useState(() => {
    return getStoredConsent()?.analytics ?? true;
  });
  const [marketingConsent, setMarketingConsent] = useState(() => {
    return getStoredConsent()?.marketing ?? true;
  });

  const isModalOpen = isCustomizeOpen || isOpenManually;

  const handleOpenCustomize = () => {
    const current = getStoredConsent();
    if (current) {
      setAnalyticsConsent(current.analytics);
      setMarketingConsent(current.marketing);
    }
    setIsCustomizeOpen(true);
  };

  const handleCloseModal = () => {
    setIsCustomizeOpen(false);
    if (isOpenManually && onCloseManual) {
      onCloseManual();
    }
  };

  const handleAcceptAll = () => {
    updateGoogleConsent({ analytics: true, marketing: true });
    setAnalyticsConsent(true);
    setMarketingConsent(true);
    setHasDecided(true);
    handleCloseModal();
  };

  const handleDeclineAll = () => {
    updateGoogleConsent({ analytics: false, marketing: false });
    setAnalyticsConsent(false);
    setMarketingConsent(false);
    setHasDecided(true);
    handleCloseModal();
  };

  const handleSaveCustom = () => {
    updateGoogleConsent({
      analytics: analyticsConsent,
      marketing: marketingConsent
    });
    setHasDecided(true);
    handleCloseModal();
  };

  const isVisible = (!hasDecided && !isOpenManually) || isOpenManually;

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] pointer-events-none flex flex-col justify-end p-4 sm:p-6">
        {/* Backdrop for customize modal */}
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCloseModal}
            className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm pointer-events-auto"
          />
        )}

        {/* Modal: Customize Preferences */}
        {isModalOpen ? (
          <motion.div
            initial={{ y: 50, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 50, opacity: 0, scale: 0.96 }}
            className="relative pointer-events-auto w-full max-w-lg mx-auto bg-white rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0d9488] flex items-center justify-center border border-teal-100">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-lg leading-tight">
                    {t('consent.preferences_title', 'Cookie & Consent Preferences')}
                  </h3>
                  <p className="text-xs text-stone-500 font-medium">Google Consent Mode v2</p>
                </div>
              </div>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-stone-200/60 rounded-full transition-colors text-stone-400 hover:text-stone-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content / Categories */}
            <div className="p-6 overflow-y-auto space-y-4">
              {/* Category 1: Strictly Necessary */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-start gap-4">
                <div className="p-2 bg-stone-200/70 rounded-xl text-stone-600 shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-stone-900">
                      {t('consent.necessary_title', 'Strictly Necessary')}
                    </p>
                    <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-stone-200 text-stone-700">
                      {t('consent.always_active', 'Always Active')}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {t(
                      'consent.necessary_desc',
                      'Essential for core functionality such as user authentication, session security, and basic map controls. Cannot be disabled.'
                    )}
                  </p>
                </div>
              </div>

              {/* Category 2: Analytics & Measurement */}
              <div className="p-4 rounded-2xl bg-teal-50/40 border border-teal-100 flex items-start gap-4">
                <div className="p-2 bg-teal-100 text-[#0d9488] rounded-xl shrink-0 mt-0.5">
                  <Cookie className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-stone-900">
                      {t('consent.analytics_title', 'Analytics & Measurement (Google Analytics)')}
                    </p>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={analyticsConsent}
                        onChange={(e) => setAnalyticsConsent(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0d9488]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {t(
                      'consent.analytics_desc',
                      'Allows Google Analytics (analytics_storage) to measure visits, view navigation, and feature interactions to improve Spotheon.'
                    )}
                  </p>
                </div>
              </div>

              {/* Category 3: Modeling & Ad Signals */}
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 flex items-start gap-4">
                <div className="p-2 bg-stone-200/70 text-stone-600 rounded-xl shrink-0 mt-0.5">
                  <Settings2 className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-bold text-sm text-stone-900">
                      {t('consent.marketing_title', 'Personalization & Consent Signals')}
                    </p>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marketingConsent}
                        onChange={(e) => setMarketingConsent(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0d9488]"></div>
                    </label>
                  </div>
                  <p className="text-xs text-stone-500 leading-relaxed">
                    {t(
                      'consent.marketing_desc',
                      'Allows Google Consent Mode signals (ad_storage, ad_user_data, ad_personalization) for conversion modeling and personalized experience.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-6 pt-4 border-t border-stone-100 bg-stone-50/50 flex flex-col sm:flex-row items-center gap-3">
              <button
                type="button"
                onClick={handleDeclineAll}
                className="w-full sm:w-auto px-4 py-3 bg-white hover:bg-stone-100 text-stone-700 font-bold rounded-2xl text-xs border border-stone-200 transition-colors"
              >
                {t('consent.reject_all', 'Decline Non-Essential')}
              </button>
              <button
                type="button"
                onClick={handleSaveCustom}
                className="w-full sm:flex-1 px-4 py-3 bg-stone-900 hover:bg-stone-800 text-white font-bold rounded-2xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-stone-900/10"
              >
                <Check className="w-4 h-4" />
                {t('consent.save_preferences', 'Save Preferences')}
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="w-full sm:w-auto px-4 py-3 bg-[#0d9488] hover:bg-[#0f766e] text-white font-bold rounded-2xl text-xs transition-colors shadow-md shadow-teal-900/10"
              >
                {t('consent.accept_all', 'Accept All')}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Standard Bottom Banner */
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="pointer-events-auto w-full max-w-xl mx-auto bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl border border-stone-200/90 p-5 sm:p-6"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-teal-50 text-[#0d9488] flex items-center justify-center shrink-0 border border-teal-100">
                <Cookie className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-stone-900 text-base leading-tight mb-1 flex items-center gap-2">
                  {t('consent.banner_title', 'Privacy & Cookie Consent')}
                </h4>
                <p className="text-xs text-stone-600 leading-relaxed">
                  {t(
                    'consent.banner_desc',
                    'We use Google Analytics and cookies to measure interactions and improve your experience in accordance with Google Consent Mode.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleOpenCustomize}
                className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {t('consent.customize', 'Customize')}
              </button>
              <button
                type="button"
                onClick={handleDeclineAll}
                className="px-4 py-2.5 bg-white hover:bg-stone-100 text-stone-700 font-bold rounded-xl text-xs border border-stone-200 transition-colors"
              >
                {t('consent.reject_all', 'Decline Non-Essential')}
              </button>
              <button
                type="button"
                onClick={handleAcceptAll}
                className="px-5 py-2.5 bg-[#081e2b] text-[#00a88f] hover:text-white hover:bg-[#06151f] font-bold rounded-xl text-xs transition-colors shadow-lg border border-[#0d9488]/30 flex items-center justify-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {t('consent.accept_all', 'Accept All')}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </AnimatePresence>
  );
};
