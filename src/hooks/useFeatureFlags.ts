import { useState, useEffect } from 'react';
import { remoteConfig, fetchAndActivate, getValue } from '../firebase';

export interface FeatureFlags {
  enableAudioNotes: boolean;
  enableARView: boolean;
  enableQRScanner: boolean;
  enableEmojiPins: boolean;
  maxNoteLength: number;
  highlightNoteColor: string;
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableAudioNotes: true,
  enableARView: true,
  enableQRScanner: true,
  enableEmojiPins: true,
  maxNoteLength: 500,
  highlightNoteColor: '#10b981', // Emerald 500
};

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initRemoteConfig() {
      try {
        // Set default values locally
        remoteConfig.defaultConfig = {
          enable_audio_notes: DEFAULT_FLAGS.enableAudioNotes,
          enable_ar_view: DEFAULT_FLAGS.enableARView,
          enable_qr_scanner: DEFAULT_FLAGS.enableQRScanner,
          enable_emoji_pins: DEFAULT_FLAGS.enableEmojiPins,
          max_note_length: DEFAULT_FLAGS.maxNoteLength,
          highlight_note_color: DEFAULT_FLAGS.highlightNoteColor,
        };

        // Fetch and activate
        await fetchAndActivate(remoteConfig);

        // Get values
        setFlags({
          enableAudioNotes: getValue(remoteConfig, 'enable_audio_notes').asBoolean(),
          enableARView: getValue(remoteConfig, 'enable_ar_view').asBoolean(),
          enableQRScanner: getValue(remoteConfig, 'enable_qr_scanner').asBoolean(),
          enableEmojiPins: getValue(remoteConfig, 'enable_emoji_pins').asBoolean(),
          maxNoteLength: getValue(remoteConfig, 'max_note_length').asNumber(),
          highlightNoteColor: getValue(remoteConfig, 'highlight_note_color').asString(),
        });
      } catch (error) {
        console.error('Error fetching remote config:', error);
      } finally {
        setLoading(false);
      }
    }

    initRemoteConfig();
  }, []);

  return { flags, loading };
}
