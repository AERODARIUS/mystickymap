import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { User } from 'firebase/auth';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  user: User | null;
}

const REPORT_REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'scam', label: 'Scam or fraud' },
  { id: 'nsfw', label: 'NSFW / sexual content' },
  { id: 'hate', label: 'Hate or extremist content' },
  { id: 'threats', label: 'Threats or violence' },
  { id: 'doxxing', label: 'Doxxing / private information' },
  { id: 'misleading', label: 'Misleading or dangerous information' },
  { id: 'other', label: 'Other' },
];

const getSessionId = () => {
  let sessionId = localStorage.getItem('spotheon_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('spotheon_session_id', sessionId);
  }
  return sessionId;
};

export const ReportModal = ({ isOpen, onClose, noteId, user }: ReportModalProps) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'reports'), {
        noteId,
        reason,
        description,
        reporterId: user?.uid || null,
        reporterSessionId: getSessionId(),
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
        // Reset after animations
        setTimeout(() => {
          setIsSuccess(false);
          setReason('');
          setDescription('');
        }, 500);
      }, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'reports');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3 text-rose-600">
                  <ShieldAlert className="w-6 h-6" />
                  <h2 className="text-xl font-bold text-stone-900">Report note</h2>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-stone-100 rounded-full transition-colors text-stone-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isSuccess ? (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4"
                  >
                    <CheckCircle2 className="w-10 h-10" />
                  </motion.div>
                  <h3 className="text-lg font-bold text-stone-900 mb-2">Thanks. We’ll review this note.</h3>
                  <p className="text-stone-500 text-sm">Your feedback helps keep Spotheon safe.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-3">
                      Why are you reporting this note?
                    </label>
                    <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {REPORT_REASONS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setReason(r.id)}
                          className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left text-sm ${
                            reason === r.id
                              ? 'border-rose-500 bg-rose-50 text-rose-700'
                              : 'border-stone-100 bg-stone-50 text-stone-600 hover:border-stone-200'
                          }`}
                        >
                          <span className="font-medium">{r.label}</span>
                          {reason === r.id && <div className="w-2 h-2 rounded-full bg-rose-500" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-stone-700 mb-2">
                      Add details (optional)
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Help us understand the issue..."
                      className="w-full p-4 bg-stone-50 border-2 border-stone-100 rounded-2xl text-stone-800 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-none transition-colors resize-none text-sm h-24"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-4 px-6 rounded-2xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!reason || isSubmitting}
                      className="flex-[2] py-4 px-6 rounded-2xl bg-stone-900 text-white font-bold hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4" />
                          Submit report
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
