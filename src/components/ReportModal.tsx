import React, { useState } from 'react';
import { X, AlertTriangle, Send, CheckCircle } from 'lucide-react';
import { User } from 'firebase/auth';
import { Note, NoteReport, Comment } from '../types';
import { db, serverTimestamp, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';

interface ReportModalProps {
  note: Note | null;
  comment?: Comment | null;
  user: User | null;
  onClose: () => void;
}

export const ReportModal = ({ note, comment, user, onClose }: ReportModalProps) => {
  const [reason, setReason] = useState<NoteReport['reason']>('spam');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!note && !comment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsSubmitting(true);
    try {
      const reportData: Omit<NoteReport, 'id'> = {
        reporterId: user.uid,
        reason,
        details: details.trim(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        createdAt: serverTimestamp() as any,
        status: 'pending'
      };

      if (comment) {
        reportData.commentId = comment.id;
        reportData.noteId = comment.noteId;
      } else if (note) {
        reportData.noteId = note.id;
      }

      await addDoc(collection(db, 'reports'), reportData);
      setIsSuccess(true);
      setTimeout(onClose, 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'reports');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-sm rounded-[32px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-stone-100">
        {/* Header */}
        <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-bold text-stone-900 tracking-tight">Report Note</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-stone-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        {isSuccess ? (
          <div className="p-10 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center animate-bounce shadow-inner">
              <CheckCircle className="w-10 h-10" />
            </div>
            <div>
              <p className="text-xl font-black text-stone-900">Report Received</p>
              <p className="text-stone-500 mt-2 text-sm max-w-[200px]">Thank you for keeping Spotheon safe. We will review this note shortly.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2 px-1">Reason for report</label>
                <select 
                  value={reason}
                  onChange={(e) => setReason(e.target.value as NoteReport['reason'])}
                  className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all text-sm font-bold text-stone-700 appearance-none cursor-pointer"
                >
                  <option value="spam">Spam / Advertising</option>
                  <option value="harassment">Harassment / Bullying</option>
                  <option value="hate_speech">Hate Speech</option>
                  <option value="nsfw">NSFW / Explicit Content</option>
                  <option value="threat">Threats / Violence</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-black text-stone-400 uppercase tracking-widest block mb-2 px-1">Additional details</label>
                <textarea 
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  placeholder="Describe the issue..."
                  className="w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl outline-none focus:ring-4 focus:ring-amber-500/10 focus:border-amber-500 transition-all text-sm font-medium text-stone-700 h-28 resize-none placeholder:text-stone-300"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-4 bg-stone-100 text-stone-600 rounded-2xl font-bold hover:bg-stone-200 transition-all text-sm active:scale-95"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !user}
                className="flex-[2] px-4 py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 transition-all text-sm shadow-xl active:scale-95 shadow-stone-900/10"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Report
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
