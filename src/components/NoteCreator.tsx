import React, { useState, useRef } from 'react';
import { X, Languages, EyeOff, Eye, Mic, Square, Send, Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { db, auth, handleFirestoreError, OperationType, serverTimestamp } from '../firebase';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { Note, SUPPORTED_LANGUAGES } from '../types';
import { SpeechRecognition, SpeechRecognitionErrorEvent, SpeechRecognitionEvent, SpeechRecognitionConstructor } from '../types/dom';

const RecognitionConstructor = (typeof window !== 'undefined') 
  ? ((window as unknown as { SpeechRecognition: SpeechRecognitionConstructor; webkitSpeechRecognition: SpeechRecognitionConstructor }).SpeechRecognition || (window as unknown as { SpeechRecognition: SpeechRecognitionConstructor; webkitSpeechRecognition: SpeechRecognitionConstructor }).webkitSpeechRecognition) 
  : null;

export const NoteCreator = ({ 
  draftLocation, 
  onNoteCreated,
  color,
  setColor,
  emoji,
  setEmoji,
  editingNote
}: { 
  draftLocation: { lat: number, lng: number } | null, 
  onNoteCreated: () => void,
  color: string,
  setColor: (color: string) => void,
  emoji: string,
  setEmoji: (emoji: string) => void,
  editingNote?: Note | null
}) => {
  const { t } = useTranslation();
  const { flags } = useFeatureFlags();
  const [content, setContent] = useState(editingNote?.content || '');
  const [language, setLanguage] = useState(editingNote?.language || navigator.language || 'en-US');
  const [isPrivate, setIsPrivate] = useState(editingNote?.isPrivate ?? false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const allEmojis = [
    // Smileys
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕',
    // Hearts & Symbols
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '☮️', '✝️', '☪️', '🕉️', '☸️', '✡️', '🔯', '🕎', '☯️', '☦️', '🛐', '⛎', '♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓', '🆔', '⚛️', '🉑', '☢️', '☣️', '📴', '📳', '🈶', '🈚', '🈸', '🈺', '🈷️', '✴️', '🆚', '💮', '🉐', '㊙️', '㊗️', '🈴', '🈵', '🈹', '🈲', '🅰️', '🅱️', '🆎', '🆏', '🅾️', '🆘', '❌', '⭕', '🛑', '⛔', '📛', '🚫', '💯', '💢', '♨️', '🚷', '🚯', '🚳', '🚱', '🔞', '📵', '🚭', '❗', '❕', '❓', '❔', '‼️', '⁉️', '🔅', '🔆', '🔱', '⚜️', '〽️', '⚠️', '🚸', '🔰', '♻️', '🈯', '💹', '❇️', '✳️', '❎', '✅', '💠', '🌀', '➿', '🌐', 'Ⓜ️', '🏧', '🈂️', '🛂', 'Customs', '🛃', 'Baggage', '🛄', '🛅',
    // Activities & Objects
    '📝', '🔥', '💡', '💬', '🏠', '📍', '🗺️', '📸', '🎨', '🎉', '⭐', '✨', '🌈', '☀️', '🌙', '☁️', '❄️', '🍔', '🍕', '🍺', '☕', '🏢', '🚗', '🚲', '⚡', '👣', '🎒', '🧗', '🐕', '🐱', '🌳', '🌊', '⚽', '🏀', '🎮', '🎧', '📱', '💻', '⌚', '🎁', '🎈', '🛒', '🔑', '🔒', '💎', '💰'
  ];

  // Audio transcription state
  const [isRecording, setIsRecording] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSpeechSupported] = useState(!!RecognitionConstructor && flags.enableAudioNotes);
  const [speechDetected, setSpeechDetected] = useState(false);
  const [isEmojiPopoverOpen, setIsEmojiPopoverOpen] = useState(false);
  const emojiPopoverRef = useRef<HTMLDivElement>(null);

  // Close emoji popover when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (emojiPopoverRef.current && !emojiPopoverRef.current.contains(event.target as Node)) {
        setIsEmojiPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const startRecording = () => {
    if (!RecognitionConstructor) {
      alert("Your browser does not support voice recognition. Please try Chrome or Safari.");
      return;
    }

    try {
      const recognition = new RecognitionConstructor() as SpeechRecognition;
      recognitionRef.current = recognition;
      
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setSpeechDetected(false);
      };

      recognition.onspeechstart = () => {
        setSpeechDetected(true);
      };

      recognition.onspeechend = () => {
        setSpeechDetected(false);
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') return;
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
        setSpeechDetected(false);
        if (event.error === 'not-allowed') {
          alert("Microphone access denied. Please enable permissions.");
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        setSpeechDetected(false);
        setInterimTranscript('');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        setSpeechDetected(true);
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        if (final) {
          setContent(prev => {
            const current = prev.trim();
            const addition = final.trim();
            return current ? `${current} ${addition}` : addition;
          });
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognition.start();
    } catch (err) {
      console.error("Error starting speech recognition:", err);
      alert("Could not start voice recognition.");
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftLocation || !auth.currentUser || !content.trim()) return;

    setIsSubmitting(true);
    try {
      const noteData = {
        type: 'text',
        content: content.trim(),
        location: draftLocation,
        authorId: auth.currentUser.uid,
        authorName: (auth.currentUser.displayName || 'Explorer').substring(0, 100),
        isPrivate,
        createdAt: editingNote ? editingNote.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        color,
        emoji,
        language
      };

      if (editingNote) {
        await updateDoc(doc(db, 'notes', editingNote.id), noteData);
      } else {
        await addDoc(collection(db, 'notes'), noteData);
      }
      
      setContent('');
      onNoteCreated();
    } catch (error) {
      handleFirestoreError(error, editingNote ? OperationType.UPDATE : OperationType.CREATE, 'notes');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-t-3xl shadow-2xl border-t border-stone-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="font-bold text-stone-900 whitespace-nowrap">
            {editingNote ? t('creator.edit_note') : t('creator.new_note')}
          </h3>
          <div className="flex gap-1.5">
            {['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'].map(c => (
              <button 
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-stone-900 scale-110' : 'border-stone-100'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        {flags.enableEmojiPins && (
          <div className="relative" ref={emojiPopoverRef}>
            <button
              type="button"
              onClick={() => setIsEmojiPopoverOpen(!isEmojiPopoverOpen)}
              className="p-2 bg-stone-100 hover:bg-stone-200 rounded-xl transition-colors flex items-center gap-2"
            >
              <span className="text-xl leading-none">{emoji}</span>
              <Smile className="w-4 h-4 text-stone-500" />
            </button>

            {isEmojiPopoverOpen && (
              <div className="absolute right-0 bottom-full mb-2 bg-white p-3 rounded-2xl shadow-xl border border-stone-100 z-50 grid grid-cols-6 gap-1 animate-in fade-in zoom-in-95 duration-100 w-max max-w-[300px] max-h-64 overflow-y-auto scrollbar-thin">
                {allEmojis.map((e, index) => (
                  <button
                    key={`${e}-${index}`}
                    type="button"
                    onClick={() => {
                      setEmoji(e);
                      setIsEmojiPopoverOpen(false);
                    }}
                    className={`text-xl p-2 rounded-xl transition-all hover:bg-stone-100 flex items-center justify-center ${emoji === e ? 'bg-stone-100 scale-110' : ''}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative group">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={isRecording ? t('creator.listening') : t('creator.placeholder')}
            className={`w-full p-4 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all resize-none h-40 text-stone-800 ${isRecording ? 'ring-2 ring-emerald-100' : ''}`}
            maxLength={flags.maxNoteLength}
          />
          
          {interimTranscript && isRecording && (
            <div className="absolute top-1/2 left-4 right-4 -translate-y-1/2 pointer-events-none">
              <p className="text-stone-400 italic text-sm animate-pulse line-clamp-2 bg-white/40 p-2 rounded-lg backdrop-blur-sm">
                "{interimTranscript}"
              </p>
            </div>
          )}

          <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
            {isRecording && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-full border border-emerald-100 shadow-sm animate-in fade-in slide-in-from-top-1">
                <div className={`w-1.5 h-1.5 rounded-full ${speechDetected ? 'bg-emerald-500 scale-125 transition-transform duration-75' : 'bg-emerald-200'} `} />
                <span className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider">
                  {speechDetected ? t('creator.speech') : t('creator.waiting')}
                </span>
              </div>
            )}
            {!isRecording && content.length > 0 && (
              <button 
                type="button"
                onClick={() => setContent('')}
                className="p-1.5 bg-stone-100 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-200 transition-colors"
                title={t('creator.clear_text')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Controls and Stats below Textarea */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-xs font-mono font-medium px-2 py-2 rounded-xl border transition-colors ${
              content.length >= (flags.maxNoteLength * 0.9) ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-stone-50 border-stone-200 text-stone-400'
            }`}>
              {content.length} / {flags.maxNoteLength}
            </span>

            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all text-xs font-bold ${
                isPrivate 
                  ? 'bg-rose-50 border-rose-100 text-rose-600' 
                  : 'bg-emerald-50 border-emerald-100 text-emerald-600'
              }`}
            >
              {isPrivate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {isPrivate ? t('creator.private') : t('creator.public')}
            </button>

            {isSpeechSupported && (
              <>
                <div className="w-full h-0" />
                <button
                  type="button"
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`p-2 rounded-xl transition-all shadow-sm ${
                    isRecording 
                      ? 'bg-red-600 text-white animate-pulse' 
                      : 'bg-red-500 text-white hover:bg-red-600 transform hover:scale-105'
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-5 h-5 fill-current" />
                  ) : (
                    <Mic className="w-5 h-5" />
                  )}
                </button>
              </>
            )}

            <div className="flex items-center gap-2 bg-stone-50 px-3 py-2 rounded-xl border border-stone-200">
              <Languages className="w-4 h-4 text-stone-400" />
              <select 
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="text-xs bg-transparent outline-none font-medium text-stone-600 appearance-none cursor-pointer pr-1"
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.code}>{lang.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className="w-full py-4 bg-stone-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSubmitting ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-5 h-5" />}
          {isSubmitting ? t('creator.dropping') : t('creator.drop_note_here')}
        </button>
      </form>
    </div>
  );
};
