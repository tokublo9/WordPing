import { MAX_AI_INPUT_CHARS } from '../constants';
import { DEFAULT_AI_VOICE, type AIVoice } from './aiVoices';
import { requestAISpeech } from './openaiGateway';
import { claimAudioFocus, releaseAudioFocus } from './audioFocus';

// expo-audio is lazy-required so that a missing native module (e.g. in an
// older Expo Go build) throws at call-time rather than at module evaluation.
function audioLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-audio') as typeof import('expo-audio');
}

function speechLib() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-speech') as typeof import('expo-speech');
}

type AudioPlayer = import('expo-audio').AudioPlayer;
type AudioStatus = import('expo-audio').AudioStatus;

// ── Module-level singleton state ─────────────────────────────────────────────

let currentPlayer: AudioPlayer | null = null;
let activePlaybackKey: string | null = null;
let stopActivePlayer: (() => void) | null = null;
let focusToken: symbol | null = null;

// Incremented on every speakWithAI call; lets us detect when a concurrent
// call superseded us during an async gap (e.g. the network fetch).
let epoch = 0;
let activeAIVoice: AIVoice = DEFAULT_AI_VOICE;

// ── Audio cache ───────────────────────────────────────────────────────────────

const base64Cache = new Map<string, string>();
const inFlight   = new Map<string, Promise<string>>();

function fetchBase64(text: string, voice: AIVoice): Promise<string> {
  if (!text.trim()) return Promise.reject(new Error('input_empty'));
  if (text.length > MAX_AI_INPUT_CHARS) return Promise.reject(new Error('input_too_long'));
  const cacheKey = `${voice}\u0000${text}`;
  if (base64Cache.has(cacheKey)) return Promise.resolve(base64Cache.get(cacheKey)!);
  if (inFlight.has(cacheKey))   return inFlight.get(cacheKey)!;

  const p = (async () => {
    try {
      const b64 = await requestAISpeech(text, voice);
      if (base64Cache.size >= 40) base64Cache.delete(base64Cache.keys().next().value!);
      base64Cache.set(cacheKey, b64);
      return b64;
    } finally {
      inFlight.delete(cacheKey);
    }
  })();

  inFlight.set(cacheKey, p);
  return p;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stopCurrent() {
  const stop = stopActivePlayer;
  stopActivePlayer = null;
  if (stop) {
    stop();
  } else if (currentPlayer) {
    // Native expo-audio's remove() only unregisters the player; it does not
    // pause the underlying AVPlayer/ExoPlayer, so pause explicitly first.
    try { currentPlayer.pause(); } catch {}
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
  // Also stop any active device TTS session.
  try { speechLib().stop(); } catch {}
  releaseAudioFocus(focusToken);
  focusToken = null;
}

function beginPlayback(key: string): number | null {
  if (activePlaybackKey === key) {
    stopCurrent();
    activePlaybackKey = null;
    epoch++;
    return null;
  }

  stopCurrent();
  activePlaybackKey = key;
  focusToken = claimAudioFocus(stopPlayback);
  return ++epoch;
}

function finishPlayback(key: string, playbackEpoch: number) {
  if (epoch === playbackEpoch && activePlaybackKey === key) {
    activePlaybackKey = null;
    releaseAudioFocus(focusToken);
    focusToken = null;
  }
}

// ── Device TTS (free users) ───────────────────────────────────────────────────

/**
 * Detect the BCP-47 locale to use for device TTS based on the text content.
 * Uses Unicode script ranges so English words are always read with an English
 * voice even if the app UI language is set to Japanese (or any other language).
 */
function detectLocale(text: string): string {
  // Japanese: hiragana (U+3040–309F) or katakana (U+30A0–30FF)
  if (/[぀-ヿ]/.test(text)) return 'ja-JP';
  // Korean: Hangul syllables (U+AC00–D7AF) and Hangul Jamo (U+1100–11FF)
  if (/[가-힯ᄀ-ᇿ]/.test(text)) return 'ko-KR';
  // CJK Unified Ideographs — without kana already caught above, treat as Chinese
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh-CN';
  // Arabic script
  if (/[؀-ۿ]/.test(text)) return 'ar';
  // Default to English for Latin-based scripts
  return 'en-US';
}

function speakFree(text: string, locale: string): Promise<void> {
  const playbackKey = `device:${locale}:${text}`;
  const playbackEpoch = beginPlayback(playbackKey);
  if (playbackEpoch == null) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      finishPlayback(playbackKey, playbackEpoch);
      resolve();
    };

    // Try with the full locale first; if the device doesn't have that voice,
    // fall back to the bare language subtag (e.g. 'ja' instead of 'ja-JP').
    function attempt(l: string, retried: boolean) {
      try {
        speechLib().speak(text, {
          language:  l,
          onDone:    finish,
          onStopped: finish,
          onError: (e) => {
            if (playbackEpoch !== epoch) { reject(new Error('cancelled')); return; }
            if (!retried) {
              const base = l.split('-')[0];
              if (base !== l) { attempt(base, true); return; }
            }
            finishPlayback(playbackKey, playbackEpoch);
            reject(e instanceof Error ? e : new Error(String(e)));
          },
        });
      } catch (e) {
        if (playbackEpoch !== epoch) { reject(new Error('cancelled')); return; }
        if (!retried) {
          const base = l.split('-')[0];
          if (base !== l) { attempt(base, true); return; }
        }
        finishPlayback(playbackKey, playbackEpoch);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    attempt(locale, false);
  });
}

// ── OpenAI TTS (Pro users) ────────────────────────────────────────────────────

async function speakWithAI(text: string, voice: AIVoice = activeAIVoice): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  const playbackKey = `ai:${voice}:${text}`;
  const myEpoch = beginPlayback(playbackKey);
  if (myEpoch == null) return;

  try {
    // ── Fetch audio data ─────────────────────────────────────────────────────
    const base64 = await fetchBase64(text, voice);

    // If another speak call arrived while we were fetching, bail out.
    if (myEpoch !== epoch) throw new Error('cancelled');

    // ── Prepare audio session ───────────────────────────────────────────────
    // Always re-apply: iOS resets the audio session after backgrounding or when
    // another app takes audio focus, making subsequent playback silent/missing.
    try {
      await setAudioModeAsync({ playsInSilentMode: true });
    } catch {}

    if (myEpoch !== epoch) throw new Error('cancelled');

    // ── Create player and play ──────────────────────────────────────────────
    const player = createAudioPlayer({ uri: `data:audio/wav;base64,${base64}` });
    currentPlayer = player;

    return await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (err?: Error, stopping = false) => {
        if (settled) return;
        settled = true;
        sub.remove();
        if (stopping) {
          try { player.pause(); } catch {}
        }
        try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.didJustFinish) {
          finish();
        }
      });
      const stop = () => finish(new Error('cancelled'), true);
      stopActivePlayer = stop;

      try {
        player.play();
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    });
  } finally {
    finishPlayback(playbackKey, myEpoch);
  }
}

// ── Custom audio (Basic plan, user-attached file) ─────────────────────────────

/**
 * Play a user-attached audio file at the given speed and volume.
 * Integrates with the same stop/cancel machinery as speakFree / speakWithAI.
 */
export async function speakCustom(uri: string, speed: number, volume: number): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  const playbackKey = `custom:${uri}:${speed}:${volume}`;
  const myEpoch = beginPlayback(playbackKey);
  if (myEpoch == null) return;

  try {
    try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}

    if (myEpoch !== epoch) throw new Error('cancelled');

    const player = createAudioPlayer({ uri });
    player.volume = Math.min(volume, 1.0);
    player.setPlaybackRate(speed, 'medium');
    currentPlayer = player;

    return await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (err?: Error, stopping = false) => {
        if (settled) return;
        settled = true;
        sub.remove();
        if (stopping) {
          try { player.pause(); } catch {}
        }
        try { player.remove(); } catch {}
        if (currentPlayer === player) currentPlayer = null;
        if (stopActivePlayer === stop) stopActivePlayer = null;
        releaseAudioFocus(focusToken);
        focusToken = null;
        err ? reject(err) : resolve();
      };

      const sub = player.addListener('playbackStatusUpdate', (status: AudioStatus) => {
        if (status.didJustFinish) finish();
      });
      const stop = () => finish(new Error('cancelled'), true);
      stopActivePlayer = stop;

      try { player.play(); } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
    });
  } finally {
    finishPlayback(playbackKey, myEpoch);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Speak the word side of a card. Uses custom audio when the card has one,
 * otherwise falls back to standard TTS. Shared by all playback modes so
 * the priority logic lives in one place.
 */
export function speakWordCard(
  card: { audioUri?: string; audioSpeed?: number; audioVolume?: number; word: string; wordLang?: string },
  isSubscribed: boolean,
): Promise<void> {
  if (card.audioUri) return speakCustom(card.audioUri, card.audioSpeed ?? 1.0, card.audioVolume ?? 1.0);
  return speak(card.word, isSubscribed, card.wordLang);
}

/**
 * Speak `text` using the appropriate engine:
 * - Pro users  → OpenAI high-quality voice (auto-detects language from text)
 * - Free users → device TTS; locale is inferred from the text content via
 *   detectLocale() so each card side is always spoken in its own language,
 *   regardless of the app's UI language setting.
 */
export function speak(text: string, isPro: boolean, forcedLocale?: string): Promise<void> {
  if (isPro) return speakWithAI(text);
  return speakFree(text, forcedLocale ?? detectLocale(text));
}

/** Update the voice used by every subsequent subscriber AI playback request. */
export function setAIVoicePreference(voice: AIVoice): void {
  if (voice === activeAIVoice) return;
  activeAIVoice = voice;
  stopPlayback();
}

/** Play a one-off subscriber preview without changing the saved preference. */
export function previewAIVoice(voice: AIVoice, text: string): Promise<void> {
  return speakWithAI(text, voice);
}

/** Stop any active playback immediately (e.g. on component unmount). */
export function stopPlayback(): void {
  stopCurrent();
  activePlaybackKey = null;
  epoch++; // Abort any in-flight fetch that hasn't created a player yet.
}
