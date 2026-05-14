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
        // Use a timeout or handle network failures gracefully as Remote Config fetch 
        // can be blocked in some preview/iframe environments
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
        // Only log if it's not a standard fetch failure or a configuration issue
        if (error instanceof Error) {
          const is403 = error.message.includes('403') || error.message.includes('remoteconfig/fetch-status');
          const isNetworkError = error.message.includes('fetch-client-network');

          if (is403) {
            console.warn('Remote Config fetch returned 403. This usually means the Remote Config API is not enabled in your Google Cloud Project or you haven\'t created the configuration in the Firebase Console yet. Using default feature flags.');
          } else if (!isNetworkError) {
            console.error('Error fetching remote config:', error.message);
          } else {
            console.info('Remote config fetch bypassed (network), using default feature flags.');
          }
        }
      } finally {
        setLoading(false);
      }
    }

    initRemoteConfig();
  }, []);

  return { flags, loading };
}
