import { MAX_AI_INPUT_CHARS } from '../constants';
import { DEFAULT_AI_VOICE, type AIVoice } from './aiVoices';

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

// ── Module-level singleton state ─────────────────────────────────────────────

let currentPlayer: AudioPlayer | null = null;

// Rejects the promise returned by the previous speakWithAI call when a new
// one starts, so the caller's `setLoadingVoice(null)` fires immediately.
let pendingReject: ((e: Error) => void) | null = null;

// Incremented on every speakWithAI call; lets us detect when a concurrent
// call superseded us during an async gap (e.g. the network fetch).
let epoch = 0;
let activeAIVoice: AIVoice = DEFAULT_AI_VOICE;

// ── Audio cache ───────────────────────────────────────────────────────────────

const base64Cache = new Map<string, string>();
const inFlight   = new Map<string, Promise<string>>();

async function toBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fetchBase64(text: string, voice: AIVoice): Promise<string> {
  if (!text.trim()) return Promise.reject(new Error('input_empty'));
  if (text.length > MAX_AI_INPUT_CHARS) return Promise.reject(new Error('input_too_long'));
  const cacheKey = `${voice}\u0000${text}`;
  if (base64Cache.has(cacheKey)) return Promise.resolve(base64Cache.get(cacheKey)!);
  if (inFlight.has(cacheKey))   return inFlight.get(cacheKey)!;

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) return Promise.reject(new Error('EXPO_PUBLIC_OPENAI_API_KEY is not set'));

  const p = (async () => {
    try {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini-tts',
          input: text,
          voice,
          response_format: 'wav',
          instructions: 'Speak in an emotive and friendly tone.',
        }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('quota_exceeded');
        throw new Error(`OpenAI TTS failed: ${res.status}`);
      }
      const b64 = await toBase64(await res.arrayBuffer());
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
  // Reject the promise returned by the previous play so the caller's
  // loadingVoice state resets without waiting for playback to finish.
  if (pendingReject) {
    pendingReject(new Error('cancelled'));
    pendingReject = null;
  }
  if (currentPlayer) {
    try { currentPlayer.remove(); } catch {}
    currentPlayer = null;
  }
  // Also stop any active device TTS session.
  try { speechLib().stop(); } catch {}
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
  stopCurrent();
  return new Promise<void>((resolve, reject) => {
    // Try with the full locale first; if the device doesn't have that voice,
    // fall back to the bare language subtag (e.g. 'ja' instead of 'ja-JP').
    function attempt(l: string, retried: boolean) {
      try {
        speechLib().speak(text, {
          language:  l,
          onDone:    resolve,
          onStopped: resolve,
          onError: (e) => {
            if (!retried) {
              const base = l.split('-')[0];
              if (base !== l) { attempt(base, true); return; }
            }
            reject(e instanceof Error ? e : new Error(String(e)));
          },
        });
      } catch (e) {
        if (!retried) {
          const base = l.split('-')[0];
          if (base !== l) { attempt(base, true); return; }
        }
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
    attempt(locale, false);
  });
}

// ── OpenAI TTS (Pro users) ────────────────────────────────────────────────────

async function speakWithAI(text: string, voice: AIVoice = activeAIVoice): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  // Immediately stop any prior playback and cancel its pending promise.
  stopCurrent();
  const myEpoch = ++epoch;

  // ── Fetch audio data ───────────────────────────────────────────────────────
  const base64 = await fetchBase64(text, voice);

  // If another speak call arrived while we were fetching, bail out.
  if (myEpoch !== epoch) throw new Error('cancelled');

  // ── Prepare audio session ─────────────────────────────────────────────────
  // Always re-apply: iOS resets the audio session after backgrounding or when
  // another app takes audio focus, making subsequent playback silent/missing.
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch {}

  if (myEpoch !== epoch) throw new Error('cancelled');

  // ── Create player and play ────────────────────────────────────────────────
  const player = createAudioPlayer({ uri: `data:audio/wav;base64,${base64}` });
  currentPlayer = player;

  return new Promise<void>((resolve, reject) => {
    pendingReject = reject;

    const finish = (err?: Error) => {
      sub.remove();
      try { player.remove(); } catch {}
      if (currentPlayer === player) currentPlayer = null;
      if (pendingReject === reject) pendingReject = null;
      err ? reject(err) : resolve();
    };

    const sub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish) {
        finish();
      } else if (status.error) {
        finish(new Error(`Playback error: ${status.error}`));
      }
    });

    try {
      player.play();
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)));
    }
  });
}

// ── Custom audio (Basic plan, user-attached file) ─────────────────────────────

/**
 * Play a user-attached audio file at the given speed and volume.
 * Integrates with the same stop/cancel machinery as speakFree / speakWithAI.
 */
export async function speakCustom(uri: string, speed: number, volume: number): Promise<void> {
  const { createAudioPlayer, setAudioModeAsync } = audioLib();

  stopCurrent();
  const myEpoch = ++epoch;

  try { await setAudioModeAsync({ playsInSilentMode: true }); } catch {}

  if (myEpoch !== epoch) throw new Error('cancelled');

  const player = createAudioPlayer({ uri });
  player.volume = Math.min(volume, 1.0);
  player.setPlaybackRate(speed, 'medium');
  currentPlayer = player;

  return new Promise<void>((resolve, reject) => {
    pendingReject = reject;

    const finish = (err?: Error) => {
      sub.remove();
      try { player.remove(); } catch {}
      if (currentPlayer === player) currentPlayer = null;
      if (pendingReject === reject) pendingReject = null;
      err ? reject(err) : resolve();
    };

    const sub = player.addListener('playbackStatusUpdate', (status: any) => {
      if (status.didJustFinish) finish();
      else if (status.error) finish(new Error(`Playback error: ${status.error}`));
    });

    try { player.play(); } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
  });
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
 * Warm the AI audio cache for the given text. No-op for free users so we
 * never make OpenAI API calls on their behalf.
 */
export async function preloadAI(text: string, isPro: boolean): Promise<void> {
  if (!isPro) return;
  const cacheKey = `${activeAIVoice}\u0000${text}`;
  if (base64Cache.has(cacheKey) || inFlight.has(cacheKey)) return;
  try { await fetchBase64(text, activeAIVoice); } catch {}
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
  epoch++; // Abort any in-flight fetch that hasn't created a player yet.
}
