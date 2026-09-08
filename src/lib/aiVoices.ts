// Type-only, so this module still imports nothing at runtime.
import type { TranslationKey } from '../i18n';

export const AI_VOICES = [
  'marin',
  'cedar',
] as const;

export type AIVoice = typeof AI_VOICES[number];

export const DEFAULT_AI_VOICE: AIVoice = 'marin';

/**
 * Voices the app used to offer.
 *
 * Kept as plain strings — they are deliberately not `AIVoice` any more. Two
 * things still need to know them: `isAIVoice` rejects a stored one so an
 * existing user falls back to the default, and the cache purge recognises the
 * files they left behind. Nothing may offer them again.
 */
export const RETIRED_AI_VOICES: ReadonlySet<string> = new Set([
  'fable', 'alloy', 'ash', 'coral', 'nova', 'shimmer',
]);

/**
 * Translation keys, not copy. The voice names themselves are OpenAI product
 * names and stay as they are in every language; only the one-line description
 * beside each is translated, and the dictionaries own that text.
 */
const AI_VOICE_DESCRIPTION_KEYS: Record<AIVoice, TranslationKey> = {
  cedar: 'voice_desc_cedar',
  marin: 'voice_desc_marin',
};

export function isAIVoice(value: unknown): value is AIVoice {
  return typeof value === 'string' && (AI_VOICES as readonly string[]).includes(value);
}

/**
 * The English voice name, capitalised from the internal value.
 *
 * **Not for display.** Its only caller is the fixed sample sentence in
 * `aiVoiceSamples.ts`, which is spoken English audio, cache-keyed by
 * `AI_VOICE_SAMPLE_CONTENT_VERSION` and validated by the Worker — translating
 * it would change the cache key and the text the server expects. Use
 * `getAIVoiceNameKey` for anything a user reads.
 */
export function getAIVoiceLabel(voice: AIVoice): string {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

/**
 * Translation key for the voice name shown in the UI.
 *
 * "Marin" and "Cedar" are proper names, so each locale carries a reading of the
 * same name in its own script rather than a translated common noun. The
 * internal value is untouched: nothing here reaches the API, the cache key or
 * analytics.
 */
const AI_VOICE_NAME_KEYS: Record<AIVoice, TranslationKey> = {
  marin: 'voice_name_marin',
  cedar: 'voice_name_cedar',
};

export function getAIVoiceNameKey(voice: AIVoice): TranslationKey {
  return AI_VOICE_NAME_KEYS[voice];
}

export function getAIVoiceDescriptionKey(voice: AIVoice): TranslationKey {
  return AI_VOICE_DESCRIPTION_KEYS[voice];
}
