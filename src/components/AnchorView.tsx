import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, MapPin, Navigation, Clock, User as UserIcon, Pencil, Trash2, Share2, Check, Languages, QrCode, Lock, Globe, Link, MessageSquare, AlertTriangle, Folder, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Note, calculateDistance, SUPPORTED_LANGUAGES } from '../types';
import { User } from 'firebase/auth';
import { SpeechButton } from './SpeechButton';
import { RichTextViewer } from './RichTextViewer';
import { markdownToPlainText } from '../lib/richText';
import { isNoteExpired } from '../lib/expiration';
import { normalizeGroupName } from '../lib/groups';
import { useGroupFilter } from '../context/GroupFilterContext';
import { GroupFilter } from './GroupFilter';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { db, handleFirestoreError, OperationType, logAnalyticsEvent } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useFeatureFlags } from '../hooks/useFeatureFlags';

interface AnchorViewProps {
  notes: Note[];
  myNotes?: Note[];
  userLocation: { lat: number; lng: number } | null;
  user: User | null;
  setEditingNote: (note: Note | null) => void;
  onFocusNote: (note: Note) => void;
  copyToClipboard: (id: string) => void;
  copyStatus: string | null;
  onGenerateQRCode: (id: string) => void;
  onShowComments: (note: Note) => void;
  onReportNote: (note: Note) => void;
}

export const AnchorView = ({ 
  notes, 
  myNotes = [],
  userLocation, 
  user,
  setEditingNote,
  onFocusNote,
  copyToClipboard,
  copyStatus,
  onGenerateQRCode,
  onShowComments,
  onReportNote
}: AnchorViewProps) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const { filterNotes, isFilterActive, resetFilters } = useGroupFilter();
  const [activeTab, setActiveTab] = useState<'nearby' | 'my_notes'>('nearby');
  const [radius, setRadius] = useState<number>(1000); // meters
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'notes', deleteId));
      logAnalyticsEvent('note_delete', { note_id: deleteId });
      setDeleteId(null);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.DELETE, `notes/${deleteId}`);
      } catch {
        // Logged and reported via handleFirestoreError; avoid unhandled rejection in async click handler
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const effectiveTab = user ? activeTab : 'nearby';
  const expiredMyNotesCount = useMemo(
    () => myNotes.filter((n) => isNoteExpired(n)).length,
    [myNotes]
  );

  const filteredNotes = useMemo(() => {
    const source = effectiveTab === 'my_notes' ? myNotes : notes;
    const groupFiltered = filterNotes(source);
    let result = groupFiltered.map(note => ({
      ...note,
      distance: userLocation 
        ? calculateDistance(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng)
        : Infinity
    }));

    // Filter by radius only for nearby public discovery
    if (effectiveTab === 'nearby') {
      result = result.filter(n => n.distance <= radius);
    }

    // Search
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(n => {
        const plainText = markdownToPlainText(n.content || '', n.contentFormat).toLowerCase();
        return plainText.includes(lowerSearch) || n.authorName.toLowerCase().includes(lowerSearch);
      });
    }

    if (effectiveTab === 'nearby') {
      result.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.authorName.localeCompare(b.authorName);
      });
    }

    return result;
  }, [effectiveTab, myNotes, notes, filterNotes, userLocation, radius, searchTerm]);

  return (
    <div className="h-full bg-stone-50 overflow-y-auto px-6 pt-24 pb-32">
      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header/Filters */}
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-stone-900">
              {effectiveTab === 'my_notes' ? t('anchor.tab_my_notes') : t('anchor.title')}
            </h1>
            {user && (
              <div className="flex items-center gap-1 p-1 bg-stone-100 rounded-2xl" role="tablist" aria-label="Notes view tabs">
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'nearby'}
                  onClick={() => setActiveTab('nearby')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                    effectiveTab === 'nearby'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  {t('anchor.tab_nearby')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={effectiveTab === 'my_notes'}
                  onClick={() => setActiveTab('my_notes')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    effectiveTab === 'my_notes'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  <span>{t('anchor.tab_my_notes')}</span>
                  {expiredMyNotesCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-black">
                      {expiredMyNotesCount}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-400" />
              <input 
                type="text" 
                placeholder={t('anchor.search_placeholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-stone-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-stone-900 outline-none"
              />
            </div>

            {effectiveTab === 'nearby' && (
              <div className="space-y-2 pt-2 border-t border-stone-50">
                <div className="flex justify-between text-xs font-bold text-stone-500 uppercase tracking-wider">
                  <span>{t('anchor.radius_label')}</span>
                  <span className="text-stone-900">{radius >= 1000 ? `${(radius / 1000).toFixed(1)}km` : `${radius}m`}</span>
                </div>
                <input 
                  type="range" 
                  min="100" 
                  max="10000" 
                  step="100"
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="w-full accent-[#0d9488] h-1.5 bg-stone-100 rounded-lg appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #0d9488 0%, #0d9488 ${((radius - 100) / 9900) * 100}%, #f5f5f4 ${((radius - 100) / 9900) * 100}%, #f5f5f4 100%)`
                  }}
                />
              </div>
            )}

            <div className="pt-2 border-t border-stone-50">
              <GroupFilter variant="inline" />
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => {
              const expired = isNoteExpired(note);
              const noteGroup = normalizeGroupName(note.group);
              const createdAtMs =
                note.createdAt && typeof note.createdAt.toMillis === 'function'
                  ? note.createdAt.toMillis()
                  : null;

              return (
                <motion.div 
                  layout
                  key={note.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`group bg-white p-5 rounded-3xl shadow-sm border transition-all ${
                    expired ? 'border-amber-200 bg-amber-50/20' : 'border-stone-100 hover:border-stone-200'
                  }`}
                >
                  <div className="flex flex-col items-stretch gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0">
                            {note.emoji ? (
                              <span className="text-lg leading-none">{note.emoji}</span>
                            ) : (
                              <UserIcon className="w-4 h-4 text-stone-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-stone-900 truncate">{note.authorName}</p>
                            <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-400 font-medium">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3" />
                                {createdAtMs ? new Date(createdAtMs).toLocaleDateString() : '—'}
                              </span>
                              {Number.isFinite(note.distance) && (
                                <span className="flex items-center gap-0.5">
                                  <Navigation className="w-3 h-3" />
                                  {note.distance >= 1000 ? `${(note.distance / 1000).toFixed(1)}km` : `${Math.round(note.distance)}m`} {t('anchor.away')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {expired && (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[10px] font-black uppercase tracking-wider shrink-0">
                            {t('expiration.expired_badge', 'Vencida')}
                          </span>
                        )}
                      </div>

                      <div className="p-4 rounded-2xl bg-stone-50 text-stone-700 text-sm leading-relaxed" style={{ borderLeft: `4px solid ${note.color}` }}>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          {note.privacy === 'private' ? (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-bold">
                              <Lock className="w-2.5 h-2.5" />
                              {t('creator.private')}
                            </div>
                          ) : note.privacy === 'unlisted' ? (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[8px] font-bold">
                              <Link className="w-2.5 h-2.5" />
                              UNLISTED
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[8px] font-bold">
                              <Globe className="w-2.5 h-2.5" />
                              {t('creator.public')}
                            </div>
                          )}
                          {noteGroup && (
                            <span
                              data-testid={`anchor-note-group-${note.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-50 text-[#0d9488] border border-teal-100 text-[10px] font-bold"
                            >
                              <Folder className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{noteGroup}</span>
                            </span>
                          )}
                        </div>
                        {note.type === 'text' ? (
                          <div className="max-h-60 overflow-y-auto scrollbar-thin">
                            <RichTextViewer
                              content={note.content || ''}
                              contentFormat={note.contentFormat}
                              variant="note"
                              tone="light"
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-stone-500 italic">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                            {t('anchor.audio_message')}
                          </div>
                        )}
                        
                        <div className="flex flex-wrap items-center justify-start gap-3 mt-4">
                          {note.language && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-stone-100 rounded text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                              <Languages className="w-2.5 h-2.5" />
                              {SUPPORTED_LANGUAGES.find(l => l.code === note.language)?.label || note.language}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap justify-start">
                            {!expired && (
                              <button 
                                onClick={() => onFocusNote(note)}
                                className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                                title={t('anchor.view_on_map')}
                              >
                                <Navigation className="w-4 h-4" />
                              </button>
                            )}
                            <SpeechButton 
                              text={note.content || ''} 
                              language={note.language}
                              contentFormat={note.contentFormat}
                              className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2.5 rounded-full" 
                            />
                            <button 
                              onClick={() => {
                                logAnalyticsEvent('comments_open', { note_id: note.id });
                                onShowComments(note);
                              }}
                              className="p-2.5 bg-sky-50 hover:bg-sky-100 text-sky-600 rounded-full transition-colors flex items-center justify-center"
                              title={t('comments.reply')}
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => onGenerateQRCode(note.id)}
                              className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                              title={t('anchor.generate_qr')}
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => copyToClipboard(note.id)}
                              className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                              title={t('anchor.share_link')}
                            >
                              {copyStatus === note.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                            </button>
                            {flags.enableModeration && (
                              <button 
                                onClick={() => onReportNote(note)}
                                className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                                title="Report Note"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            )}
                            {user && note.authorId === user.uid && (
                              <>
                                {expired ? (
                                  <button
                                    onClick={() => setEditingNote(note)}
                                    className="px-3.5 py-2 bg-[#081e2b] hover:bg-[#0e2a38] text-white rounded-full transition-colors flex items-center gap-1.5 text-xs font-bold"
                                    title={t('anchor.renew_note', 'Renovar')}
                                  >
                                    <Pencil className="w-3.5 h-3.5 text-[#00a88f]" />
                                    <span>{t('anchor.renew_note', 'Renovar')}</span>
                                  </button>
                                ) : (
                                  <button 
                                    onClick={() => setEditingNote(note)}
                                    className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                                    title={t('anchor.edit_note')}
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                )}
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteId(note.id);
                                  }}
                                  className="p-2.5 bg-red-50 hover:bg-red-100 text-red-500 rounded-full transition-colors flex items-center justify-center"
                                  title={t('anchor.delete_note')}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8 text-stone-300" />
              </div>
              {isFilterActive ? (
                <div className="space-y-2 max-w-sm mx-auto">
                  <p className="text-stone-700 font-bold text-sm">
                    {t('groups.empty_filtered_title', 'No notes match the selected groups')}
                  </p>
                  <p className="text-stone-400 text-xs">
                    {t('groups.empty_filtered_desc', 'Adjust your group filters or reset them to view notes again.')}
                  </p>
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#081e2b] hover:bg-[#0e2a38] text-white text-xs font-bold transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-[#00a88f]" aria-hidden="true" />
                    <span>{t('groups.reset', 'Reset')}</span>
                  </button>
                </div>
              ) : (
                <p className="text-stone-400 font-medium italic">
                  {effectiveTab === 'my_notes' ? t('anchor.no_my_notes') : t('anchor.no_notes')}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
