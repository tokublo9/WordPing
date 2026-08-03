import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import type { WordCard } from '../types';
import { useLang } from '../i18n';
import { speak, speakWordCard, stopPlayback, type TTSPlaybackPhase } from '../lib/tts';

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
}

/** Shared playback state used by list cards and the Flip screen. */
export function useWordCardVoicePlayback({
  item,
  isSubscribed,
  isPremium,
  onCustomVoiceLocked,
}: Options) {
  const t = useLang();
  const [voiceState, setVoiceStateValue] = useState<WordCardVoiceState | null>(null);
  const voiceStateRef = useRef<WordCardVoiceState | null>(null);
  const sequenceRef = useRef(0);

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

  const handleError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : '';
    if (message === 'cancelled') return;
    if (__DEV__) console.warn('[TTS] playback failed:', message || 'unknown_error');
    if (message === 'quota_exceeded') {
      Alert.alert(t('ai_voice_unavailable'), t('quota_exceeded_msg'));
    } else if (message === 'plan_required') {
      Alert.alert(t('ai_voice_unavailable'), t('err_plan_required_speech'));
    } else if (message === 'service_unavailable' || message === 'authentication_failed') {
      Alert.alert(
        t('ai_voice_unavailable'),
        'The speech service is temporarily unavailable. Please try again.',
      );
    }
  }, [t]);

  const play = useCallback(async (target: WordCardVoiceTarget) => {
    if (!item) return;
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

  return { voiceState, playWord, playMeaning, stopVoice };
}
