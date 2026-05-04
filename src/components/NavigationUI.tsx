import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Map, Locate, LocateOff, LogOut, Compass, Plus, X, Notebook, ChevronDown, QrCode } from 'lucide-react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { Note } from '../types';
import { NoteCreator } from './NoteCreator';

interface NavigationUIProps {
  user: User | null;
  view: 'map' | 'ar' | 'anchor' | 'qr';
  isTrackingLocation: boolean;
  isCreating: boolean;
  editingNote: Note | null;
  draftLocation: { lat: number; lng: number } | null;
  draftColor: string;
  setView: (view: 'map' | 'ar' | 'anchor' | 'qr') => void;
  setIsTrackingLocation: (tracking: boolean) => void;
  setIsCreating: (creating: boolean) => void;
  setEditingNote: (note: Note | null) => void;
  setDraftColor: (color: string) => void;
  handleLogin: () => void;
  handleLogout: () => void;
  heading: number | null;
}

export const NavigationUI = ({
  user,
  view,
  isTrackingLocation,
  isCreating,
  editingNote,
  draftLocation,
  draftColor,
  setView,
  setIsTrackingLocation,
  setIsCreating,
  setEditingNote,
  setDraftColor,
  handleLogin,
  handleLogout,
  heading
}: NavigationUIProps) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const viewOptions = useMemo(() => {
    const options: Array<{ id: 'map' | 'ar' | 'anchor' | 'qr'; label: string; icon: React.ElementType }> = [
      { id: 'map', label: t('nav.map_view'), icon: Map },
    ];

    if (flags.enableARView) {
      options.push({ id: 'ar', label: t('nav.ar_view'), icon: Camera });
    }

    if (flags.enableQRScanner) {
      options.push({ id: 'qr', label: t('nav.qr_notes'), icon: QrCode });
    }

    options.push({ id: 'anchor', label: t('nav.nearby_notes'), icon: Notebook });

    return options;
  }, [t, flags.enableARView, flags.enableQRScanner]);

  const ActiveIcon = viewOptions.find(opt => opt.id === view)?.icon || Map;

  return (
    <>
      {/* Top Buttons */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          {/* View Selector Menu */}
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-3 bg-white text-stone-600 rounded-2xl shadow-lg border border-stone-100 hover:bg-stone-50 transition-all font-bold flex items-center gap-2"
              title={t('nav.change_view')}
            >
              <ActiveIcon className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-tight hidden sm:inline">
                {viewOptions.find(opt => opt.id === view)?.label}
              </span>
              <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {isMenuOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-stone-100 overflow-hidden z-50 py-1"
                >
                  {viewOptions.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        setView(opt.id);
                        setIsMenuOpen(false);
                      }}
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-stone-50 transition-colors ${
                        view === opt.id ? 'text-emerald-600 bg-emerald-50/50' : 'text-stone-600'
                      }`}
                    >
                      <opt.icon className="w-4 h-4" />
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => setIsTrackingLocation(!isTrackingLocation)}
            className={`p-3 rounded-2xl shadow-lg border transition-all font-bold flex items-center gap-2 ${
              isTrackingLocation ? 'bg-white text-emerald-600 border-stone-100' : 'bg-stone-100 text-stone-400 border-stone-200'
            }`}
          >
            {isTrackingLocation ? <Locate className="w-5 h-5" /> : <LocateOff className="w-5 h-5" />}
          </button>
        </div>

        {user && (
          <button 
            onClick={handleLogout}
            className="p-3 bg-white text-stone-600 rounded-2xl shadow-lg border border-stone-100 pointer-events-auto hover:bg-stone-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Login Prompt */}
      {!user && (
        <div className="absolute top-24 left-6 right-6 flex justify-center pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-sm w-full bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center justify-between shadow-lg pointer-events-auto"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-full text-amber-600">
                <Compass className="w-4 h-4" />
              </div>
              <p className="text-xs font-semibold text-amber-900">{t('nav.login_prompt')}</p>
            </div>
            <button 
              onClick={handleLogin}
              className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-[10px] font-black uppercase hover:bg-amber-700 transition-colors"
            >
              {t('nav.login')}
            </button>
          </motion.div>
        </div>
      )}

      {/* Bottom Controls / Note Creator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-6 pointer-events-none">
        <AnimatePresence mode="wait">
          {(isCreating || editingNote) ? (
            <motion.div 
              key="note-creator"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="pointer-events-auto"
            >
              <div className="flex justify-end mb-4">
                <button 
                  onClick={() => {
                    setIsCreating(false);
                    setEditingNote(null);
                  }}
                  className="p-3 bg-white text-stone-900 rounded-full shadow-xl border border-stone-100"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <NoteCreator 
                draftLocation={draftLocation} 
                onNoteCreated={() => {
                  setIsCreating(false);
                  setEditingNote(null);
                }} 
                color={draftColor}
                setColor={setDraftColor}
                editingNote={editingNote}
              />
            </motion.div>
          ) : (user && view !== 'qr') ? (
            <motion.div 
              key="drop-note-btn"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex justify-center pointer-events-auto"
            >
              <button 
                onClick={() => {
                  setIsCreating(true);
                  setView('map');
                }}
                className="group flex items-center gap-3 px-8 py-4 bg-stone-900 text-white rounded-full shadow-2xl hover:bg-stone-800 transition-all scale-110 active:scale-105"
              >
                <Plus className="w-6 h-6 group-hover:rotate-90 transition-transform" />
                <span className="font-bold">{t('nav.drop_note')}</span>
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {/* AR View Heading Indicator */}
      {view === 'ar' && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-emerald-500"
              animate={{ x: heading ? (heading / 360) * 100 - 50 : 0 }}
              transition={{ type: 'spring', stiffness: 50 }}
            />
          </div>
        </div>
      )}
    </>
  );
};
