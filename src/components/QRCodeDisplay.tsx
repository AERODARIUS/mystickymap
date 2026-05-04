import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Download, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface QRCodeDisplayProps {
  noteId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const QRCodeDisplay = ({ noteId, isOpen, onClose }: QRCodeDisplayProps) => {
  const { t } = useTranslation();
  // Generate a URL that can be scanned
  const shareUrl = `${window.location.origin}/?noteId=${noteId}`;

  const downloadQR = () => {
    const svg = document.getElementById('qr-code-svg');
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
        downloadLink.download = `note-qr-${noteId}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative bg-white rounded-3xl p-8 shadow-2xl max-w-sm w-full text-center"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-stone-400 hover:text-stone-900 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <h3 className="text-xl font-black text-stone-900 mb-2">{t('qr.display.title')}</h3>
            <p className="text-sm text-stone-500 mb-6 italic">{t('qr.display.description')}</p>

            <div className="bg-stone-50 p-6 rounded-2xl inline-block mb-6 shadow-inner border border-stone-100">
              <QRCodeSVG
                id="qr-code-svg"
                value={shareUrl}
                size={200}
                level="H"
                includeMargin={true}
                imageSettings={{
                  src: "/favicon.ico", // Or any logo
                  x: undefined,
                  y: undefined,
                  height: 40,
                  width: 40,
                  excavate: true,
                }}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={downloadQR}
                className="flex-1 py-3 px-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 transition-colors"
              >
                <Download className="w-5 h-5" />
                {t('qr.display.download')}
              </button>
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: t('qr.display.title'),
                      text: t('qr.display.share_text'),
                      url: shareUrl,
                    }).catch(console.error);
                  }
                }}
                className="p-3 bg-stone-100 text-stone-600 rounded-2xl hover:bg-stone-200 transition-colors"
              >
                <Share2 className="w-5 h-5" />
              </button>
            </div>
            
            <p className="mt-4 text-[10px] text-stone-400 font-mono break-all">
              {shareUrl}
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
