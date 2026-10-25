import { logAnalyticsEvent } from '../firebase';

export interface ConsentPreferences {
  analytics: boolean;
  marketing: boolean;
  timestamp: number;
}

export const CONSENT_STORAGE_KEY = 'spotheon_consent_mode_v2';

export function getStoredConsent(): ConsentPreferences | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function updateGoogleConsent(preferences: { analytics: boolean; marketing: boolean }) {
  const payload: ConsentPreferences = {
    analytics: preferences.analytics,
    marketing: preferences.marketing,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Failed to save consent preference:', err);
  }

  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('consent', 'update', {
      analytics_storage: preferences.analytics ? 'granted' : 'denied',
      ad_storage: preferences.marketing ? 'granted' : 'denied',
      ad_user_data: preferences.marketing ? 'granted' : 'denied',
      ad_personalization: preferences.marketing ? 'granted' : 'denied'
    });
  }

  logAnalyticsEvent('consent_update', {
    analytics_storage: preferences.analytics ? 'granted' : 'denied',
    ad_storage: preferences.marketing ? 'granted' : 'denied',
    ad_user_data: preferences.marketing ? 'granted' : 'denied',
    ad_personalization: preferences.marketing ? 'granted' : 'denied'
  });
}
