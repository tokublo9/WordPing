/**
 * Which audio a card side plays.
 *
 * A word with Custom Voice registered plays that file and nothing else: no
 * OpenAI generation, no device TTS, no network of any kind. A word without one
 * plays through the ordinary TTS path, whichever engine the plan gets.
 *
 * The rule lives here rather than inside the player because two things have to
 * agree on it: `speakWordCard`, which decides what is played, and the card's
 * voice button, which decides which icon to draw. Deriving both from this one
 * predicate is what stops the icon promising a custom voice the player then
 * ignores — or the reverse.
 *
 * Only the word side has a custom voice. The meaning side is a different piece
 * of text with no file attached, so it is always `tts`.
 *
 * Entitlement is deliberately not part of this. Custom Voice is a local feature
 * available on every plan, so a registered file always remains playable.
 *
 * Pure — no react-native or expo import — so the rule is tested directly.
 */

export type CardVoiceTarget = 'word' | 'meaning';

export type CardVoiceSource =
  /** The user's own audio file, attached to this word. */
  | 'custom'
  /** Generated speech: AI voice or the device engine, per plan. */
  | 'tts';

/** The card fields this decision reads. Kept minimal so callers can pass a partial. */
export interface CardVoiceInput {
  audioUri?: string;
}

export function resolveCardVoiceSource(
  card: CardVoiceInput | null | undefined,
  target: CardVoiceTarget,
): CardVoiceSource {
  if (target !== 'word') return 'tts';
  // An empty string is not a file. Trimmed, because a stored blank would
  // otherwise route playback at a URI that cannot load.
  return card?.audioUri?.trim() ? 'custom' : 'tts';
}

/** True when this card's word side plays a registered file rather than speech. */
export function hasCustomWordVoice(card: CardVoiceInput | null | undefined): boolean {
  return resolveCardVoiceSource(card, 'word') === 'custom';
}
