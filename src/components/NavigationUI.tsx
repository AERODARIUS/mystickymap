import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Map, Locate, LocateOff, LogOut, Compass, Plus, X, Notebook, ChevronDown, QrCode, Shield } from 'lucide-react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { Note, NotePrivacy } from '../types';
import { NoteCreator } from './NoteCreator';
import { Logo } from './Logo';

interface NavigationUIProps {
  user: User | null;
  view: 'map' | 'ar' | 'anchor' | 'qr';
  isTrackingLocation: boolean;
  isPermissionDenied: boolean;
  isCreating: boolean;
  editingNote: Note | null;
  placementStep: 'editing_content' | 'placing_location';
  draftLocation: { lat: number; lng: number } | null;
  draftColor: string;
  draftEmoji: string;
  draftContent: string;
  draftLanguage: string;
  draftPrivacy: NotePrivacy;
  setView: (view: 'map' | 'ar' | 'anchor' | 'qr') => void;
  setIsTrackingLocation: (tracking: boolean) => void;
  onStartCreate: () => void;
  onCancelNoteFlow: () => void;
  setDraftColor: (color: string) => void;
  setDraftEmoji: (emoji: string) => void;
  setDraftContent: (content: string) => void;
  setDraftLanguage: (lang: string) => void;
  setDraftPrivacy: (privacy: NotePrivacy) => void;
  onProceedToPlacement: () => void;
  handleLogin: () => void;
  handleLogout: () => void;
  heading: number | null;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
}

export const NavigationUI = ({
  user,
  view,
  isTrackingLocation,
  isPermissionDenied,
  isCreating,
  editingNote,
  placementStep,
  draftLocation,
  draftColor,
  draftEmoji,
  draftContent,
  draftLanguage,
  draftPrivacy,
  setView,
  setIsTrackingLocation,
  onStartCreate,
  onCancelNoteFlow,
  setDraftColor,
  setDraftEmoji,
  setDraftContent,
  setDraftLanguage,
  setDraftPrivacy,
  onProceedToPlacement,
  handleLogin,
  handleLogout,
  heading,
  isAdmin,
  onOpenAdmin
}: NavigationUIProps) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showLocationDeniedPrompt, setShowLocationDeniedPrompt] = useState(false);

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

  return (
    <>
      {/* Top Buttons */}
      <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          {/* View Selector Menu */}
          <div className="relative">
            <button 
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="pl-2 pr-4 py-2 bg-white text-stone-600 rounded-2xl shadow-lg border border-stone-100 hover:bg-stone-50 transition-all font-bold flex items-center gap-2"
              title={t('nav.change_view')}
            >
              <Logo variant="icon" className="w-8 h-8" />
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
                      className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-[#f0fdfa] transition-colors ${
                        view === opt.id ? 'text-[#0d9488] bg-[#f0fdfa] font-black' : 'text-stone-600'
                      }`}
                    >
                      <opt.icon className="w-4 h-4 text-[#0d9488]" />
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button 
            onClick={() => {
              if (!isTrackingLocation && isPermissionDenied) {
                setShowLocationDeniedPrompt(true);
                setTimeout(() => setShowLocationDeniedPrompt(false), 5000);
              } else {
                setIsTrackingLocation(!isTrackingLocation);
              }
            }}
            className={`p-3 rounded-2xl shadow-lg border transition-all font-bold flex items-center gap-2 ${
              isTrackingLocation ? 'bg-white text-[#0d9488] border-teal-100/50 shadow-teal-900/5' : 'bg-stone-100 text-stone-400 border-stone-200'
            }`}
          >
            {isTrackingLocation ? <Locate className="w-5 h-5" /> : <LocateOff className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex gap-2 pointer-events-auto">
          {isAdmin && (
            <button 
              onClick={onOpenAdmin}
              className="p-3 bg-stone-900 text-white rounded-2xl shadow-lg border border-stone-800 hover:bg-stone-800 transition-all"
              title="Moderation Hub"
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          {user && (
            <button 
              onClick={handleLogout}
              className="p-3 bg-white text-stone-600 rounded-2xl shadow-lg border border-stone-100 hover:bg-stone-50 transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Location Denied Prompt */}
      <AnimatePresence>
        {showLocationDeniedPrompt && (
          <motion.div 
            initial={{ opacity: 0, y: -20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -20, x: '-50%' }}
            className="absolute top-24 left-1/2 w-full max-w-sm px-6 z-[60] pointer-events-none"
          >
            <div className="bg-red-600 text-white p-4 rounded-2xl shadow-2xl pointer-events-auto flex items-center gap-3">
              <LocateOff className="w-6 h-6 shrink-0" />
              <div>
                <p className="text-xs font-bold leading-tight">Location access denied</p>
                <p className="text-[10px] opacity-90 mt-0.5">Please enable location permissions in your browser settings to use auto-positioning.</p>
              </div>
              <button 
                onClick={() => setShowLocationDeniedPrompt(false)}
                className="ml-auto p-1 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md px-6 pointer-events-none z-40">
        <AnimatePresence mode="wait">
          {(isCreating || editingNote) && placementStep === 'editing_content' ? (
            <motion.div 
              key="note-creator"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              className="pointer-events-auto"
            >
              <div className="flex justify-end mb-4">
                <button 
                  type="button"
                  onClick={onCancelNoteFlow}
                  className="p-3 bg-white text-stone-900 rounded-full shadow-xl border border-stone-100 hover:bg-stone-50 transition-colors"
                  title="Cancel"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <NoteCreator 
                draftLocation={draftLocation} 
                color={draftColor}
                setColor={setDraftColor}
                emoji={draftEmoji}
                setEmoji={setDraftEmoji}
                editingNote={editingNote}
                content={draftContent}
                setContent={setDraftContent}
                language={draftLanguage}
                setLanguage={setDraftLanguage}
                privacy={draftPrivacy}
                setPrivacy={setDraftPrivacy}
                onProceedToPlacement={onProceedToPlacement}
              />
            </motion.div>
          ) : (!isCreating && !editingNote && user && view !== 'qr') ? (
            <motion.div 
              key="drop-note-btn"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="flex justify-center pointer-events-auto"
            >
              <button 
                type="button"
                onClick={onStartCreate}
                className="group flex items-center gap-3 px-8 py-4 bg-[#081e2b] hover:bg-[#0e2a38] text-white rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 border border-[#0d9488]/30"
              >
                <Plus className="w-6 h-6 text-[#00a88f] group-hover:rotate-90 transition-transform" />
                <span className="font-extrabold tracking-wide">{t('nav.drop_note')}</span>
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
              className="h-full bg-[#00a88f]"
              animate={{ x: heading ? (heading / 360) * 100 - 50 : 0 }}
              transition={{ type: 'spring', stiffness: 50 }}
            />
          </div>
        </div>
      )}
    </>
  );
};
