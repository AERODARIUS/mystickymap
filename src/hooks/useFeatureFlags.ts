import { useState, useEffect } from 'react';
import { remoteConfig, fetchAndActivate, getValue } from '../firebase';

export interface FeatureFlags {
  enableAudioNotes: boolean;
  enableARView: boolean;
  enableQRScanner: boolean;
  enableEmojiPins: boolean;
  maxNoteLength: number;
  highlightNoteColor: string;
  enableModeration: boolean;
  enableAdminHub: boolean;
  riskScoreThreshold: number;
}

const DEFAULT_FLAGS: FeatureFlags = {
  enableAudioNotes: true,
  enableARView: true,
  enableQRScanner: true,
  enableEmojiPins: true,
  maxNoteLength: 500,
  highlightNoteColor: '#10b981', // Emerald 500
  enableModeration: true,
  enableAdminHub: true,
  riskScoreThreshold: 40,
};

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function initRemoteConfig() {
      if (!remoteConfig) {
        setFlags(DEFAULT_FLAGS);
        setLoading(false);
        return;
      }

      try {
        // Set default values locally
        remoteConfig.defaultConfig = {
          enable_audio_notes: DEFAULT_FLAGS.enableAudioNotes,
          enable_ar_view: DEFAULT_FLAGS.enableARView,
          enable_qr_scanner: DEFAULT_FLAGS.enableQRScanner,
          enable_emoji_pins: DEFAULT_FLAGS.enableEmojiPins,
          max_note_length: DEFAULT_FLAGS.maxNoteLength,
          highlight_note_color: DEFAULT_FLAGS.highlightNoteColor,
          enable_moderation: DEFAULT_FLAGS.enableModeration,
          enable_admin_hub: DEFAULT_FLAGS.enableAdminHub,
          risk_score_threshold: DEFAULT_FLAGS.riskScoreThreshold,
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
          enableModeration: getValue(remoteConfig, 'enable_moderation').asBoolean(),
          enableAdminHub: getValue(remoteConfig, 'enable_admin_hub').asBoolean(),
          riskScoreThreshold: getValue(remoteConfig, 'risk_score_threshold').asNumber(),
        });
      } catch (error) {
        // Silently catch installations, referer, network, or 403 errors and fall back to defaults
        if (error instanceof Error) {
          const msg = error.message.toLowerCase();
          if (msg.includes('403') || msg.includes('permission_denied') || msg.includes('installations') || msg.includes('fetch-client-network')) {
            console.info('Remote config unavailable in preview environment, using default feature flags.');
          } else {
            console.warn('Error fetching remote config:', error.message);
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
