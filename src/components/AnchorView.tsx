import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Search, MapPin, Navigation, Clock, User as UserIcon, Pencil, Trash2, Share2, Check, Languages, Compass, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Note, calculateDistance, SUPPORTED_LANGUAGES } from '../types';
import { User } from 'firebase/auth';
import { SpeechButton } from './SpeechButton';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface AnchorViewProps {
  notes: Note[];
  userLocation: { lat: number; lng: number } | null;
  user: User | null;
  setEditingNote: (note: Note | null) => void;
  onFocusNote: (note: Note) => void;
  copyToClipboard: (id: string) => void;
  copyStatus: string | null;
  onGenerateQRCode: (id: string) => void;
}

export const AnchorView = ({ 
  notes, 
  userLocation, 
  user,
  setEditingNote,
  onFocusNote,
  copyToClipboard,
  copyStatus,
  onGenerateQRCode
}: AnchorViewProps) => {
  const { t } = useTranslation();
  const [radius, setRadius] = useState<number>(1000); // meters
  const [searchTerm, setSearchTerm] = useState('');

  const filteredNotes = useMemo(() => {
    let result = notes.map(note => ({
      ...note,
      distance: userLocation 
        ? calculateDistance(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng)
        : Infinity
    }));

    // Filter by radius
    result = result.filter(n => n.distance <= radius);

    // Search
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(n => 
        n.content?.toLowerCase().includes(lowerSearch) || 
        n.authorName.toLowerCase().includes(lowerSearch)
      );
    }

    // Sort by distance (default)
    result.sort((a, b) => {
      if (a.distance !== b.distance) return a.distance - b.distance;
      return a.authorName.localeCompare(b.authorName);
    });

    return result;
  }, [notes, userLocation, radius, searchTerm]);

  return (
    <div className="h-full bg-stone-50 overflow-y-auto px-6 pt-24 pb-32">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header/Filters */}
        <div className="bg-white rounded-3xl shadow-sm border border-stone-100 p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-black text-stone-900">{t('anchor.title')}</h1>
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
                className="w-full accent-emerald-600 h-1.5 bg-stone-100 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #10b981 0%, #10b981 ${((radius - 100) / 9900) * 100}%, #f5f5f4 ${((radius - 100) / 9900) * 100}%, #f5f5f4 100%)`
                }}
              />
            </div>
          </div>
        </div>

        {/* Notes List */}
        <div className="space-y-4">
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <motion.div 
                layout
                key={note.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="group bg-white p-5 rounded-3xl shadow-sm border border-stone-100 hover:border-stone-200 transition-all"
              >
                <div className="flex flex-col items-stretch gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
                        {note.emoji ? (
                          <span className="text-lg leading-none">{note.emoji}</span>
                        ) : (
                          <UserIcon className="w-4 h-4 text-stone-500" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-stone-900">{note.authorName}</p>
                        <div className="flex items-center gap-2 text-[10px] text-stone-400 font-medium">
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-3 h-3" />
                            {new Date(note.createdAt.toMillis()).toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <Navigation className="w-3 h-3" />
                            {note.distance >= 1000 ? `${(note.distance / 1000).toFixed(1)}km` : `${Math.round(note.distance)}m`} {t('anchor.away')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-stone-50 text-stone-700 text-sm leading-relaxed" style={{ borderLeft: `4px solid ${note.color}` }}>
                      {note.isPrivate && (
                        <div className="inline-flex items-center gap-1 mb-2 px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-bold">
                          <Compass className="w-2.5 h-2.5" />
                          {t('creator.private')}
                        </div>
                      )}
                      {note.type === 'text' ? (
                        <p>{note.content}</p>
                      ) : (
                        <div className="flex items-center gap-2 text-stone-500 italic">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          {t('anchor.audio_message')}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-4">
                        {note.language && (
                          <div className="flex items-center gap-1 px-1.5 py-0.5 bg-stone-100 rounded text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                            <Languages className="w-2.5 h-2.5" />
                            {SUPPORTED_LANGUAGES.find(l => l.code === note.language)?.label || note.language}
                          </div>
                        )}
                        <div className="flex items-center gap-2 ml-auto">
                          <button 
                            onClick={() => onFocusNote(note)}
                            className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                            title={t('anchor.view_on_map')}
                          >
                            <Navigation className="w-4 h-4" />
                          </button>
                          <SpeechButton 
                            text={note.content || ''} 
                            language={note.language}
                            className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2.5 rounded-full" 
                          />
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
                          {user && note.authorId === user.uid && (
                            <>
                              <button 
                                onClick={() => setEditingNote(note)}
                                className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                                title={t('anchor.edit_note')}
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(t('anchor.delete_confirm'))) {
                                    try {
                                      await deleteDoc(doc(db, 'notes', note.id));
                                    } catch (error) {
                                      handleFirestoreError(error, OperationType.DELETE, `notes/${note.id}`);
                                    }
                                  }
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
            ))
          ) : (
            <div className="py-20 text-center space-y-4">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mx-auto">
                <MapPin className="w-8 h-8 text-stone-300" />
              </div>
              <p className="text-stone-400 font-medium italic">{t('anchor.no_notes')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
