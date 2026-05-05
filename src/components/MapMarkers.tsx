import React from 'react';
import { AdvancedMarker, InfoWindow } from '@vis.gl/react-google-maps';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Languages, Pencil, Trash2, Check, Share2, Compass, FileText, QrCode } from 'lucide-react';
import { User } from 'firebase/auth';
import { Note, SUPPORTED_LANGUAGES } from '../types';
import { SpeechButton } from './SpeechButton';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, deleteDoc } from 'firebase/firestore';

interface MapMarkersProps {
  user: User | null;
  notes: Note[];
  userLocation: { lat: number; lng: number } | null;
  isCreating: boolean;
  editingNote: Note | null;
  draftLocation: { lat: number; lng: number } | null;
  draftColor: string;
  draftEmoji: string;
  selectedNote: Note | null;
  copyStatus: string | null;
  setDraftLocation: (loc: { lat: number; lng: number } | null) => void;
  setSelectedNote: (note: Note | null) => void;
  setEditingNote: (note: Note | null) => void;
  copyToClipboard: (id: string) => void;
  onGenerateQRCode: (id: string) => void;
}

export const MapMarkers = ({
  user,
  notes,
  userLocation,
  isCreating,
  editingNote,
  draftLocation,
  draftColor,
  draftEmoji,
  selectedNote,
  copyStatus,
  setDraftLocation,
  setSelectedNote,
  setEditingNote,
  copyToClipboard,
  onGenerateQRCode
}: MapMarkersProps) => {
  const { t } = useTranslation();
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'notes', deleteId));
      setSelectedNote(null);
      setDeleteId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${deleteId}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <DeleteConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        isLoading={isDeleting}
      />
      {userLocation && (
        <AdvancedMarker position={userLocation}>
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500 rounded-full animate-ping opacity-20" />
            <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white shadow-lg" />
          </div>
        </AdvancedMarker>
      )}

      {(isCreating || editingNote) && draftLocation && (
        <AdvancedMarker 
          position={draftLocation}
          draggable={true}
          onDragEnd={(e) => {
            if (e.latLng) {
              setDraftLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }
          }}
        >
          <motion.div 
            initial={{ scale: 0, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            className="flex items-center justify-center w-12 h-12 rounded-full shadow-2xl border-4 border-white z-50 cursor-grab active:cursor-grabbing"
            style={{ backgroundColor: draftColor }}
          >
            <span className="text-2xl">{draftEmoji}</span>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r-4 border-b-4 border-white" style={{ backgroundColor: draftColor }} />
            <div className="absolute -inset-4 border-2 border-dashed rounded-full animate-[spin_4s_linear_infinite]" style={{ borderColor: draftColor, opacity: 0.5 }} />
          </motion.div>
        </AdvancedMarker>
      )}

      {notes.map(note => (
        <AdvancedMarker 
          key={note.id} 
          position={note.location}
          onClick={() => setSelectedNote(note)}
        >
          <div 
            className="flex items-center justify-center w-10 h-10 rounded-full shadow-xl border-2 border-white transition-transform hover:scale-110 active:scale-95"
            style={{ backgroundColor: note.color || '#10b981' }}
          >
            {note.emoji ? (
              <span className="text-xl leading-none">{note.emoji}</span>
            ) : (
              <FileText className="w-5 h-5 text-white" />
            )}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r-2 border-b-2 border-white" style={{ backgroundColor: note.color || '#10b981' }} />
          </div>
        </AdvancedMarker>
      ))}

      {selectedNote && (
        <InfoWindow 
          position={selectedNote.location} 
          onCloseClick={() => setSelectedNote(null)}
        >
          <div className="p-3 max-w-[260px] overflow-x-hidden">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-stone-100">
              <div className="flex-1 min-w-0">
                <p className="text-[8px] text-stone-400 uppercase tracking-tighter">{t('anchor.created_by')}</p>
                <p className="text-[10px] font-bold text-stone-900 truncate">{user && selectedNote.authorId === user.uid ? t('qr.view.you') : (selectedNote.authorName || 'Explorer')}</p>
              </div>
              {selectedNote.isPrivate && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-rose-50 text-rose-600 rounded text-[8px] font-bold">
                  <Compass className="w-2.5 h-2.5" />
                  {t('creator.private')}
                </div>
              )}
            </div>
            <p className="text-sm text-stone-800 font-medium leading-relaxed break-words">{selectedNote.content}</p>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-100/50">
              <p className="text-[10px] text-stone-400">
                {selectedNote.createdAt.toDate().toLocaleDateString()}
              </p>
              {selectedNote.language && (
                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-stone-100 rounded text-[9px] font-bold text-stone-500 uppercase tracking-wider">
                  <Languages className="w-2.5 h-2.5" />
                  {SUPPORTED_LANGUAGES.find(l => l.code === selectedNote.language)?.label || selectedNote.language}
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-center gap-3">
                <SpeechButton 
                  text={selectedNote.content || ''} 
                  language={selectedNote.language}
                  className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2.5" 
                />
                <button 
                  onClick={() => onGenerateQRCode(selectedNote.id)}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                  title={t('anchor.generate_qr')}
                >
                  <QrCode className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => copyToClipboard(selectedNote.id)}
                  className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                  title={t('anchor.share_link')}
                >
                  {copyStatus === selectedNote.id ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
                </button>
                {user && selectedNote.authorId === user.uid && (
                  <>
                    <button 
                      onClick={() => {
                        setEditingNote(selectedNote);
                        setSelectedNote(null);
                      }}
                      className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors flex items-center justify-center"
                      title={t('anchor.edit_note')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setDeleteId(selectedNote.id)}
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
        </InfoWindow>
      )}
    </>
  );
};
