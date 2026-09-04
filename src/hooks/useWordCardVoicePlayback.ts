import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { WordCard } from '../types';
import { useLang } from '../i18n';
import { speak, speakWordCard, stopPlayback, type TTSPlaybackPhase } from '../lib/tts';
import { isAIRequestError } from '../lib/api/errors';
import { ensureAIConsentForUserAction } from '../lib/aiConsentPrompt';
import {
  buildAiVoiceLimitMessage,
  fillTemplate,
  resolveAiVoiceLimit,
} from '../lib/api/voiceLimitMessage';
import { showTopBanner } from '../lib/topBanner';
import { resolveCardVoiceSource } from '../features/voice/cardVoiceSource';

export type WordCardVoiceTarget = 'word' | 'meaning';
export type WordCardVoiceState = {
  target: WordCardVoiceTarget;
  phase: Exclude<TTSPlaybackPhase, 'idle'>;
};

interface Options {
  item?: WordCard | null;
  /**
   * This card may use High-Quality AI Voice right now.
   *
   * Premium, or Basic while its one-time credits last — and false either way
   * once the user has chosen the free device voice. False falls back to device
   * TTS. Attached Custom Voice audio is local and available on every plan, so
   * it does not participate in this entitlement.
   */
  canUseAIVoice: boolean;
  /** BCP-47 tag, for the quota message's number and date formatting. */
  language?: string;
  /** Opens the Upgrade Plan sheet from a plan or quota alert. */
  onUpgrade?: () => void;
  /** The shared RevenueCat restore handler, offered when verification fails. */
  onRestorePurchases?: () => Promise<void> | void;
  /**
   * Basic's one-time AI Voice grant is spent.
   *
   * Its own handler rather than an alert, because the answer is a choice
   * between two plans, and because whichever the user makes has to survive the
   * dialog closing. Called only for a generation the Worker actually refused —
   * cached audio never gets here.
   */
  onVoiceCreditsExhausted?: (useFreeVoice: () => void) => void;
}

/** Shared playback state used by list cards and the Flip screen. */
export function useWordCardVoicePlayback({
  item,
  canUseAIVoice,
  language = 'en-US',
  onUpgrade,
  onRestorePurchases,
  onVoiceCreditsExhausted,
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

  /**
   * Abandon whatever this hook has playing or in flight.
   *
   * Bumping the sequence first is what keeps a request that is still resolving from
   * starting playback for a card the user has already left. `stopPlayback` is called
   * only when this hook is the one holding the audio, so a mounted list row can never
   * silence the screen in front of it.
   */
  const abandonPlayback = useCallback(() => {
    sequenceRef.current++;
    if (voiceStateRef.current) stopPlayback();
    voiceStateRef.current = null;
    setVoiceStateValue(null);
  }, []);

  useEffect(() => () => {
    sequenceRef.current++;
    if (voiceStateRef.current) stopPlayback();
    voiceStateRef.current = null;
  }, []);

  /**
   * Audio never outlives the card it belongs to.
   *
   * Every navigation path — a Flip swipe, a scrubber drag, a track tap, a delete,
   * Test Mode's advance — ends with the card this hook speaks for changing identity,
   * so one stop here covers all of them and no screen has to remember to do it. The
   * ref starts at the mounted card, so mounting never stops anything.
   */
  const itemId = item?.id ?? null;
  const spokenItemIdRef = useRef(itemId);
  useEffect(() => {
    if (spokenItemIdRef.current === itemId) return;
    spokenItemIdRef.current = itemId;
    abandonPlayback();
  }, [itemId, abandonPlayback]);

  /**
   * Speak the last requested side with device TTS, ignoring the plan.
   *
   * The fallback offered when Basic's credits run out. It reaches no network,
   * so it needs no entitlement and no consent, and it is exactly what a Free
   * user's voice button already does.
   */
  const speakOnDevice = useCallback(async () => {
    const target = lastTargetRef.current;
    if (!item || target === null) return;
    const sequence = ++sequenceRef.current;
    setVoiceState({ target, phase: 'checking-cache' });
    const playbackOptions = {
      onPhaseChange: (phase: TTSPlaybackPhase) => {
        if (sequenceRef.current !== sequence) return;
        setVoiceState(phase === 'idle' ? null : { target, phase });
      },
    };
    try {
      if (target === 'word') await speakWordCard(item, false, playbackOptions);
      else await speak(item.meaning, false, item.meaningLang, playbackOptions);
    } catch {
      // Device TTS failing is not worth a second dialog on top of the first.
    }
    if (sequenceRef.current === sequence) setVoiceState(null);
  }, [item, setVoiceState]);

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

      case 'voice_credits_exhausted':
        // Not an outage and not something to retry: the grant is spent and
        // does not come back. The dialog owns both ways forward, and is handed
        // the replay so that choosing the free voice speaks the word the user
        // actually asked for rather than only changing a setting.
        onVoiceCreditsExhausted?.(() => { void speakOnDevice(); });
        return;

      case 'consent_required':
        // The prompt above normally means this never surfaces. If it does, the
        // request was refused on the device and nothing was sent, so say that
        // rather than blaming the service.
        Alert.alert(title, t('ai_consent_required_msg'));
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
  }, [language, onRestorePurchases, onUpgrade, onVoiceCreditsExhausted, speakOnDevice, t]);

  const play = useCallback(async (target: WordCardVoiceTarget) => {
    if (!item) return;
    lastTargetRef.current = target;
    const buttonPressedAtMs = performance.now();
    if (voiceStateRef.current?.target === target) {
      stopVoice();
      return;
    }

    // A different side of the card, while something is still playing. The engine would
    // stop it anyway when the new clip claims audio focus, but that is after the
    // consent check and the cache lookup — and the old clip belongs to text the user
    // has already turned away from.
    if (voiceStateRef.current) abandonPlayback();

    // Claimed before the consent prompt rather than after it: flipping the card or
    // swiping to the next one while the dialog is open must abandon this request, not
    // let it start speaking a word that is no longer on screen.
    const sequence = ++sequenceRef.current;

    // Only the AI-Voice path reaches OpenAI. Device TTS is expo-speech on the
    // device and a card's attached audio is a local file, so neither asks for
    // anything: a non-AI feature must keep working without consent. Basic now
    // reaches the AI path while its one-time credits last, and returns to the
    // device path if the user chooses the free voice when they run out.
    const usesAI = canUseAIVoice && !(target === 'word' && Boolean(item.audioUri));
    if (usesAI && !await ensureAIConsentForUserAction()) return;
    if (sequenceRef.current !== sequence) return;

    setVoiceState({ target, phase: 'checking-cache' });
    if (__DEV__) console.log('[TTS playback stages]', {
      source: 'word-card',
      phase: 'subscription-permission-checks-complete',
      sinceButtonPressMs: Math.round(performance.now() - buttonPressedAtMs),
      usesAttachedAudio: target === 'word' ? Boolean(item.audioUri) : false,
      aiVoice: canUseAIVoice,
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
        await speakWordCard(item, canUseAIVoice, playbackOptions);
      } else {
        await speak(item.meaning, canUseAIVoice, item.meaningLang, playbackOptions);
      }
    } catch (error) {
      handleError(error);
    }
    if (sequenceRef.current === sequence) setVoiceState(null);
  }, [abandonPlayback, canUseAIVoice, handleError, item, setVoiceState, stopVoice]);

  const playWord = useCallback(() => play('word'), [play]);
  const playMeaning = useCallback(() => play('meaning'), [play]);

  // Kept current so the Retry action in an error alert re-runs the request.
  playRef.current = play;

  /**
   * What the word-side button will play, so it can draw the matching icon.
   *
   * Derived from the same predicate `speakWordCard` routes on, so a word with a
   * registered file always shows the custom glyph and always plays that file.
   * The meaning side never has one, so callers leave its button at the default.
   */
  const wordVoiceSource = resolveCardVoiceSource(item, 'word');

  return { voiceState, playWord, playMeaning, stopVoice, wordVoiceSource };
}
