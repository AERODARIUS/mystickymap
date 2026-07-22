import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Share2, MessageCircle, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Logo } from './Logo';

interface QRCodeDisplayProps {
  noteId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeDisplay = ({ noteId, isOpen, onClose }: QRCodeDisplayProps) => {
  const { t } = useTranslation();
  const posterRef = useRef<HTMLDivElement>(null);
  const shareUrl = `${window.location.origin}/?noteId=${noteId}`;

  const downloadPosterPNG = () => {
    const svg = document.getElementById('poster-qr-code-svg');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `spotheon-afiche-${noteId}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-[#081e2b]/80 backdrop-blur-md"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative z-10 my-auto bg-white rounded-[32px] p-5 sm:p-6 shadow-2xl max-w-md w-full border-4 border-[#0d9488]/30 overflow-hidden"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-stone-100 text-stone-500 hover:text-stone-900 rounded-full transition-colors z-20"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Poster Canvas / Flyer Layout */}
            <div 
              ref={posterRef} 
              className="relative bg-white rounded-2xl p-4 sm:p-6 border-2 border-[#0d9488]/40 shadow-sm flex flex-col items-center overflow-hidden"
            >
              {/* Background Street Scene Line Art Illustration */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none opacity-20 text-[#0d9488]" 
                viewBox="0 0 320 440" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="1.2"
              >
                {/* Clouds */}
                <path d="M20 70 Q 30 60, 45 65 Q 55 50, 75 60 Q 85 55, 95 65 L 20 65 Z" fill="none" />
                <path d="M230 80 Q 240 70, 255 75 Q 265 60, 285 70 Q 295 65, 305 75 L 230 75 Z" fill="none" />
                
                {/* Bus Stop Shelter on Left */}
                <path d="M15 130 L 15 180 M 60 130 L 60 180 M 10 130 Q 35 120, 65 130 M 10 180 L 65 180" />
                <circle cx="35" cy="150" r="10" strokeDasharray="2 2" />
                <path d="M 30 150 L 40 150 M 35 145 L 35 155" />

                {/* Street Lamp on Right */}
                <path d="M280 180 L 280 120 Q 280 100, 260 105" />
                <path d="M255 108 L 265 118 L 255 118 Z" fill="#0d9488" opacity="0.3" />

                {/* Buildings Silhouette Background */}
                <path d="M250 180 L 250 110 L 290 110 L 290 180 M 260 120 H 280 M 260 135 H 280 M 260 150 H 280" />
                <path d="M290 180 L 290 130 L 315 130 L 315 180" />

                {/* Park Bench */}
                <path d="M230 220 H 260 M 230 225 H 260 M 235 225 V 235 M 255 225 V 235" />
                {/* Tree */}
                <path d="M280 235 V 205 Q 260 190, 280 175 Q 300 190, 280 205" />
              </svg>

              {/* SPOTHEON Logo Header */}
              <div className="mb-4 relative z-10 flex flex-col items-center">
                <Logo variant="full" showTagline={false} className="scale-90 sm:scale-100" />
              </div>

              {/* QR Code Frame Box */}
              <div className="relative z-10 bg-white p-4 sm:p-5 rounded-3xl border-3 border-[#00a88f] shadow-lg mb-5 flex items-center justify-center">
                <QRCodeSVG
                  id="poster-qr-code-svg"
                  value={shareUrl}
                  size={190}
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: "/icon-512.svg",
                    x: undefined,
                    y: undefined,
                    height: 42,
                    width: 42,
                    excavate: true,
                  }}
                />
              </div>

              {/* Headline */}
              <div className="relative z-10 text-center space-y-1 mb-5">
                <h2 className="text-2xl sm:text-3xl font-black text-[#081e2b] tracking-tight leading-none uppercase">
                  Anúnciate
                </h2>
                <div className="flex items-center justify-center gap-2">
                  <span className="text-3xl sm:text-4xl font-black text-[#00a88f] tracking-tight leading-none uppercase">
                    GRATIS
                  </span>
                  <span className="text-2xl sm:text-3xl font-black text-[#081e2b] tracking-tight leading-none lowercase">
                    aquí
                  </span>
                  {/* Ray Burst Accents */}
                  <svg className="w-5 h-5 text-[#00a88f]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="2" x2="12" y2="6" />
                    <line x1="12" y1="18" x2="12" y2="22" />
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                  </svg>
                </div>
              </div>

              {/* Feature Bullet Points */}
              <div className="relative z-10 w-full space-y-2.5 pt-3 border-t border-[#0d9488]/20">
                <div className="flex items-center gap-3 bg-[#f0fdfa] p-2.5 rounded-2xl border border-[#ccfbf1]">
                  <div className="w-9 h-9 rounded-full bg-[#ccfbf1] text-[#0d9488] flex items-center justify-center shrink-0">
                    <MessageCircle className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[#081e2b] text-left leading-tight">
                    Dejá un mensaje para quienes pasan por aquí.
                  </p>
                </div>

                <div className="flex items-center gap-3 bg-[#f0fdfa] p-2.5 rounded-2xl border border-[#ccfbf1]">
                  <div className="w-9 h-9 rounded-full bg-[#ccfbf1] text-[#0d9488] flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[#081e2b] text-left leading-tight">
                    Escaneá el QR.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex gap-3">
              <button
                onClick={downloadPosterPNG}
                className="flex-1 py-3.5 px-4 bg-[#081e2b] hover:bg-[#0e2a38] text-white rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
              >
                <Download className="w-5 h-5 text-[#00a88f]" />
                {t('qr.display.download')}
              </button>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: 'SPOTHEON - Anúnciate GRATIS aquí',
                      text: t('qr.display.share_text'),
                      url: shareUrl,
                    }).catch(console.error);
                  } else {
                    navigator.clipboard.writeText(shareUrl);
                  }
                }}
                className="p-3.5 bg-[#f0fdfa] text-[#0d9488] border border-[#ccfbf1] rounded-2xl hover:bg-[#ccfbf1] transition-colors"
                title="Share"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
            
            <p className="mt-3 text-[10px] text-stone-400 font-mono break-all text-center">
              {shareUrl}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

