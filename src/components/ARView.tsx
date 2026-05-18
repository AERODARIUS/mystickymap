import React, { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { User as UserIcon, Lock, Globe, Link, Pencil, Share2, Check, Compass, MessageSquare } from 'lucide-react';
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
  copyStatus,
  onShowComments
}: { 
  notes: Note[], 
  userLocation: { lat: number, lng: number } | null, 
  heading: number | null,
  user: User | null,
  setView: (view: 'map' | 'ar' | 'anchor') => void,
  setEditingNote: (note: Note | null) => void,
  copyToClipboard: (id: string) => void,
  copyStatus: string | null,
  onShowComments: (note: Note) => void
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
            // Enhanced scale calculation for better depth
            const scale = Math.max(0.3, Math.min(1.5, (1 - (distance / 100)) * 2));
            const zIndex = Math.floor(100 - distance);
            
            // Atmospheric perspective: more distance = more blur and less opacity
            const blurAmount = Math.min(4, (distance / 40));
            const opacity = Math.max(0.4, 1 - (distance / 100));
            
            return (
              <motion.div 
                key={note.id}
                initial={{ opacity: 0, scale: 0, y: 20 }}
                animate={{ 
                  opacity, 
                  scale,
                  x: "-50%",
                  y: "-50%",
                  backdropFilter: `blur(${blurAmount + 8}px)`, // baseline blur of 8px
                }}
                transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                className="absolute p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/30 text-white pointer-events-auto transition-colors duration-500"
                style={{ 
                  left: `${x}%`, 
                  top: '40%',
                  backgroundColor: note.color ? `${note.color}cc` : 'rgba(16, 185, 129, 0.6)',
                  zIndex,
                  maxWidth: 'min(300px, 85vw)', // Ensure it doesn't exceed 85% of device width
                }}
              >
                <motion.div 
                  animate={{ y: [0, -8, 0] }}
                  transition={{
                    duration: 3 + (note.id.charCodeAt(0) % 3),
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 opacity-90">
                        <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                          {note.emoji ? (
                            <span className="text-xs">{note.emoji}</span>
                          ) : (
                            <UserIcon className="w-3 h-3" />
                          )}
                        </div>
                        <span className="text-[11px] font-bold tracking-tight truncate">
                          {note.authorId === user?.uid ? t('qr.view.you') : (note.authorName || 'Explorer')}
                        </span>
                        <div className="flex items-center gap-1 opacity-60">
                          {note.privacy === 'private' && <Lock className="w-2.5 h-2.5" />}
                          {note.privacy === 'unlisted' && <Link className="w-2.5 h-2.5" />}
                          {note.privacy === 'public' && <Globe className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                      <p className="text-[13px] leading-snug font-medium line-clamp-4 break-words">
                        {note.content}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {note.authorId === user?.uid && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setView('map');
                            setEditingNote(note);
                          }}
                          className="p-1.5 rounded-xl bg-white/20 text-white hover:bg-white/40 border border-white/10 transition-all hover:scale-110 active:scale-95"
                          title={t('ar.edit_note')}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <SpeechButton text={note.content || ''} language={note.language} />
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowComments(note);
                        }}
                        className="p-1.5 rounded-xl bg-white/20 text-white hover:bg-white/40 border border-white/10 transition-all hover:scale-110 active:scale-95"
                        title={t('comments.reply')}
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(note.id);
                        }}
                        className="p-1.5 rounded-xl bg-white/20 text-white hover:bg-white/40 border border-white/10 transition-all hover:scale-110 active:scale-95"
                        title={t('qr.view.share_link')}
                      >
                        {copyStatus === note.id ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Share2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest">
                      {Math.round(distance)}m {t('anchor.away')}
                    </p>
                    <div className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
                  </div>
                </motion.div>
                
                {/* Visual anchor point shadow */}
                <div 
                  className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white/30 blur-[1px]"
                  style={{ opacity: 1 - (distance / 100) }}
                >
                  <div className="absolute inset-0 rounded-full animate-ping bg-white/20" />
                </div>
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
