import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { WordCard } from '../types';
import { useLang } from '../i18n';
import { speak, speakWordCard, stopPlayback, type TTSPlaybackPhase } from '../lib/tts';
import { isAIRequestError } from '../lib/api/errors';
import {
  buildAiVoiceLimitMessage,
  fillTemplate,
  resolveAiVoiceLimit,
} from '../lib/api/voiceLimitMessage';
import { showTopBanner } from '../lib/topBanner';

export type WordCardVoiceTarget = 'word' | 'meaning';
export type WordCardVoiceState = {
  target: WordCardVoiceTarget;
  phase: Exclude<TTSPlaybackPhase, 'idle'>;
};

interface Options {
  item?: WordCard | null;
  isSubscribed: boolean;
  isPremium: boolean;
  onCustomVoiceLocked?: () => void;
  /** BCP-47 tag, for the quota message's number and date formatting. */
  language?: string;
  /** Opens the Upgrade Plan sheet from a plan or quota alert. */
  onUpgrade?: () => void;
  /** The shared RevenueCat restore handler, offered when verification fails. */
  onRestorePurchases?: () => Promise<void> | void;
}

/** Shared playback state used by list cards and the Flip screen. */
export function useWordCardVoicePlayback({
  item,
  isSubscribed,
  isPremium,
  onCustomVoiceLocked,
  language = 'en-US',
  onUpgrade,
  onRestorePurchases,
}: Options) {
  const t = useLang();
  const [voiceState, setVoiceStateValue] = useState<WordCardVoiceState | null>(null);
  const voiceStateRef = useRef<WordCardVoiceState | null>(null);
  const sequenceRef = useRef(0);
  // Lets the Retry action in an error alert repeat the same request.
  const lastTargetRef = useRef<WordCardVoiceTarget | null>(null);
  // Set below, so the Retry action can call play() without handleError and play
  // depending on each other.
  const playRef = useRef<((target: WordCardVoiceTarget) => Promise<void>) | null>(null);

  const setVoiceState = useCallback((state: WordCardVoiceState | null) => {
    voiceStateRef.current = state;
    setVoiceStateValue(state);
  }, []);

  const stopVoice = useCallback(() => {
    sequenceRef.current++;
    stopPlayback();
    setVoiceState(null);
  }, [setVoiceState]);

  useEffect(() => () => {
    sequenceRef.current++;
    if (voiceStateRef.current) stopPlayback();
    voiceStateRef.current = null;
  }, []);

  /**
   * Turns a failed voice request into the right message.
   *
   * Branches on `AIRequestError.kind`, the precise classification, rather than
   * on the legacy message string. The old version collapsed several unrelated
   * failures into one hardcoded "speech service is temporarily unavailable"
   * line — which is why a rejected RevenueCat key looked like an OpenAI outage.
   * Only a genuine Worker or OpenAI failure says that now.
   */
  const handleError = useCallback((error: unknown) => {
    if (isAIRequestError(error) && error.kind === 'cancelled') return;
    const message = error instanceof Error ? error.message : '';
    if (message === 'cancelled') return;

    if (__DEV__) {
      // Codes and the Worker's request id only — never user text or a key.
      console.warn('[TTS] playback failed:', isAIRequestError(error)
        ? { kind: error.kind, serverCode: error.serverCode, requestId: error.requestId }
        : { message: message || 'unknown_error' });
    }

    const title = t('ai_voice_unavailable');
    // Action buttons appear only where the screen wired a handler; elsewhere
    // the alert is informational, which is still correct.
    const upgradeAction = onUpgrade
      ? [{ text: t('cancel'), style: 'cancel' as const }, { text: t('upgrade_plan'), onPress: onUpgrade }]
      : undefined;

    if (!isAIRequestError(error)) {
      // A non-API failure: decoding, file write or playback.
      Alert.alert(title, t('err_generation_failed'));
      return;
    }

    // Usage limits are not errors the user can act on beyond waiting, so they get
    // the non-blocking banner instead of a modal alert. Cached audio is untouched
    // by any of these — the limit is enforced per network request, and
    // fetchAndCacheAudio serves an existing file without one.
    const limit = resolveAiVoiceLimit(error, Date.now());
    if (limit) {
      const { key, values } = buildAiVoiceLimitMessage(limit, language);
      showTopBanner({ id: `voice-limit:${key}`, message: fillTemplate(t(key), values) });
      return;
    }

    switch (error.kind) {
      case 'subscription_required':
        // AI Voice needs Basic or Premium — an intentional plan boundary, not
        // an outage. Offer the upgrade rather than an error.
        Alert.alert(title, t('err_plan_required_speech'), upgradeAction);
        return;

      case 'monthly_limit_reached':
        // Only reachable when the Worker omitted the quota figures, so there is no
        // reset date to quote. The dated message is handled by the banner above.
        Alert.alert(t('err_voice_limit_title'), t('err_voice_limit_basic'), upgradeAction);
        return;

      case 'entitlement_unverified':
        // Purchase status could not be confirmed. Retrying or restoring is what
        // actually helps here, so offer both.
        Alert.alert(title, t('err_entitlement_unverified'), [
          { text: t('cancel'), style: 'cancel' },
          ...(onRestorePurchases
            ? [{ text: t('restore_purchases'), onPress: () => { void onRestorePurchases(); } }]
            : []),
          { text: t('retry'), onPress: () => { void playRef.current?.(lastTargetRef.current ?? 'word'); } },
        ]);
        return;

      case 'not_configured':
        Alert.alert(title, t('err_service_not_configured'));
        return;

      // Both reach here only without a Retry-After to count from. Still a usage
      // limit, so still the banner rather than a modal alert.
      case 'rate_limited':
        showTopBanner({ id: 'voice-limit:rate', message: t('err_rate_limited') });
        return;

      case 'usage_limited':
        showTopBanner({ id: 'voice-limit:usage', message: t('err_usage_limited') });
        return;

      case 'offline':
        Alert.alert(title, t('err_offline'));
        return;

      case 'timeout':
        Alert.alert(title, t('err_timeout'));
        return;

      case 'invalid_input':
        Alert.alert(title, t('err_input_too_long'));
        return;

      case 'service_unavailable':
      case 'generation_failed':
        // The only genuine "the service is down" case.
        Alert.alert(title, t('ai_service_unavailable_msg'));
        return;

      default:
        Alert.alert(title, t('ai_service_unavailable_msg'));
    }
  }, [language, onRestorePurchases, onUpgrade, t]);

  const play = useCallback(async (target: WordCardVoiceTarget) => {
    if (!item) return;
    lastTargetRef.current = target;
    const buttonPressedAtMs = performance.now();
    if (target === 'word' && item.audioUri && !isPremium) {
      onCustomVoiceLocked?.();
      return;
    }
    if (voiceStateRef.current?.target === target) {
      stopVoice();
      return;
    }

    const sequence = ++sequenceRef.current;
    setVoiceState({ target, phase: 'checking-cache' });
    if (__DEV__) console.log('[TTS playback stages]', {
      source: 'word-card',
      phase: 'subscription-permission-checks-complete',
      sinceButtonPressMs: Math.round(performance.now() - buttonPressedAtMs),
      usesAttachedAudio: target === 'word' ? Boolean(item.audioUri) : false,
      subscribed: isSubscribed,
    });

    try {
      const playbackOptions = {
        buttonPressedAtMs,
        onPhaseChange: (phase: TTSPlaybackPhase) => {
          if (sequenceRef.current !== sequence) return;
          setVoiceState(phase === 'idle' ? null : { target, phase });
        },
      };
      if (target === 'word') {
        await speakWordCard(item, isSubscribed, playbackOptions);
      } else {
        await speak(item.meaning, isSubscribed, item.meaningLang, playbackOptions);
      }
    } catch (error) {
      handleError(error);
    }
    if (sequenceRef.current === sequence) setVoiceState(null);
  }, [handleError, isPremium, isSubscribed, item, onCustomVoiceLocked, setVoiceState, stopVoice]);

  const playWord = useCallback(() => play('word'), [play]);
  const playMeaning = useCallback(() => play('meaning'), [play]);

  // Kept current so the Retry action in an error alert re-runs the request.
  playRef.current = play;

  return { voiceState, playWord, playMeaning, stopVoice };
}
