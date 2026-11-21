import React, { Suspense, lazy, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Trash2, MessageSquare, Clock, AlertTriangle, Calendar, Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User } from 'firebase/auth';
import {
  Note,
  MAX_COMMENT_LENGTH,
  MAX_COMMENT_STORAGE_LENGTH,
  Comment,
} from '../types';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { useComments } from '../hooks/useComments';
import { RichTextViewer } from './RichTextViewer';
import type { RichTextEditorChangeMeta, RichTextEditorHandle } from './RichTextEditor';
import { validateContentLimits } from '../lib/richText';
import { formatExpirationDate, isNoteExpired } from '../lib/expiration';

const LazyRichTextEditor = lazy(() => import('./RichTextEditor'));

interface CommentsViewProps {
  note: Note | null;
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onEditNote?: (note: Note) => void;
  onReportComment: (comment: Comment) => void;
  onReportNote: (note: Note) => void;
}

export const CommentsView = ({ note, isOpen, user, onClose, onEditNote, onReportComment, onReportNote }: CommentsViewProps) => {
  const { t, i18n } = useTranslation();
  const { flags } = useFeatureFlags();
  const [commentMarkdown, setCommentMarkdown] = useState('');
  const [visibleLength, setVisibleLength] = useState(0);
  const [storageLength, setStorageLength] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { comments, loading, addComment, deleteComment } = useComments(note?.id || null, user);
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);

  // Auto-scroll to bottom when comments change
  useEffect(() => {
    if (scrollRef.current && !loading && typeof scrollRef.current.scrollTo === 'function') {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  }, [comments, loading]);

  const handleEditorChange = useCallback((markdown: string, meta: RichTextEditorChangeMeta) => {
    setCommentMarkdown(markdown);
    setVisibleLength(meta.visibleLength);
    setStorageLength(meta.storageLength);
  }, []);

  const validation = validateContentLimits(
    visibleLength,
    commentMarkdown,
    MAX_COMMENT_LENGTH,
    MAX_COMMENT_STORAGE_LENGTH
  );

  const submitComment = useCallback(async () => {
    if (!validation.valid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await addComment(commentMarkdown.trim(), 'markdown');
      editorRef.current?.clear();
      setCommentMarkdown('');
      setVisibleLength(0);
      setStorageLength(0);
    } finally {
      setIsSubmitting(false);
    }
  }, [validation.valid, isSubmitting, addComment, commentMarkdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitComment();
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
            className="relative w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-3xl shadow-2xl pointer-events-auto flex flex-col max-h-[85dvh] sm:max-h-[75dvh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 sm:p-6 border-b border-stone-100 shrink-0">
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
                aria-label="Close"
              >
                <X className="w-6 h-6 text-stone-400" />
              </button>
            </div>

            {/* Note Context */}
            <div className="px-6 py-4 bg-stone-50 border-b border-stone-100 space-y-2 shrink-0">
              {(isNoteExpired(note) || note.expiresAt) && (
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {isNoteExpired(note) && (
                      <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider">
                        {t('expiration.expired_badge', 'Vencida')}
                      </span>
                    )}
                    {note.expiresAt && (
                      <span className="text-[11px] text-stone-500 font-medium flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {isNoteExpired(note)
                          ? `${t('expiration.expired_on', 'Venció el')} ${formatExpirationDate(note.expiresAt, i18n.language)}`
                          : `${t('expiration.visible_until_short', 'Visible hasta')} ${formatExpirationDate(note.expiresAt, i18n.language)}`}
                      </span>
                    )}
                  </div>
                  {user && note.authorId === user.uid && onEditNote && (
                    <button
                      type="button"
                      onClick={() => onEditNote(note)}
                      className="px-2.5 py-1 rounded-lg bg-[#081e2b] text-white hover:bg-[#0e2a38] text-[11px] font-bold flex items-center gap-1 transition-colors"
                    >
                      <Pencil className="w-3 h-3 text-[#00a88f]" />
                      <span>{isNoteExpired(note) ? t('anchor.renew_note', 'Renovar') : t('anchor.edit_note')}</span>
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm text-stone-600 flex-1 max-h-36 overflow-y-auto scrollbar-thin min-w-0">
                  <RichTextViewer
                    content={note.content || ''}
                    contentFormat={note.contentFormat}
                    variant="compact"
                    tone="light"
                  />
                </div>
                {flags.enableModeration && (
                  <button
                    onClick={() => onReportNote(note)}
                    className="p-2 text-stone-600 hover:text-amber-500 transition-colors shrink-0"
                    title="Report Note"
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Comments List */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
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
                    <div className="flex-1 space-y-1 min-w-0">
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
                              aria-label={t('comments.delete')}
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
                        <RichTextViewer
                          content={comment.content}
                          contentFormat={comment.contentFormat}
                          variant="comment"
                          tone="light"
                          className="text-stone-700"
                        />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input Area */}
            <div className="p-4 sm:p-6 pt-3 border-t border-stone-100 bg-white rounded-b-3xl shrink-0">
              {user ? (
                <form onSubmit={handleSubmit} className="space-y-2.5">
                  <Suspense
                    fallback={
                      <div className="w-full h-24 bg-stone-100 rounded-2xl flex items-center justify-center text-xs text-stone-400">
                        Loading editor...
                      </div>
                    }
                  >
                    <LazyRichTextEditor
                      ref={editorRef}
                      mode="comment"
                      initialContent=""
                      contentFormat="markdown"
                      maxVisibleLength={MAX_COMMENT_LENGTH}
                      maxStorageLength={MAX_COMMENT_STORAGE_LENGTH}
                      placeholder={t('comments.placeholder')}
                      compact
                      className="bg-stone-100 border-stone-200 focus-within:ring-stone-900"
                      onChange={handleEditorChange}
                      onSubmitShortcut={submitComment}
                    />
                  </Suspense>

                  {validation.exceedsStorage && (
                    <p className="text-[11px] font-semibold text-red-600 px-1" role="alert">
                      Formatting exceeds comment storage limit ({storageLength} / {MAX_COMMENT_STORAGE_LENGTH}).
                    </p>
                  )}

                  <div className="flex justify-between items-center gap-3 px-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={`text-[10px] font-bold ${visibleLength >= MAX_COMMENT_LENGTH || validation.exceedsStorage ? 'text-red-500' : 'text-stone-400'}`}>
                        {visibleLength} / {MAX_COMMENT_LENGTH}
                      </p>
                      {visibleLength >= MAX_COMMENT_LENGTH && (
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-tighter truncate">{t('comments.character_limit')}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={!validation.valid || isSubmitting}
                      aria-label={t('comments.send')}
                      className="px-4 py-2 bg-[#081e2b] text-[#00a88f] hover:text-white rounded-xl disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95 transition-all shadow-md border border-[#0d9488]/30 flex items-center gap-1.5 text-xs font-bold shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{t('comments.send')}</span>
                    </button>
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
