import { useState, useEffect } from 'react';
import { logAnalyticsEvent } from '../firebase';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      // Prevent standard Chrome install banner
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      logAnalyticsEvent('install_prompt_shown');
    };

    const installHandler = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      logAnalyticsEvent('app_installed');
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installHandler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    await deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      logAnalyticsEvent('pwa_install_accepted');
      console.log('User accepted the install prompt');
    } else {
      logAnalyticsEvent('pwa_install_dismissed');
      console.log('User dismissed the install prompt');
    }

    // We used the prompt, so clear it
    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return { isInstallable, handleInstallClick };
}
