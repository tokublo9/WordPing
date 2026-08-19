import { z } from 'zod';
import { AUDIO_FORMATS, MAX_LANG_CODE_LENGTH } from './config';

/**
 * Request body schemas.
 *
 * All of these are non-strict `z.object`, which *strips* unknown keys rather
 * than erroring. That is the point: a client that tries to smuggle a `model`,
 * `base_url`, `endpoint`, or `max_tokens` field has it silently discarded, and
 * the handler goes on to use the server-side allowlisted values from config.ts.
 * There is no code path anywhere in this Worker that reads a model name or an
 * upstream URL out of a request body.
 *
 * The `max` values here are absolute ceilings that bound parsing work. The
 * tier-specific limit — which is lower, and operator-tunable from KV — is
 * applied afterwards in the route handler.
 */

/** Widest single-request input any feature permits. */
const ABSOLUTE_MAX_TEXT_LENGTH = 1_000;

const inputText = z
  .string()
  .transform(value => value.trim())
  .refine(value => value.length > 0, { message: 'text must not be empty' })
  .refine(value => value.length <= ABSOLUTE_MAX_TEXT_LENGTH, { message: 'text is too long' });

/**
 * Not validated against the allowlist here — `resolveVoice` in config.ts does
 * that, so an unsupported voice yields the specific `invalid_voice` error code
 * the client already understands rather than a generic validation failure.
 */
const voiceField = z.string().max(32);

const formatField = z.enum(AUDIO_FORMATS).optional();

export const voiceCardSchema = z.object({
  text: inputText,
  voice: voiceField,
  format: formatField,
});
export type VoiceCardRequest = z.infer<typeof voiceCardSchema>;

/**
 * Voice previews carry no user text at all: the sample sentence is chosen
 * server-side from config.ts. `sampleVersion` only lets the client invalidate a
 * locally cached preview.
 */
export const voiceSampleSchema = z.object({
  voice: voiceField,
  sampleVersion: z.string().max(64).optional(),
});
export type VoiceSampleRequest = z.infer<typeof voiceSampleSchema>;

export const voiceCustomSchema = z.object({
  text: inputText,
  voice: voiceField,
  format: formatField,
  instructions: z.string().max(500).optional(),
});
export type VoiceCustomRequest = z.infer<typeof voiceCustomSchema>;

export const textActionSchema = z.object({
  text: inputText,
  langCode: z.string().max(MAX_LANG_CODE_LENGTH).optional(),
});
export type TextActionRequest = z.infer<typeof textActionSchema>;

/**
 * Counts Unicode code points rather than UTF-16 units, so an emoji or a
 * surrogate-pair CJK character costs one, matching how a reader perceives the
 * input and how the previous Edge Function measured it.
 */
export function characterCount(text: string): number {
  return [...text].length;
}
