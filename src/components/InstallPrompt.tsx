import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Logo } from './Logo';

export const InstallPrompt: React.FC = () => {
  const { isInstallable, handleInstallClick } = useInstallPrompt();
  const [isVisible, setIsVisible] = React.useState(true);

  if (!isInstallable || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <Logo variant="icon" className="w-12 h-12" />
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">Install Spotheon</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">The full AR & offline experience</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleInstallClick}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-medium text-sm transition-colors cursor-pointer"
          >
            Install
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
