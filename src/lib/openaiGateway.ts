import { DEFAULT_AI_VOICE, isAIVoice, type AIVoice } from './aiVoices';
import { AIRequestError } from './api/errors';
import {
  postPromoSpeech,
  postSpeech,
  postText,
  type SpeechResult,
  type TextEndpoint,
  type VoiceEndpoint,
} from './api/client';
import { analyzeWavBestEffort, type WavTrimResult } from './wavSilence';

/**
 * AI gateway.
 *
 * Shapes AI requests and hands them to api/client, which talks to the Cloudflare
 * Worker in cloudflare/wordping-api. Nothing here holds a credential.
 *
 * Silence analysis runs on the client, deliberately: the Worker streams audio
 * straight through without buffering it, and the analysis then runs here on the
 * buffer the client already has in memory. Keeping it on this side means there
 * is no audio timing metadata to carry across a network boundary.
 */

export type AITextAction = 'meaning' | 'breakdown' | 'translation' | 'example';

export interface AISpeechTimingDiagnostics {
  originalDurationMs: number;
  originalAudibleStartMs?: number;
  originalAudibleEndMs: number;
  durationMs: number;
  audibleStartMs?: number;
  audibleEndMs: number;
  leadingSilenceMs?: number;
  trailingSilenceMs: number;
}

export interface AISpeechRequestDiagnostics {
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  analysisCompletedAtMs: number;
  requestId?: string;
  cache: 'hit' | 'miss';
}

export function isAISpeechTimingDiagnostics(value: unknown): value is AISpeechTimingDiagnostics {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const shapeIsValid = (
    typeof item.originalDurationMs === 'number' && Number.isFinite(item.originalDurationMs) &&
    (item.originalAudibleStartMs === undefined ||
      (typeof item.originalAudibleStartMs === 'number' && Number.isFinite(item.originalAudibleStartMs))) &&
    typeof item.originalAudibleEndMs === 'number' && Number.isFinite(item.originalAudibleEndMs) &&
    typeof item.durationMs === 'number' && Number.isFinite(item.durationMs) &&
    (item.audibleStartMs === undefined ||
      (typeof item.audibleStartMs === 'number' && Number.isFinite(item.audibleStartMs))) &&
    typeof item.audibleEndMs === 'number' && Number.isFinite(item.audibleEndMs) &&
    (item.leadingSilenceMs === undefined ||
      (typeof item.leadingSilenceMs === 'number' && Number.isFinite(item.leadingSilenceMs))) &&
    typeof item.trailingSilenceMs === 'number' && Number.isFinite(item.trailingSilenceMs)
  );
  if (!shapeIsValid) return false;
  const timing = item as unknown as AISpeechTimingDiagnostics;
  return (
    timing.originalDurationMs >= 0 &&
    timing.originalAudibleEndMs >= 0 && timing.originalAudibleEndMs <= timing.originalDurationMs &&
    (timing.originalAudibleStartMs === undefined || (
      timing.originalAudibleStartMs >= 0 &&
      timing.originalAudibleStartMs <= timing.originalAudibleEndMs
    )) &&
    timing.durationMs >= 0 &&
    timing.audibleEndMs >= 0 && timing.audibleEndMs <= timing.durationMs &&
    (timing.audibleStartMs === undefined || (
      timing.audibleStartMs >= 0 && timing.audibleStartMs <= timing.audibleEndMs
    )) &&
    (timing.leadingSilenceMs === undefined || timing.leadingSilenceMs >= 0) &&
    timing.trailingSilenceMs >= 0 && timing.trailingSilenceMs <= timing.durationMs
  );
}

/**
 * Keyed by the returned buffer so the diagnostics are garbage-collected with
 * the audio and cannot accumulate across a long session.
 */
const speechTimingByAudio = new WeakMap<ArrayBuffer, AISpeechTimingDiagnostics>();
const speechRequestTimingByAudio = new WeakMap<ArrayBuffer, AISpeechRequestDiagnostics>();

export function getAISpeechTiming(audio: ArrayBuffer): AISpeechTimingDiagnostics | undefined {
  return speechTimingByAudio.get(audio);
}

export function getAISpeechRequestTiming(audio: ArrayBuffer): AISpeechRequestDiagnostics | undefined {
  return speechRequestTimingByAudio.get(audio);
}

function toDiagnostics(result: WavTrimResult): AISpeechTimingDiagnostics {
  return {
    originalDurationMs: result.before.durationMs,
    originalAudibleStartMs: result.before.audibleStartMs,
    originalAudibleEndMs: result.before.audibleEndMs,
    durationMs: result.after.durationMs,
    audibleStartMs: result.after.audibleStartMs,
    audibleEndMs: result.after.audibleEndMs,
    leadingSilenceMs: result.after.leadingSilenceMs,
    trailingSilenceMs: result.after.trailingSilenceMs,
  };
}

// ── Text ─────────────────────────────────────────────────────────────────────

const TEXT_ENDPOINTS: Readonly<Record<AITextAction, TextEndpoint>> = {
  meaning: 'meaning',
  breakdown: 'breakdown',
  translation: 'translate',
  example: 'examples',
};

export function requestAIText(
  action: AITextAction,
  text: string,
  langCode: string,
  signal?: AbortSignal,
): Promise<string> {
  return postText(TEXT_ENDPOINTS[action], text, langCode, { ...(signal ? { signal } : {}) });
}

// ── Speech ───────────────────────────────────────────────────────────────────

/** Legacy action names, kept so the TTS pipeline did not need reworking. */
export type AISpeechAction = 'speech' | 'speech_custom' | 'speech_sample' | 'speech_promo';

/**
 * The user-content voice routes.
 *
 * `speech_promo` is deliberately absent: it does not go through `postSpeech` at
 * all, but through `postPromoSpeech`, which sends no identifiers and skips the
 * entitlement and consent gates because it carries nothing of the user's.
 */
const VOICE_ENDPOINTS: Readonly<Record<Exclude<AISpeechAction, 'speech_promo'>, VoiceEndpoint>> = {
  speech: 'card',
  speech_custom: 'custom',
  speech_sample: 'sample',
};

/** Identifies one of the fixed promotional clips. Never carries text. */
export interface PromoSpeechRequest {
  sample: string;
  langCode: string;
}

export async function requestAISpeech(
  text: string,
  voice: AIVoice,
  signal?: AbortSignal,
  format: 'wav' | 'mp3' = 'wav',
  action: AISpeechAction = 'speech',
  sampleVersion?: string,
  promo?: PromoSpeechRequest,
  langCode?: string,
): Promise<ArrayBuffer> {
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  // Neither preview route carries user text: the sentence is chosen server-side.
  const serverAuthoredText = action === 'speech_sample' || action === 'speech_promo';
  if (!trimmedText && !serverAuthoredText) throw new AIRequestError('invalid_input');
  if (action === 'speech_promo' && !promo) throw new AIRequestError('invalid_input');

  // Normalise and validate the voice — a persisted value can be stale, have
  // leftover whitespace, or be a legacy name the server no longer accepts.
  const normalizedVoice = typeof voice === 'string' ? voice.trim().toLowerCase() : '';
  const validVoice: AIVoice = isAIVoice(normalizedVoice) ? normalizedVoice : DEFAULT_AI_VOICE;

  const requestStartedAtMs = performance.now();

  // The promo takes its own path. Its body is built inside `postPromoSpeech`
  // from an allowlisted sample id, so nothing assembled here can reach it — in
  // particular neither `text` nor `voice`, which the route has no field for.
  let result: SpeechResult;
  if (action === 'speech_promo') {
    result = await postPromoSpeech(
      promo!.sample,
      promo!.langCode,
      sampleVersion,
      { ...(signal ? { signal } : {}) },
    );
  } else {
    const body: Record<string, unknown> = action === 'speech_sample'
      ? { voice: validVoice, ...(sampleVersion ? { sampleVersion } : {}) }
      : {
        text: trimmedText,
        voice: validVoice,
        format,
        ...(action === 'speech' && langCode ? { langCode } : {}),
      };
    result = await postSpeech(VOICE_ENDPOINTS[action], body, { ...(signal ? { signal } : {}) });
  }
  const responseReceivedAtMs = performance.now();

  // Best-effort by contract: unanalysable audio is returned untouched rather
  // than turned into an error, so a codec quirk can never break playback.
  const analysis = format === 'wav' ? analyzeWavBestEffort(result.audio) : null;
  const audio = analysis?.audio ?? result.audio;
  const analysisCompletedAtMs = performance.now();

  if (analysis?.timing) speechTimingByAudio.set(audio, toDiagnostics(analysis.timing));
  speechRequestTimingByAudio.set(audio, {
    requestStartedAtMs,
    responseReceivedAtMs,
    analysisCompletedAtMs,
    ...(result.requestId !== null ? { requestId: result.requestId } : {}),
    cache: result.cache,
  });

  if (__DEV__) {
    // Sizes and durations only. The text being spoken is never logged.
    console.log('[TTS request]', {
      action,
      textLength: trimmedText.length,
      voice: validVoice,
      format,
      requestMs: Math.round(responseReceivedAtMs - requestStartedAtMs),
      analysisMs: Math.round(analysisCompletedAtMs - responseReceivedAtMs),
      cache: result.cache,
      requestId: result.requestId,
      trimmed: analysis?.timing?.trimmed ?? false,
      analysisFailure: analysis?.failure?.stage,
    });
  }

  return audio;
}
