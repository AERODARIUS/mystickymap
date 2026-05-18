import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Trash2, MessageSquare, Clock, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User } from 'firebase/auth';
import { Note, MAX_COMMENT_LENGTH, Comment } from '../types';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useComments } from '../hooks/useComments';

interface CommentsViewProps {
  note: Note | null;
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onReportComment: (comment: Comment) => void;
  onReportNote: (note: Note) => void;
}

export const CommentsView = ({ note, isOpen, user, onClose, onReportComment, onReportNote }: CommentsViewProps) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const [commentText, setCommentText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { comments, loading, addComment, deleteComment } = useComments(note?.id || null, user);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current && !loading) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [comments, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    await addComment(commentText.trim());
    setCommentText('');
    setIsSubmitting(false);
  };

  if (!note) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none">
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm pointer-events-auto"
          />
          
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[85vh] sm:max-h-[70vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: note.color || '#10b981' }}>
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-stone-900 text-lg leading-tight">{t('comments.title')}</h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">{t('anchor.created_by')} {note.authorName}</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X className="w-6 h-6 text-stone-400" />
              </button>
            </div>

            {/* Note Context */}
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 flex items-center justify-between gap-4">
              <p className="text-sm text-stone-600 line-clamp-2 italic flex-1">"{note.content}"</p>
              {flags.enableModeration && (
                <button 
                  onClick={() => onReportNote(note)}
                  className="p-2 text-stone-600 hover:text-amber-500 transition-colors"
                  title="Report Note"
                >
                  <AlertTriangle className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Comments List */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
            >
              {loading ? (
                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                  <div className="w-6 h-6 border-2 border-stone-200 border-t-stone-600 rounded-full animate-spin" />
                  <p className="text-xs text-stone-400 font-medium">{t('comments.loading')}</p>
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-10 space-y-4">
                  <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                    <MessageSquare className="w-6 h-6 text-stone-300" />
                  </div>
                  <p className="text-stone-400 text-sm italic">{t('comments.no_comments')}</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="group flex gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-black text-stone-900">{comment.authorName}</p>
                        <div className="flex items-center gap-2">
                          <span className="flex items-center gap-1 text-[9px] text-stone-400 font-bold uppercase tracking-tighter">
                            <Clock className="w-2.5 h-2.5" />
                            {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                          </span>
                          {user && (comment.authorId === user.uid || note.authorId === user.uid) && (
                            <button 
                              onClick={() => deleteComment(comment.id)}
                              className="p-1 text-stone-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {flags.enableModeration && (
                            <button 
                              onClick={() => onReportComment(comment)}
                              className="p-1 text-stone-600 hover:text-amber-500 transition-colors"
                              title="Report Comment"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-3 bg-stone-100 rounded-2xl rounded-tl-none">
                        <p className="text-sm text-stone-700 leading-relaxed break-words">{comment.content}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            <div className="p-6 pt-2 border-t border-stone-100 bg-white rounded-b-3xl">
              {user ? (
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                      placeholder={t('comments.placeholder')}
                      rows={2}
                      className="w-full p-4 pr-12 bg-stone-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-900 outline-none resize-none"
                    />
                    <div className="absolute bottom-3 right-3">
                      <button
                        type="submit"
                        disabled={!commentText.trim() || isSubmitting}
                        className="p-2 bg-stone-900 text-white rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-lg"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center px-1">
                    <p className={`text-[10px] font-bold ${commentText.length >= MAX_COMMENT_LENGTH ? 'text-red-500' : 'text-stone-400'}`}>
                      {commentText.length} / {MAX_COMMENT_LENGTH}
                    </p>
                    {commentText.length >= MAX_COMMENT_LENGTH && (
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">{t('comments.character_limit')}</p>
                    )}
                  </div>
                </form>
              ) : (
                <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 text-center">
                  <p className="text-xs text-emerald-700 font-bold uppercase tracking-wider">{t('nav.login_prompt')}</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
