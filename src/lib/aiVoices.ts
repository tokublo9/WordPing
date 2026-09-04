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

const AI_VOICE_DESCRIPTIONS: Record<AIVoice, string> = {
  cedar: 'Confident, natural, and grounded.',
  marin: 'Warm, natural, and engaging.',
};

export function isAIVoice(value: unknown): value is AIVoice {
  return typeof value === 'string' && (AI_VOICES as readonly string[]).includes(value);
}

export function getAIVoiceLabel(voice: AIVoice): string {
  return voice.charAt(0).toUpperCase() + voice.slice(1);
}

export function getAIVoiceDescription(voice: AIVoice): string {
  return AI_VOICE_DESCRIPTIONS[voice];
}
