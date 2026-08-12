import React from 'react';
import { motion } from 'motion/react';
import { Pencil, Check, X, MapPin } from 'lucide-react';
import { Note } from '../types';

interface LocationPlacementProps {
  isCreating: boolean;
  editingNote: Note | null;
  draftEmoji: string;
  draftColor: string;
  draftContent?: string;
  candidateLocation?: { lat: number; lng: number } | null;
  isSubmitting: boolean;
  onEditNote?: () => void;
  onBackToEdit?: () => void;
  onConfirmLocation?: () => void;
  onConfirmPlacement?: () => void;
  onCancel: () => void;
}

export const LocationPlacement: React.FC<LocationPlacementProps> = ({
  isCreating,
  editingNote,
  draftEmoji,
  draftColor,
  isSubmitting,
  onEditNote,
  onBackToEdit,
  onConfirmLocation,
  onConfirmPlacement,
  onCancel
}) => {
  const handleEdit = onEditNote || onBackToEdit || (() => {});
  const handleConfirm = onConfirmLocation || onConfirmPlacement || (() => {});
  return (
    <>
      {/* Top Banner Instruction */}
      <div className="absolute top-20 sm:top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none px-4 w-full max-w-sm flex justify-center">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-stone-900/90 text-white backdrop-blur-md px-4 py-2.5 rounded-full shadow-2xl border border-stone-800 flex items-center gap-2 text-xs font-bold text-center"
        >
          <MapPin className="w-4 h-4 text-[#00a88f] shrink-0" />
          <span>{editingNote ? 'Move map to adjust note location' : 'Move map to position your note'}</span>
        </motion.div>
      </div>

      {/* Center Pin Indicator */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full z-30 pointer-events-none flex flex-col items-center">
        <div 
          className="relative flex items-center justify-center w-12 h-12 rounded-full shadow-2xl border-4 border-white transition-transform animate-in zoom-in-75 duration-200"
          style={{ backgroundColor: draftColor }}
        >
          <span className="text-2xl leading-none">{draftEmoji}</span>
          <div 
            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-r-4 border-b-4 border-white" 
            style={{ backgroundColor: draftColor }} 
          />
        </div>
        {/* Ground Target Dot */}
        <div className="w-3 h-3 rounded-full bg-stone-900/40 border-2 border-white shadow-lg flex items-center justify-center mt-1">
          <div className="w-1 h-1 rounded-full bg-[#00a88f] animate-ping" />
        </div>
      </div>

      {/* Bottom Compact Placement Control */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-40 pointer-events-auto">
        <motion.div 
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-stone-900/95 text-white backdrop-blur-md p-3 rounded-2xl shadow-2xl border border-stone-800 flex items-center justify-between gap-2 sm:gap-3"
        >
          <button
            type="button"
            onClick={handleEdit}
            disabled={isSubmitting}
            className="px-4 py-3 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-bold text-xs flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 shrink-0"
          >
            <Pencil className="w-4 h-4 text-stone-400" />
            <span>Edit Note</span>
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="flex-1 py-3 px-4 bg-[#0d9488] hover:bg-[#0f766e] text-white rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{isCreating ? "Drop Here" : "Save Here"}</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="p-3 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 rounded-xl transition-colors active:scale-95 shrink-0"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </>
  );
};
