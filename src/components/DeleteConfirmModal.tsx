import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  title?: string;
  message?: string;
}

export const DeleteConfirmModal = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  title,
  message
}: DeleteConfirmModalProps) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden"
          >
            <div className="relative p-8 text-center">
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8" />
              </div>

              <h3 className="text-xl font-black text-stone-900 mb-2">
                {title || t('anchor.delete_note')}
              </h3>
              
              <p className="text-stone-500 text-sm leading-relaxed mb-8">
                {message || t('anchor.delete_confirm')}
              </p>

              <div className="flex flex-col gap-3">
                <button
                  onClick={onConfirm}
                  disabled={isLoading}
                  className="w-full py-4 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold rounded-2xl transition-all shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-5 h-5" />
                      {t('anchor.delete_note')}
                    </>
                  )}
                </button>
                
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className="w-full py-4 bg-stone-100 hover:bg-stone-200 disabled:opacity-50 text-stone-600 font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
