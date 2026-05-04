import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, EyeOff, Pencil, Share2, Check, Compass } from 'lucide-react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { Note } from '../types';
import { calculateBearing, calculateDistance } from '../lib/utils';
import { SpeechButton } from './SpeechButton';

export const ARView = ({ 
  notes, 
  userLocation, 
  heading, 
  user, 
  setView, 
  setEditingNote,
  copyToClipboard,
  copyStatus
}: { 
  notes: Note[], 
  userLocation: { lat: number, lng: number } | null, 
  heading: number | null,
  user: User | null,
  setView: (view: 'map' | 'ar' | 'anchor') => void,
  setEditingNote: (note: Note | null) => void,
  copyToClipboard: (id: string) => void,
  copyStatus: string | null
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const currentVideoRef = videoRef.current;
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (currentVideoRef) {
          currentVideoRef.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    }
    setupCamera();
    return () => {
      if (currentVideoRef?.srcObject) {
        (currentVideoRef.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        className="absolute inset-0 w-full h-full object-cover opacity-70"
      />
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {userLocation && heading !== null && notes
          .map(note => {
            const bearing = calculateBearing(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng);
            const distance = calculateDistance(userLocation.lat, userLocation.lng, note.location.lat, note.location.lng);
            const relativeBearing = (bearing - heading + 540) % 360 - 180;
            return { note, bearing, distance, relativeBearing };
          })
          .filter(item => Math.abs(item.relativeBearing) < 45 && item.distance < 100)
          .sort((a, b) => b.distance - a.distance) // Farthest first, rendered first (bottom)
          .map(({ note, distance, relativeBearing }) => {
            const x = (relativeBearing / 45) * 50 + 50; // percentage
            const scale = Math.max(0.2, (1 - (distance / 110)) * 2.5);
            const zIndex = Math.floor(100 - distance);
            
            return (
              <motion.div 
                key={note.id}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale }}
                className="absolute p-4 rounded-xl shadow-2xl border border-white/20 backdrop-blur-md text-white max-w-[200px] pointer-events-auto"
                style={{ 
                  left: `${x}%`, 
                  top: '40%',
                  backgroundColor: note.color || 'rgba(16, 185, 129, 0.8)',
                  transform: `translate(-50%, -50%)`,
                  zIndex
                }}
              >
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
                        {note.emoji ? (
                          <span className="text-sm">{note.emoji}</span>
                        ) : (
                          <UserIcon className="w-3 h-3" />
                        )}
                        <span className="text-[10px] font-semibold truncate max-w-[80px]">{note.authorId === user?.uid ? t('qr.view.you') : (note.authorName || 'Explorer')}</span>
                        {note.isPrivate && <EyeOff className="w-3 h-3 text-white/80" />}
                      </div>
                      <p className="text-sm font-medium line-clamp-4">{note.content}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      {note.authorId === user?.uid && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setView('map');
                            setEditingNote(note);
                          }}
                          className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all hover:scale-110"
                          title={t('ar.edit_note')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <SpeechButton text={note.content || ''} />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(note.id);
                        }}
                        className="p-1.5 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all hover:scale-110"
                        title={t('qr.view.share_link')}
                      >
                        {copyStatus === note.id ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                <p className="text-[10px] opacity-70">{Math.round(distance)}m {t('anchor.away')}</p>
              </motion.div>
            );
          })}
      </div>

      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-xs border border-white/10">
        <Compass className="w-3 h-3 animate-pulse" />
        <span>{heading !== null ? `${t('ar.heading')}${Math.round(heading)}°` : t('ar.calibrating')}</span>
      </div>
    </div>
  );
};
