import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { User as UserIcon, EyeOff, Share2, Check, X, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User } from 'firebase/auth';
import { Note } from '../types';
import { SpeechButton } from './SpeechButton';

interface QRNotesViewProps {
  notes: Note[];
  user: User | null;
  copyToClipboard: (id: string) => void;
  copyStatus: string | null;
}

export const QRNotesView = ({
  notes,
  user,
  copyToClipboard,
  copyStatus
}: QRNotesViewProps) => {
  const { t } = useTranslation();
  const [scannedNote, setScannedNote] = useState<Note | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader";

  useEffect(() => {
    const html5QrCode = new Html5Qrcode(scannerId);
    qrRef.current = html5QrCode;

    const startScanning = async () => {
      try {
        await html5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            // Process QR code text
            // Could be just the ID or a URL like https://.../?noteId=XXXX
            let noteId = decodedText;
            try {
              const url = new URL(decodedText);
              const idFromUrl = url.searchParams.get('noteId');
              if (idFromUrl) noteId = idFromUrl;
            } catch {
              // Not a URL, use raw text as ID
            }

            const note = notes.find(n => n.id === noteId);
            if (note) {
              setScannedNote(note);
              setIsScanning(false);
              // Stop scanning temporarily when a note is found
              html5QrCode.pause();
            }
          },
          () => {
            // Error scanning, usually just "no code found" in this frame
          }
        );
      } catch (err) {
        console.error("Error starting QR scanner:", err);
      }
    };

    startScanning();

    return () => {
      if (html5QrCode.isScanning) {
        html5QrCode.stop().catch(err => console.error("Error stopping QR scanner:", err));
      }
    };
  }, [notes]);

  const resumeScanning = () => {
    setScannedNote(null);
    setIsScanning(true);
    if (qrRef.current) {
      qrRef.current.resume();
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* QR Scanner Target */}
      <div id={scannerId} className="absolute inset-0 w-full h-full" />
      
      {/* Overlay for UI */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {isScanning && (
          <div className="border-2 border-emerald-500/50 w-64 h-64 rounded-3xl animate-pulse flex items-center justify-center">
            <QrCode className="w-12 h-12 text-emerald-500/30" />
          </div>
        )}

        <AnimatePresence>
          {scannedNote && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8, y: 50, rotate: -3 }}
              animate={{ opacity: 1, scale: 1, y: 0, rotate: 2 }}
              exit={{ opacity: 0, scale: 0.8, y: 50 }}
              className="absolute p-6 rounded-2xl shadow-2xl border border-white/20 text-white max-w-[300px] pointer-events-auto"
              style={{
                backgroundColor: scannedNote.color || '#10b981',
              }}
            >
              {/* Sticky Note Pin Head Effect */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-red-500 rounded-full shadow-inner border-2 border-red-600" />
              
              <div className="relative pt-2">
                <button 
                  onClick={resumeScanning}
                  className="absolute -top-2 -right-2 p-1 bg-black/20 hover:bg-black/40 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex justify-between items-start gap-4 mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 opacity-80">
                      <UserIcon className="w-4 h-4" />
                      <span className="text-xs font-bold truncate max-w-[150px]">
                        {scannedNote.authorId === user?.uid ? t('qr.view.you') : (scannedNote.authorName || 'Explorer')}
                      </span>
                      {scannedNote.isPrivate && <EyeOff className="w-4 h-4 text-white/80" />}
                    </div>
                    <p className="text-lg font-handwriting leading-relaxed italic">
                      "{scannedNote.content}"
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <SpeechButton text={scannedNote.content || ''} language={scannedNote.language} />
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(scannedNote.id);
                      }}
                      className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all hover:scale-110"
                      title={t('qr.view.share_link')}
                    >
                      {copyStatus === scannedNote.id ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-white/20 flex justify-between items-center text-[10px] opacity-70 font-bold uppercase tracking-wider">
                  <span>{new Date(scannedNote.createdAt.toDate()).toLocaleDateString()}</span>
                  <span>{t('qr.view.captured_via')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-xs border border-white/10">
        <QrCode className="w-3 h-3 animate-pulse text-emerald-400" />
        <span>{t('qr.view.scan_title')}</span>
      </div>
    </div>
  );
};
