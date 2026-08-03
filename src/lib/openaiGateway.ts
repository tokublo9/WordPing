import { DEFAULT_AI_VOICE, isAIVoice, type AIVoice } from './aiVoices';
import { requireSupabaseSession, supabase } from './supabase';

export type AITextAction = 'meaning' | 'breakdown' | 'translation' | 'example';

interface GatewayResponse {
  text?: string;
  error?: string;
}

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
  sessionLookupStartedAtMs: number;
  sessionLookupCompletedAtMs: number;
  requestStartedAtMs: number;
  responseReceivedAtMs: number;
  downloadCompletedAtMs: number;
  edgeRequestId?: string;
  edgeCache?: 'hit' | 'miss';
  edgeColdStart?: boolean;
  edgeTotalMs?: number;
  edgeAuthMs?: number;
  edgePlanMs?: number;
  edgePreOpenAIMs?: number;
  edgeOpenAIMs?: number;
  edgeAudioReadMs?: number;
  edgeWavAnalysisMs?: number;
  edgeResponsePreparationMs?: number;
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

const speechTimingByAudio = new WeakMap<ArrayBuffer, AISpeechTimingDiagnostics>();
const speechRequestTimingByAudio = new WeakMap<ArrayBuffer, AISpeechRequestDiagnostics>();

function numericHeader(response: Response, name: string): number | null {
  const value = response.headers.get(name);
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function booleanHeader(response: Response, name: string): boolean | undefined {
  const value = response.headers.get(name);
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export function readSpeechTiming(response: Response): AISpeechTimingDiagnostics | null {
  const originalDurationMs = numericHeader(response, 'X-WordPing-Audio-Original-Duration-Ms');
  const originalAudibleStartMs = numericHeader(response, 'X-WordPing-Audio-Original-Audible-Start-Ms');
  const originalAudibleEndMs = numericHeader(response, 'X-WordPing-Audio-Original-Audible-End-Ms');
  const durationMs = numericHeader(response, 'X-WordPing-Audio-Duration-Ms');
  const audibleStartMs = numericHeader(response, 'X-WordPing-Audio-Audible-Start-Ms');
  const audibleEndMs = numericHeader(response, 'X-WordPing-Audio-Audible-End-Ms');
  const leadingSilenceMs = numericHeader(response, 'X-WordPing-Audio-Leading-Silence-Ms');
  const trailingSilenceMs = numericHeader(response, 'X-WordPing-Audio-Trailing-Silence-Ms');
  if (
    originalDurationMs == null || originalAudibleEndMs == null || durationMs == null ||
    audibleEndMs == null || trailingSilenceMs == null
  ) return null;
  const timing = {
    originalDurationMs,
    originalAudibleEndMs,
    durationMs,
    audibleEndMs,
    trailingSilenceMs,
    ...(originalAudibleStartMs != null ? { originalAudibleStartMs } : {}),
    ...(audibleStartMs != null ? { audibleStartMs } : {}),
    ...(leadingSilenceMs != null ? { leadingSilenceMs } : {}),
  };
  return isAISpeechTimingDiagnostics(timing) ? timing : null;
}

export function getAISpeechTiming(audio: ArrayBuffer): AISpeechTimingDiagnostics | undefined {
  return speechTimingByAudio.get(audio);
}

export function getAISpeechRequestTiming(audio: ArrayBuffer): AISpeechRequestDiagnostics | undefined {
  return speechRequestTimingByAudio.get(audio);
}

function statusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) return context.status;
  if (context && typeof context === 'object' && typeof (context as { status?: unknown }).status === 'number') {
    return (context as { status: number }).status;
  }
  return undefined;
}

async function invokeGateway(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  timeout = 30000,
): Promise<GatewayResponse> {
  if (!supabase) throw new Error('service_unavailable');
  await requireSupabaseSession();

  const { data, error, response } = await supabase.functions.invoke<GatewayResponse>('openai', {
    body,
    signal,
    timeout,
  });

  if (error) {
    const status = response?.status ?? statusFromError(error);
    if (status === 403) {
      // Distinguish plan_required (server refused based on plan) from auth failures.
      try {
        const body = await response?.json();
        if (body?.error === 'plan_required') throw new Error('plan_required');
      } catch (e) {
        if (e instanceof Error && e.message === 'plan_required') throw e;
      }
      throw new Error('authentication_failed');
    }
    if (status === 401) throw new Error('authentication_failed');
    if (status === 429) throw new Error('quota_exceeded');
    throw new Error('service_unavailable');
  }
  if (!data || data.error) throw new Error(data?.error ?? 'service_unavailable');
  return data;
}

export async function requestAIText(
  action: AITextAction,
  text: string,
  langCode: string,
  signal?: AbortSignal,
): Promise<string> {
  const result = await invokeGateway({ action, text, langCode }, signal);
  if (typeof result.text !== 'string') throw new Error('invalid_response');
  return result.text.trim();
}

export async function requestAISpeech(
  text: string,
  voice: AIVoice,
  signal?: AbortSignal,
  format: 'wav' | 'mp3' = 'wav',
  action: 'speech' | 'speech_custom' | 'speech_sample' = 'speech',
  sampleVersion?: string,
): Promise<ArrayBuffer> {
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (!trimmedText) throw new Error('input_empty');

  // Normalize and validate voice — fall back to default if the persisted value
  // is missing, has stale whitespace, or is a legacy name the server rejects.
  const normalizedVoice = typeof voice === 'string' ? voice.trim().toLowerCase() : '';
  const validVoice: AIVoice = isAIVoice(normalizedVoice) ? normalizedVoice : DEFAULT_AI_VOICE;

  if (!supabase) throw new Error('service_unavailable');
  const sessionLookupStartedAtMs = performance.now();
  const session = await requireSupabaseSession();
  const sessionLookupCompletedAtMs = performance.now();

  if (__DEV__) {
    // ── Temporary auth/plan diagnostic ───────────────────────────────────────
    // Prints the anonymous user ID that the Edge Function will look up in
    // user_plans. If the plan check returns 403, run this SQL in the Supabase
    // Dashboard → SQL Editor to grant access:
    //
    //   INSERT INTO public.user_plans (user_id, plan, updated_at)
    //   VALUES ('<userId below>', 'basic', now())
    //   ON CONFLICT (user_id) DO UPDATE SET plan='basic', updated_at=now();
    //
    console.log('[TTS auth debug]', {
      userId: session.user.id,
      isAnonymous: session.user.is_anonymous,
      jwtSub: session.user.id,  // Supabase JWT sub == user.id
      action,
      textLength: trimmedText.length,
      voice: validVoice,
      format,
    });
    // ─────────────────────────────────────────────────────────────────────────
  }

  const url = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/openai`;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

  const requestStartedAtMs = performance.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        text: trimmedText,
        voice: validVoice,
        format,
        ...(action === 'speech_sample' && sampleVersion ? { sampleVersion } : {}),
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    if (error instanceof TypeError) {
      if (__DEV__) {
        console.warn('[TTS service warning]', {
          stage: 'network_request',
          action,
          textLength: trimmedText.length,
          errorName: error.name,
          errorMessage: error.message,
        });
      }
      throw new Error('service_unavailable');
    }
    throw error;
  }
  const responseReceivedAtMs = performance.now();

  if (!response.ok) {
    const responseContentType = response.headers.get('content-type') ?? '';
    const errorBody = responseContentType.includes('application/json')
      ? await response.json()
      : await response.text();
    if (__DEV__) console.warn('[TTS service warning]', {
      stage: 'edge_response',
      status: response.status,
      requestId: response.headers.get('X-WordPing-Request-ID'),
      errorCode: typeof errorBody === 'object' && errorBody !== null
        ? (errorBody as Record<string, unknown>).error
        : undefined,
    });
    const errorCode = typeof errorBody === 'object' && errorBody !== null
      ? (errorBody as Record<string, unknown>).error
      : undefined;
    if (response.status === 403) {
      if (errorCode === 'premium_required') throw new Error('premium_required');
      if (errorCode === 'plan_required') throw new Error('plan_required');
      throw new Error('authentication_failed');
    }
    if (response.status === 401) throw new Error('authentication_failed');
    if (response.status === 429) {
      if (errorCode === 'rate_limit_exceeded') throw new Error('rate_limit_exceeded');
      if (errorCode === 'usage_limit_exceeded') throw new Error('usage_limit_exceeded');
      throw new Error('quota_exceeded');
    }
    if (response.status === 400 && errorCode === 'input_too_long') throw new Error('input_too_long');
    if ([500, 502, 503, 504].includes(response.status)) throw new Error('service_unavailable');
    throw new Error('service_unavailable');
  }

  const audio = await response.arrayBuffer();
  const downloadCompletedAtMs = performance.now();
  const edgeTiming = {
    edgeTotalMs: numericHeader(response, 'X-WordPing-Edge-Total-Ms') ?? undefined,
    edgeAuthMs: numericHeader(response, 'X-WordPing-Edge-Auth-Ms') ?? undefined,
    edgePlanMs: numericHeader(response, 'X-WordPing-Edge-Plan-Ms') ?? undefined,
    edgePreOpenAIMs: numericHeader(response, 'X-WordPing-Edge-Pre-OpenAI-Ms') ?? undefined,
    edgeOpenAIMs: numericHeader(response, 'X-WordPing-Edge-OpenAI-Ms') ?? undefined,
    edgeAudioReadMs: numericHeader(response, 'X-WordPing-Edge-Audio-Read-Ms') ?? undefined,
    edgeWavAnalysisMs: numericHeader(response, 'X-WordPing-Edge-Wav-Analysis-Ms') ?? undefined,
    edgeResponsePreparationMs: numericHeader(response, 'X-WordPing-Edge-Response-Preparation-Ms') ?? undefined,
  };
  const requestTiming: AISpeechRequestDiagnostics = {
    sessionLookupStartedAtMs,
    sessionLookupCompletedAtMs,
    requestStartedAtMs,
    responseReceivedAtMs,
    downloadCompletedAtMs,
    edgeRequestId: response.headers.get('X-WordPing-Request-ID') ?? undefined,
    edgeCache: response.headers.get('X-WordPing-Cache') === 'hit' ? 'hit' : 'miss',
    edgeColdStart: booleanHeader(response, 'X-WordPing-Edge-Cold-Start'),
    ...edgeTiming,
  };
  speechRequestTimingByAudio.set(audio, requestTiming);
  const timing = readSpeechTiming(response);
  if (timing) {
    speechTimingByAudio.set(audio, timing);
    if (__DEV__) {
      console.log('[TTS audio timing]', {
        action,
        textLength: trimmedText.length,
        before: {
          durationMs: timing.originalDurationMs,
          detectedAudibleStartMs: timing.originalAudibleStartMs,
          detectedAudibleEndMs: timing.originalAudibleEndMs,
          leadingSilenceMs: timing.originalAudibleStartMs,
          trailingSilenceMs: timing.originalDurationMs - timing.originalAudibleEndMs,
        },
        after: {
          durationMs: timing.durationMs,
          detectedAudibleStartMs: timing.audibleStartMs,
          detectedAudibleEndMs: timing.audibleEndMs,
          leadingSilenceMs: timing.leadingSilenceMs,
          trailingSilenceMs: timing.trailingSilenceMs,
        },
      });
    }
  }
  if (__DEV__) {
    console.log('[TTS request timing]', {
      action,
      textLength: trimmedText.length,
      sessionLookupMs: Math.round(sessionLookupCompletedAtMs - sessionLookupStartedAtMs),
      requestStartMs: 0,
      ttsResponseReceivedMs: Math.round(responseReceivedAtMs - requestStartedAtMs),
      audioDownloadCompleteMs: Math.round(downloadCompletedAtMs - requestStartedAtMs),
      downloadDurationMs: Math.round(downloadCompletedAtMs - responseReceivedAtMs),
      edgeRequestId: requestTiming.edgeRequestId,
      edgeCache: requestTiming.edgeCache,
      edgeColdStart: requestTiming.edgeColdStart,
      edge: edgeTiming,
    });
  }
  return audio;
}
