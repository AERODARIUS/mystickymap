import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { User as UserIcon, EyeOff, Share2, Check, X, QrCode, Link, Flashlight, AlertCircle, Globe, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { User } from 'firebase/auth';
import { Note } from '../types';
import { SpeechButton } from './SpeechButton';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface QRNotesViewProps {
  notes: Note[];
  user: User | null;
  copyToClipboard: (id: string) => void;
  copyStatus: string | null;
  onShowComments: (note: Note) => void;
}

export const QRNotesView = ({
  notes,
  user,
  copyToClipboard,
  copyStatus,
  onShowComments
}: QRNotesViewProps) => {
  const { t } = useTranslation();
  const [scannedNote, setScannedNote] = useState<Note | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [torchSupported, setTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [scanError, setScanError] = useState(false);
  const qrRef = useRef<Html5Qrcode | null>(null);
  const scannerId = "qr-reader";

  const notesRef = useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

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
          async (decodedText) => {
            // Process QR code text
            let noteId = decodedText.trim();
            let isMalformed = false;
            try {
              if (noteId.startsWith('http')) {
                const url = new URL(noteId);
                const idFromUrl = url.searchParams.get('noteId');
                if (idFromUrl) {
                  noteId = idFromUrl.trim();
                } else {
                  isMalformed = true;
                }
              } else {
                // If it's not a URL, check simple length constraint
                if (!noteId || noteId.length < 5 || noteId.length > 100) {
                  isMalformed = true;
                }
              }
            } catch {
              isMalformed = true;
            }

            if (isMalformed) {
              setScanError(true);
              setIsScanning(false);
              if (html5QrCode.getState() === 2) {
                html5QrCode.pause();
              }
              return;
            }

            const note = notesRef.current.find(n => n.id === noteId);
            if (note) {
              setScannedNote(note);
              setScanError(false);
              setIsScanning(false);
              if (html5QrCode.getState() === 2) {
                html5QrCode.pause();
              }
            } else {
              // Not in shared notes list, try fetching directly (e.g. Unlisted notes)
              try {
                const docSnap = await getDoc(doc(db, 'notes', noteId));
                if (docSnap.exists()) {
                  const data = docSnap.data();
                  const privacy = data.privacy;
                  const isNotePrivate = privacy === 'private';
                  const isMine = data.authorId === user?.uid;

                  // If it's private and not mine, treat it as not found/not accessible
                  if (isNotePrivate && !isMine) {
                    setScanError(true);
                    setIsScanning(false);
                    if (html5QrCode.getState() === 2) {
                      html5QrCode.pause();
                    }
                  } else {
                    setScannedNote({ id: docSnap.id, ...data } as Note);
                    setScanError(false);
                    setIsScanning(false);
                    if (html5QrCode.getState() === 2) {
                      html5QrCode.pause();
                    }
                  }
                } else {
                  setScanError(true);
                  setIsScanning(false);
                  if (html5QrCode.getState() === 2) {
                    html5QrCode.pause();
                  }
                }
              } catch (err) {
                setScanError(true);
                setIsScanning(false);
                if (html5QrCode.getState() === 2) {
                  html5QrCode.pause();
                }
                console.error("Error fetching note:", err);
              }
            }
          },
          () => {
            // Error scanning
          }
        );

        // Check for torch support
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const capabilities = html5QrCode.getRunningTrackCapabilities() as any;
          if (capabilities && capabilities.torch) {
            setTorchSupported(true);
          }
        } catch (e) {
          console.warn("Torch capabilities not available", e);
        }
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
  }, [user?.uid]);

  const resumeScanning = () => {
    setScannedNote(null);
    setScanError(false);
    setIsScanning(true);
    if (qrRef.current) {
      // Check if paused before resuming to avoid the "Cannot resume" error
      try {
        // html5-qrcode state: 3 is PAUSED
        if (qrRef.current.getState() === 3) {
          qrRef.current.resume();
        }
      } catch (err) {
        console.warn("Could not resume QR scanner:", err);
      }
    }
  };

  const toggleTorch = async () => {
    if (!qrRef.current || !torchSupported) return;
    try {
      const nextTorch = !isTorchOn;
      await qrRef.current.applyVideoConstraints({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        advanced: [{ torch: nextTorch }] as any
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.error("Error toggling torch:", err);
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      {/* QR Scanner Target */}
      <div id={scannerId} className="absolute inset-0 w-full h-full" />
      
      {/* Overlay for UI */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {isScanning && !scanError && (
          <div className="border-2 border-emerald-500/50 w-64 h-64 rounded-3xl animate-pulse flex items-center justify-center">
            <QrCode className="w-12 h-12 text-emerald-500/30" />
          </div>
        )}

        <AnimatePresence>
          {scanError && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="absolute p-6 rounded-2xl bg-red-500/90 backdrop-blur-md shadow-2xl border border-white/20 text-white max-w-[280px] pointer-events-auto text-center"
            >
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-white animate-bounce" />
              <p className="text-sm font-bold mb-4">
                {t('qr.view.not_found')}
              </p>
              <button 
                onClick={resumeScanning}
                className="px-6 py-2 bg-white text-red-600 rounded-full font-bold hover:bg-gray-100 transition-colors"
              >
                {t('qr.view.retry')}
              </button>
            </motion.div>
          )}

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
                      { scannedNote.privacy === 'private' && <EyeOff className="w-4 h-4 text-white/80" /> }
                      { scannedNote.privacy === 'unlisted' && <Link className="w-4 h-4 text-white/80" /> }
                      { scannedNote.privacy === 'public' && <Globe className="w-4 h-4 text-white/80" /> }
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
                        onShowComments(scannedNote);
                      }}
                      className="p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-all hover:scale-110"
                      title={t('comments.reply')}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </button>
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
                  <span>{scannedNote.createdAt?.toDate ? new Date(scannedNote.createdAt.toDate()).toLocaleDateString() : 'Recent'}</span>
                  <span>{t('qr.view.captured_via')}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-4">
        <div className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-xs border border-white/10">
          <QrCode className="w-3 h-3 animate-pulse text-emerald-400" />
          <span>{t('qr.view.scan_title')}</span>
        </div>

        {torchSupported && isScanning && (
          <button
            onClick={toggleTorch}
            className={`p-3 rounded-full transition-all border ${
              isTorchOn 
                ? 'bg-yellow-400 text-black border-yellow-500 shadow-[0_0_15px_rgba(250,204,21,0.5)]' 
                : 'bg-black/40 text-white border-white/10'
            }`}
            title={t('qr.view.toggle_torch')}
          >
            <Flashlight className={`w-5 h-5 ${isTorchOn ? 'fill-current' : ''}`} />
          </button>
        )}
      </div>
    </div>
  );
};
