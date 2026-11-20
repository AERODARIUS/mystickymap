import React, { useState, useCallback, memo } from 'react';
import { Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { logAnalyticsEvent } from '../firebase';
import { ContentFormat } from '../types';
import { markdownToPlainText } from '../lib/richText';

export const SpeechButton = memo(({
  text,
  language = "en-US",
  className = "",
  contentFormat = "plain",
}: {
  text: string;
  language?: string;
  className?: string;
  contentFormat?: ContentFormat;
}) => {
  const { t } = useTranslation();
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback(() => {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const spokenText = markdownToPlainText(text, contentFormat);
    if (!spokenText) return;

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = language;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    logAnalyticsEvent('speech_play', { language });
    window.speechSynthesis.speak(utterance);
  }, [isSpeaking, text, language, contentFormat]);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        speak();
      }}
      className={`flex items-center justify-center p-2 rounded-full transition-all hover:scale-110 active:scale-95 ${
        isSpeaking 
          ? 'bg-emerald-100 text-emerald-600' 
          : className.includes('bg-') ? '' : 'bg-white/20 text-white hover:bg-white/30'
      } ${className}`}
      title={isSpeaking ? t('speech.stop') : t('speech.listen')}
    >
      <Volume2 className="w-3.5 h-3.5" />
    </button>
  );
});
