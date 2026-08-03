import { createClient } from 'npm:@supabase/supabase-js@2';
import { analyzeWavBestEffort, type WavTrimResult } from './wavSilence.ts';
import { fetchOpenAISpeech } from './speechUpstream.ts';

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

let isolateInvocationCount = 0;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': [
    'X-WordPing-Audio-Original-Duration-Ms',
    'X-WordPing-Audio-Original-Audible-Start-Ms',
    'X-WordPing-Audio-Original-Audible-End-Ms',
    'X-WordPing-Audio-Duration-Ms',
    'X-WordPing-Audio-Audible-Start-Ms',
    'X-WordPing-Audio-Audible-End-Ms',
    'X-WordPing-Audio-Leading-Silence-Ms',
    'X-WordPing-Audio-Trailing-Silence-Ms',
    'X-WordPing-Request-ID',
    'X-WordPing-Cache',
    'X-WordPing-Edge-Cold-Start',
    'X-WordPing-Edge-Total-Ms',
    'X-WordPing-Edge-Auth-Ms',
    'X-WordPing-Edge-Plan-Ms',
    'X-WordPing-Edge-Pre-OpenAI-Ms',
    'X-WordPing-Edge-OpenAI-Ms',
    'X-WordPing-Edge-Audio-Read-Ms',
    'X-WordPing-Edge-Wav-Analysis-Ms',
    'X-WordPing-Edge-Response-Preparation-Ms',
  ].join(', '),
};

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean',
  'zh-CN': 'Chinese (Simplified)', de: 'German', it: 'Italian', 'pt-BR': 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', pl: 'Polish', el: 'Greek', sv: 'Swedish',
};
const TEXT_ACTIONS = new Set(['meaning', 'breakdown', 'translation', 'example']);
const VOICES = new Set(['alloy', 'ash', 'ballad', 'cedar', 'coral', 'echo', 'fable', 'marin', 'nova', 'onyx', 'sage', 'shimmer', 'verse']);

// Standalone text-to-speech (TextToSpeechScreen, Premium only).
const SPEECH_CUSTOM_LIMITS = {
  maxCharactersPerRequest: 1_000,
  maxRequestsPerMinute: 5,
  maxRequestsPerDay: 30,
  maxRequestsPerMonth: 300,
  maxCharactersPerDay: 15_000,
  maxCharactersPerMonth: 150_000,
} as const;

// Word-card AI voice (Basic and Premium). Limits are plan-specific.
// These are enforced independently of speech_custom — a card request cannot
// consume speech_custom quota and a speech_custom request cannot consume
// card quota.
const SPEECH_CARD_LIMITS = {
  basic: {
    maxCharactersPerRequest: 300,
    maxRequestsPerMinute: 10,
    maxRequestsPerDay: 100,
    maxRequestsPerMonth: 1_500,
    maxCharactersPerDay: 15_000,
    maxCharactersPerMonth: 150_000,
  },
  premium: {
    maxCharactersPerRequest: 500,
    maxRequestsPerMinute: 20,
    maxRequestsPerDay: 300,
    maxRequestsPerMonth: 5_000,
    maxCharactersPerDay: 50_000,
    maxCharactersPerMonth: 500_000,
  },
} as const;

const SPEECH_MODEL = 'gpt-4o-mini-tts';
const SPEECH_CACHE_BUCKET = 'speech-custom-cache';
const VOICE_SAMPLE_VERSION = 'natural-ai-voice-v1';
const VOICE_SAMPLE_TEXT: Readonly<Record<string, string>> = {
  cedar: 'Welcome to WordPing. This is the Cedar voice.',
  fable: 'Welcome to WordPing. This is the Fable voice.',
  alloy: 'Welcome to WordPing. This is the Alloy voice.',
  ash: 'Welcome to WordPing. This is the Ash voice.',
  coral: 'Welcome to WordPing. This is the Coral voice.',
  nova: 'Welcome to WordPing. This is the Nova voice.',
  marin: 'Welcome to WordPing. This is the Marin voice.',
  shimmer: 'Welcome to WordPing. This is the Shimmer voice.',
};

type Plan = 'free' | 'basic' | 'premium';
type ServiceClient = ReturnType<typeof createClient>;

type DiagnosticLevel = 'info' | 'warn' | 'error';

interface EdgeTimingContext {
  startedAtMs: number;
  coldStart: boolean;
  authMs: number;
  planMs: number;
  preOpenAIMs: number;
  openAIMs?: number;
  audioReadMs?: number;
  wavAnalysisMs?: number;
  responsePreparationMs?: number;
}

function exceptionDetails(error: unknown): { name: string; message: string; code?: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  if (error && typeof error === 'object') {
    const item = error as Record<string, unknown>;
    const code = typeof item.code === 'string' ? item.code : undefined;
    const inferredName = code?.startsWith('PGRST') ? 'PostgrestError' : 'UnknownError';
    return {
      name: typeof item.name === 'string' ? item.name : inferredName,
      message: typeof item.message === 'string' ? item.message : String(error),
      ...(code ? { code } : {}),
    };
  }
  return { name: 'UnknownError', message: String(error) };
}

function diagnostic(
  level: DiagnosticLevel,
  event: string,
  requestId: string,
  details: Record<string, unknown> = {},
): void {
  const entry = JSON.stringify({ event, requestId, ...details });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

function elapsedMs(startedAtMs: number, completedAtMs = performance.now()): number {
  return Math.max(0, Math.round((completedAtMs - startedAtMs) * 10) / 10);
}

function edgeTimingHeaders(timing: EdgeTimingContext): Record<string, string> {
  const headers: Record<string, string> = {
    'X-WordPing-Edge-Cold-Start': String(timing.coldStart),
    'X-WordPing-Edge-Total-Ms': String(elapsedMs(timing.startedAtMs)),
    'X-WordPing-Edge-Auth-Ms': String(timing.authMs),
    'X-WordPing-Edge-Plan-Ms': String(timing.planMs),
    'X-WordPing-Edge-Pre-OpenAI-Ms': String(timing.preOpenAIMs),
  };
  if (timing.openAIMs != null) headers['X-WordPing-Edge-OpenAI-Ms'] = String(timing.openAIMs);
  if (timing.audioReadMs != null) headers['X-WordPing-Edge-Audio-Read-Ms'] = String(timing.audioReadMs);
  if (timing.wavAnalysisMs != null) headers['X-WordPing-Edge-Wav-Analysis-Ms'] = String(timing.wavAnalysisMs);
  if (timing.responsePreparationMs != null) {
    headers['X-WordPing-Edge-Response-Preparation-Ms'] = String(timing.responsePreparationMs);
  }
  return headers;
}

function validTimingValue(value: number, durationMs: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= durationMs;
}

function audioTimingHeaders(timing: WavTrimResult | null): Record<string, string> {
  if (!timing) return {};
  const values = [
    [timing.before.durationMs, timing.before.durationMs],
    [timing.before.audibleStartMs, timing.before.durationMs],
    [timing.before.audibleEndMs, timing.before.durationMs],
    [timing.after.durationMs, timing.after.durationMs],
    [timing.after.audibleStartMs, timing.after.durationMs],
    [timing.after.audibleEndMs, timing.after.durationMs],
    [timing.after.leadingSilenceMs, timing.after.durationMs],
    [timing.after.trailingSilenceMs, timing.after.durationMs],
  ] as const;
  if (
    values.some(([value, duration]) => !validTimingValue(value, duration)) ||
    timing.before.audibleStartMs > timing.before.audibleEndMs ||
    timing.after.audibleStartMs > timing.after.audibleEndMs
  ) return {};
  return {
    'X-WordPing-Audio-Original-Duration-Ms': String(timing.before.durationMs),
    'X-WordPing-Audio-Original-Audible-Start-Ms': String(timing.before.audibleStartMs),
    'X-WordPing-Audio-Original-Audible-End-Ms': String(timing.before.audibleEndMs),
    'X-WordPing-Audio-Duration-Ms': String(timing.after.durationMs),
    'X-WordPing-Audio-Audible-Start-Ms': String(timing.after.audibleStartMs),
    'X-WordPing-Audio-Audible-End-Ms': String(timing.after.audibleEndMs),
    'X-WordPing-Audio-Leading-Silence-Ms': String(timing.after.leadingSilenceMs),
    'X-WordPing-Audio-Trailing-Silence-Ms': String(timing.after.trailingSilenceMs),
  };
}

function json(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders });
}

function getSystemPrompt(action: string, language: string): string {
  if (action === 'meaning' || action === 'translation') {
    return `Translate the following into ${language}. Return only the translated text, nothing else.`;
  }
  if (action === 'breakdown') {
    return `You are a language learning assistant. Break the given word or phrase into natural, meaningful parts and translate each part into ${language}. Format each item as "original: translation" on its own line. Group words into natural phrases instead of splitting every word. Be concise.`;
  }
  return `You are a vocabulary teacher. Write one very short example sentence in ${language} using the given word. The sentence must be under 10 words. Return only the sentence.`;
}

function normalizeSpeechText(text: string): string {
  return text.trim().replace(/\s+/gu, ' ');
}

function characterCount(text: string): number {
  return Array.from(text).length;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function speechRequestHash(
  text: string,
  voice: string,
  format: string,
  instructions = '',
): Promise<string> {
  return sha256(JSON.stringify({
    text: normalizeSpeechText(text),
    voice,
    model: SPEECH_MODEL,
    instructions: instructions.trim(),
    format,
  }));
}

async function voiceSampleRequestHash(text: string, voice: string, format: string): Promise<string> {
  return sha256(JSON.stringify({
    text: normalizeSpeechText(text),
    voice,
    model: SPEECH_MODEL,
    speed: 1,
    format,
    contentVersion: VOICE_SAMPLE_VERSION,
  }));
}

async function readCachedSpeech(
  serviceClient: ServiceClient,
  path: string,
  contentType: string,
  requestId: string,
  action: string,
  edgeTiming: EdgeTimingContext,
): Promise<Response | null> {
  const cacheReadStartedAtMs = performance.now();
  const { data, error } = await serviceClient.storage.from(SPEECH_CACHE_BUCKET).download(path);
  if (error || !data) {
    console.error('[speech_custom_cache] download failed', { path, message: error?.message });
    return null;
  }
  const bytes = await data.arrayBuffer();
  const wavAnalysisStartedAtMs = performance.now();
  const analysis = contentType === 'audio/wav' ? analyzeWavBestEffort(bytes) : null;
  edgeTiming.wavAnalysisMs = elapsedMs(wavAnalysisStartedAtMs);
  const timing = analysis?.timing ?? null;
  const responseBytes = analysis?.audio ?? bytes;
  if (analysis?.failure) {
    diagnostic('warn', 'tts_wav_analysis_failed', requestId, {
      action,
      cache: 'hit',
      audioByteLength: bytes.byteLength,
      wavParsingStage: analysis.failure.stage,
      exceptionName: analysis.failure.name,
      exceptionMessage: analysis.failure.message,
    });
  }
  const timingHeaders = audioTimingHeaders(timing);
  if (timing && Object.keys(timingHeaders).length === 0) {
    diagnostic('warn', 'tts_timing_headers_omitted', requestId, {
      action,
      cache: 'hit',
      stage: 'response_header_creation',
      exceptionName: 'InvalidTimingMetadata',
      exceptionMessage: 'Timing values were outside the encoded audio duration',
    });
  }
  return new Response(responseBytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Length': String(responseBytes.byteLength),
      'X-WordPing-Cache': 'hit',
      'X-WordPing-Request-ID': requestId,
      ...edgeTimingHeaders({
        ...edgeTiming,
        responsePreparationMs: elapsedMs(cacheReadStartedAtMs),
      }),
      ...timingHeaders,
    },
  });
}

async function markGenerationFailed(
  serviceClient: ServiceClient,
  userId: string,
  requestHash: string,
): Promise<void> {
  const { error } = await serviceClient
    .from('speech_custom_generations')
    .update({ status: 'failed', storage_path: null, content_type: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('request_hash', requestHash);
  if (error) console.error('[speech_custom] failed to release generation claim', error.message);
}

async function markVoiceSampleGenerationFailed(
  serviceClient: ServiceClient,
  sampleKey: string,
): Promise<void> {
  const { error } = await serviceClient.rpc('mark_voice_sample_generation_failed', {
    p_sample_key: sampleKey,
  });
  if (error) console.error('[voice_sample_cache] failed to release generation claim', error.message);
}

async function markCardGenerationDone(
  serviceClient: ServiceClient,
  userId: string,
  requestHash: string,
  status: 'completed' | 'failed',
): Promise<void> {
  const { error } = await serviceClient.rpc('mark_speech_card_generation_done', {
    p_user_id: userId,
    p_request_hash: requestHash,
    p_status: status,
  });
  if (error) console.error('[speech_card] failed to update generation status', error.message);
}

async function finalizeCardSpeech(
  serviceClient: ServiceClient,
  userId: string,
  reservationId: string,
  requestHash: string,
  requestId: string,
): Promise<void> {
  const startedAtMs = performance.now();
  const { error } = await serviceClient.rpc('complete_speech_card_usage', {
    p_reservation_id: reservationId,
  });
  if (error) console.error('[speech_card] usage completion failed', error.message);
  await markCardGenerationDone(serviceClient, userId, requestHash, 'completed');
  diagnostic('info', 'tts_background_finalization_complete', requestId, {
    action: 'speech', durationMs: elapsedMs(startedAtMs), success: !error,
  });
}

async function finalizeCustomSpeech(
  serviceClient: ServiceClient,
  userId: string,
  reservationId: string,
  requestHash: string,
  format: 'wav' | 'mp3',
  contentType: string,
  audio: ArrayBuffer,
  requestId: string,
): Promise<void> {
  const startedAtMs = performance.now();
  const { error: completeError } = await serviceClient.rpc('complete_speech_custom_usage', {
    p_reservation_id: reservationId,
  });
  if (completeError) {
    console.error('[speech_custom] usage completion failed', completeError.message);
    await markGenerationFailed(serviceClient, userId, requestHash);
    return;
  }

  const storagePath = `${userId}/${requestHash}.${format}`;
  const { error: uploadError } = await serviceClient.storage
    .from(SPEECH_CACHE_BUCKET)
    .upload(storagePath, audio, { contentType, upsert: true });
  if (uploadError) {
    console.error('[speech_custom_cache] upload failed', uploadError.message);
    await markGenerationFailed(serviceClient, userId, requestHash);
  } else {
    const { error: cacheUpdateError } = await serviceClient
      .from('speech_custom_generations')
      .update({
        status: 'completed',
        storage_path: storagePath,
        content_type: contentType,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('request_hash', requestHash);
    if (cacheUpdateError) {
      console.error('[speech_custom_cache] metadata update failed', cacheUpdateError.message);
      await markGenerationFailed(serviceClient, userId, requestHash);
    }
  }
  diagnostic('info', 'tts_background_finalization_complete', requestId, {
    action: 'speech_custom', durationMs: elapsedMs(startedAtMs), success: !uploadError,
  });
}

async function finalizeVoiceSample(
  serviceClient: ServiceClient,
  sampleKey: string,
  voice: string,
  contentType: string,
  audio: ArrayBuffer,
  requestId: string,
): Promise<void> {
  const startedAtMs = performance.now();
  const storagePath = `voice-samples/${VOICE_SAMPLE_VERSION}/${voice}.wav`;
  const { error: uploadError } = await serviceClient.storage
    .from(SPEECH_CACHE_BUCKET)
    .upload(storagePath, audio, { contentType, upsert: true });
  if (uploadError) {
    console.error('[voice_sample_cache] upload failed', uploadError.message);
    await markVoiceSampleGenerationFailed(serviceClient, sampleKey);
  } else {
    const { error: completeError } = await serviceClient.rpc('complete_voice_sample_generation', {
      p_sample_key: sampleKey,
      p_storage_path: storagePath,
      p_content_type: contentType,
    });
    if (completeError) {
      console.error('[voice_sample_cache] metadata update failed', completeError.message);
      await markVoiceSampleGenerationFailed(serviceClient, sampleKey);
    }
  }
  diagnostic('info', 'tts_background_finalization_complete', requestId, {
    action: 'speech_sample', durationMs: elapsedMs(startedAtMs), success: !uploadError,
  });
}

function runInBackground(task: Promise<void>, requestId: string, action: string): void {
  EdgeRuntime.waitUntil(task.catch(error => {
    diagnostic('error', 'tts_background_finalization_failed', requestId, {
      action, ...exceptionDetails(error),
    });
  }));
}

Deno.serve(async (request: Request) => {
  const handlerStartedAtMs = performance.now();
  const invocationNumber = ++isolateInvocationCount;
  const coldStart = invocationNumber === 1;
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();
  let stage = 'request_validation';
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAIKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: 'unauthorized' }, 401);
  if (!openAIKey) {
    diagnostic('error', 'tts_dependency_unavailable', requestId, {
      stage: 'environment_validation',
      dependency: 'openai',
      exceptionName: 'ConfigurationError',
      exceptionMessage: 'OPENAI_API_KEY is not configured',
    });
    return json({ error: 'service_unavailable' }, 503);
  }
  if (!serviceRoleKey) {
    diagnostic('error', 'tts_dependency_unavailable', requestId, {
      stage: 'environment_validation',
      dependency: 'supabase',
      exceptionName: 'ConfigurationError',
      exceptionMessage: 'SUPABASE_SERVICE_ROLE_KEY is not configured',
    });
    return json({ error: 'service_unavailable' }, 503);
  }

  // Verify user JWT via the anon key — the token is the verified identity.
  const token = authHeader.replace(/^Bearer\s+/i, '');
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  stage = 'supabase_authentication';
  const authStartedAtMs = performance.now();
  let authResult: Awaited<ReturnType<typeof authClient.auth.getUser>>;
  try {
    authResult = await authClient.auth.getUser(token);
  } catch (error) {
    diagnostic('error', 'tts_internal_exception', requestId, {
      stage,
      ...exceptionDetails(error),
    });
    return json({ error: 'service_unavailable' }, 503);
  }
  const { data: { user }, error: authError } = authResult;
  if (authError || !user) return json({ error: 'unauthorized' }, 401);
  const authCompletedAtMs = performance.now();

  let body: Record<string, unknown>;
  try {
    stage = 'request_body_read';
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_request' }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const requestedText = typeof body.text === 'string' ? body.text.trim() : '';
  const requestedVoice = typeof body.voice === 'string' ? body.voice : '';
  const requestedSampleVersion = typeof body.sampleVersion === 'string' ? body.sampleVersion : '';
  const expectedSampleText = action === 'speech_sample' ? VOICE_SAMPLE_TEXT[requestedVoice] : undefined;
  if (action === 'speech_sample') {
    if (!expectedSampleText) return json({ error: 'invalid_voice', received: requestedVoice }, 400);
    if (requestedSampleVersion !== VOICE_SAMPLE_VERSION) {
      return json({ error: 'invalid_sample_version' }, 400);
    }
    if (normalizeSpeechText(requestedText) !== normalizeSpeechText(expectedSampleText)) {
      return json({ error: 'invalid_sample' }, 400);
    }
  }
  const text = expectedSampleText ?? requestedText;

  diagnostic('info', 'tts_request_received', requestId, {
    action,
    textLength: text.length,
    selectedVoice: typeof body.voice === 'string' ? body.voice : null,
    requestedAudioFormat: typeof body.format === 'string' ? body.format : null,
  });

  if (!text) return json({ error: 'input_empty' }, 400);

  // ── Server-side plan enforcement ──────────────────────────────────────────────
  // Read the plan from the database using the service role key.
  // The client cannot override this by sending a plan claim in the request body.
  // Any action not explicitly allowed for the verified plan is rejected here
  // before any OpenAI call is attempted.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  stage = 'plan_lookup';
  const planLookupStartedAtMs = performance.now();
  const { data: planRow, error: planError } = await serviceClient
    .from('user_plans')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle();
  if (planError) {
    diagnostic('error', 'tts_dependency_error', requestId, {
      stage,
      dependency: 'supabase',
      ...exceptionDetails(planError),
    });
  }
  const plan: Plan = (planRow?.plan as Plan) ?? 'free';
  const planLookupCompletedAtMs = performance.now();

  // Access matrix:
  //   free    → no OpenAI access at all
  //   basic   → card speech (action: 'speech') only
  //   premium → card speech + standalone TTS + all text AI actions
  if (action === 'speech' || action === 'speech_sample') {
    if (plan === 'free') return json({ error: 'plan_required', required: 'basic' }, 403);
  } else if (action === 'speech_custom') {
    if (plan !== 'premium') return json({ error: 'premium_required', required: 'premium' }, 403);
  } else if (TEXT_ACTIONS.has(action)) {
    if (plan !== 'premium') return json({ error: 'plan_required', required: 'premium' }, 403);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    action === 'speech' || action === 'speech_custom' || action === 'speech_sample' ? 50000 : 25000,
  );

  // Reservation and deduplication state — declared before try so the catch block
  // can clean up whichever path was active when an unexpected error is thrown.
  let activeReservationId: string | null = null;
  let activeRequestHash: string | null = null;
  let isCardSpeech = false;
  let isVoiceSample = false;

  try {
    if (action === 'speech' || action === 'speech_custom' || action === 'speech_sample') {
      const voice = typeof body.voice === 'string' ? body.voice : '';
      const format = body.format === 'mp3' ? 'mp3' : 'wav';
      if (!VOICES.has(voice)) return json({ error: 'invalid_voice', received: voice }, 400);
      if (action === 'speech_sample' && format !== 'wav') return json({ error: 'invalid_format' }, 400);
      const inputLength = characterCount(text);

      if (action === 'speech') {
        // ── speech_card path ────────────────────────────────────────────────────
        isCardSpeech = true;
        const cardLimits = plan === 'premium' ? SPEECH_CARD_LIMITS.premium : SPEECH_CARD_LIMITS.basic;

        if (inputLength > cardLimits.maxCharactersPerRequest) {
          return json({ error: 'input_too_long', length: inputLength, limit: cardLimits.maxCharactersPerRequest }, 400);
        }

        activeRequestHash = await speechRequestHash(text, voice, format);

        // Prevent concurrent duplicate calls (e.g. two devices requesting the same
        // word simultaneously) from both calling OpenAI.
        stage = 'speech_card_claim';
        const { data: claimStatus, error: claimError } = await serviceClient.rpc(
          'claim_speech_card_generation',
          { p_user_id: user.id, p_request_hash: activeRequestHash },
        );
        if (claimError) {
          diagnostic('error', 'tts_dependency_error', requestId, {
            stage,
            dependency: 'supabase',
            ...exceptionDetails(claimError),
          });
          return json({ error: 'service_unavailable' }, 503);
        }
        if (claimStatus === 'in_progress') {
          return json({ error: 'generation_in_progress' }, 409);
        }

        // Atomically check and reserve quota. OpenAI is never called when this
        // returns an error_code.
        stage = 'speech_card_reservation';
        const { data: reservations, error: reservationError } = await serviceClient.rpc(
          'reserve_speech_card_usage',
          {
            p_user_id:                  user.id,
            p_request_hash:             activeRequestHash,
            p_character_count:          inputLength,
            p_minute_request_limit:     cardLimits.maxRequestsPerMinute,
            p_daily_request_limit:      cardLimits.maxRequestsPerDay,
            p_monthly_request_limit:    cardLimits.maxRequestsPerMonth,
            p_daily_character_limit:    cardLimits.maxCharactersPerDay,
            p_monthly_character_limit:  cardLimits.maxCharactersPerMonth,
          },
        );
        if (reservationError) {
          diagnostic('error', 'tts_dependency_error', requestId, {
            stage,
            dependency: 'supabase',
            ...exceptionDetails(reservationError),
          });
          await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          return json({ error: 'service_unavailable' }, 503);
        }
        const cardReservation = Array.isArray(reservations) ? reservations[0] : reservations;
        if (cardReservation?.error_code) {
          await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          return json({ error: cardReservation.error_code }, 429);
        }
        activeReservationId = cardReservation?.reservation_id ?? null;
        if (!activeReservationId) {
          await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          return json({ error: 'service_unavailable' }, 503);
        }
      } else if (action === 'speech_sample') {
        // Fixed, versioned samples are generated once globally and reused by
        // every eligible subscriber. The authenticated request never controls
        // the sample text or its generation settings.
        isVoiceSample = true;
        activeRequestHash = await voiceSampleRequestHash(text, voice, format);
        for (let attempt = 0; attempt < 200; attempt++) {
          stage = 'voice_sample_claim';
          const { data: claims, error: claimError } = await serviceClient.rpc(
            'claim_voice_sample_generation',
            { p_sample_key: activeRequestHash },
          );
          if (claimError) {
            diagnostic('error', 'tts_dependency_error', requestId, {
              stage,
              dependency: 'supabase',
              ...exceptionDetails(claimError),
            });
            return json({ error: 'service_unavailable' }, 503);
          }
          const claim = Array.isArray(claims) ? claims[0] : claims;
          if (claim?.claim_status === 'claimed') break;
          if (claim?.claim_status === 'completed' && claim.storage_path && claim.content_type) {
            stage = 'cached_audio_read';
            const cached = await readCachedSpeech(
              serviceClient,
              claim.storage_path,
              claim.content_type,
              requestId,
              action,
              {
                startedAtMs: handlerStartedAtMs,
                coldStart,
                authMs: elapsedMs(authStartedAtMs, authCompletedAtMs),
                planMs: elapsedMs(planLookupStartedAtMs, planLookupCompletedAtMs),
                preOpenAIMs: elapsedMs(handlerStartedAtMs),
              },
            );
            if (cached) {
              activeRequestHash = null;
              return cached;
            }
            await markVoiceSampleGenerationFailed(serviceClient, activeRequestHash);
            continue;
          }
          if (attempt === 199) return json({ error: 'generation_in_progress' }, 409);
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      } else {
        // ── speech_custom path (unchanged) ──────────────────────────────────────
        const maxLength = SPEECH_CUSTOM_LIMITS.maxCharactersPerRequest;
        if (inputLength > maxLength) {
          return json({ error: 'input_too_long', length: inputLength, limit: maxLength }, 400);
        }

        const instructions = typeof body.instructions === 'string' ? body.instructions : '';
        activeRequestHash = await speechRequestHash(text, voice, format, instructions);

        // Atomically own this exact generation or reuse/wait for the existing one.
        for (let attempt = 0; attempt < 200; attempt++) {
          stage = 'speech_custom_claim';
          const { data: claims, error: claimError } = await serviceClient.rpc(
            'claim_speech_custom_generation',
            { p_user_id: user.id, p_request_hash: activeRequestHash },
          );
          if (claimError) {
            diagnostic('error', 'tts_dependency_error', requestId, {
              stage,
              dependency: 'supabase',
              ...exceptionDetails(claimError),
            });
            return json({ error: 'service_unavailable' }, 503);
          }
          const claim = Array.isArray(claims) ? claims[0] : claims;
          if (claim?.claim_status === 'claimed') break;
          if (claim?.claim_status === 'completed' && claim.storage_path && claim.content_type) {
            stage = 'cached_audio_read';
            const cached = await readCachedSpeech(
              serviceClient,
              claim.storage_path,
              claim.content_type,
              requestId,
              action,
              {
                startedAtMs: handlerStartedAtMs,
                coldStart,
                authMs: elapsedMs(authStartedAtMs, authCompletedAtMs),
                planMs: elapsedMs(planLookupStartedAtMs, planLookupCompletedAtMs),
                preOpenAIMs: elapsedMs(handlerStartedAtMs),
              },
            );
            if (cached) return cached;
            await markGenerationFailed(serviceClient, user.id, activeRequestHash);
            continue;
          }
          if (attempt === 199) return json({ error: 'generation_in_progress' }, 409);
          await new Promise(resolve => setTimeout(resolve, 250));
        }

        stage = 'speech_custom_reservation';
        const { data: reservations, error: reservationError } = await serviceClient.rpc(
          'reserve_speech_custom_usage',
          {
            p_user_id: user.id,
            p_request_hash: activeRequestHash,
            p_character_count: inputLength,
            p_minute_request_limit: SPEECH_CUSTOM_LIMITS.maxRequestsPerMinute,
            p_daily_request_limit: SPEECH_CUSTOM_LIMITS.maxRequestsPerDay,
            p_monthly_request_limit: SPEECH_CUSTOM_LIMITS.maxRequestsPerMonth,
            p_daily_character_limit: SPEECH_CUSTOM_LIMITS.maxCharactersPerDay,
            p_monthly_character_limit: SPEECH_CUSTOM_LIMITS.maxCharactersPerMonth,
          },
        );
        if (reservationError) {
          diagnostic('error', 'tts_dependency_error', requestId, {
            stage,
            dependency: 'supabase',
            ...exceptionDetails(reservationError),
          });
          await markGenerationFailed(serviceClient, user.id, activeRequestHash);
          return json({ error: 'service_unavailable' }, 503);
        }
        const reservation = Array.isArray(reservations) ? reservations[0] : reservations;
        if (reservation?.error_code) {
          await markGenerationFailed(serviceClient, user.id, activeRequestHash);
          const status = reservation.error_code === 'premium_required' ? 403 : 429;
          return json({ error: reservation.error_code }, status);
        }
        activeReservationId = reservation?.reservation_id ?? null;
        if (!activeReservationId) {
          await markGenerationFailed(serviceClient, user.id, activeRequestHash);
          return json({ error: 'service_unavailable' }, 503);
        }
      }

      // ── OpenAI audio generation (shared by both paths) ────────────────────────
      let upstream: Response;
      const openAIRequestStartedAtMs = performance.now();
      let openAIResponseReceivedAtMs = openAIRequestStartedAtMs;
      try {
        stage = 'openai_request';
        upstream = await fetchOpenAISpeech({
          apiKey: openAIKey,
          model: SPEECH_MODEL,
          text,
          voice,
          format,
          signal: controller.signal,
        });
        openAIResponseReceivedAtMs = performance.now();
        diagnostic('info', 'tts_openai_response_received', requestId, {
          stage: 'openai_response',
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          openAIResponseStatus: upstream.status,
          responseContentType: upstream.headers.get('content-type'),
          durationMs: elapsedMs(openAIRequestStartedAtMs, openAIResponseReceivedAtMs),
        });
      } catch (error) {
        diagnostic('error', 'tts_openai_fetch_exception', requestId, {
          stage,
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          ...exceptionDetails(error),
        });
        if (activeReservationId) {
          if (isCardSpeech) {
            await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
          } else {
            await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
          }
        }
        if (activeRequestHash) {
          if (isVoiceSample) await markVoiceSampleGenerationFailed(serviceClient, activeRequestHash);
          else if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        }
        return json({ error: 'upstream_fetch_exception' }, 502);
      }

      if (upstream.status === 429) {
        if (activeReservationId) {
          if (isCardSpeech) {
            await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
          } else {
            await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
          }
        }
        if (activeRequestHash) {
          if (isVoiceSample) await markVoiceSampleGenerationFailed(serviceClient, activeRequestHash);
          else if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        }
        return json({ error: 'quota_exceeded' }, 429);
      }
      if (!upstream.ok) {
        diagnostic('error', 'tts_openai_response_error', requestId, {
          stage: 'openai_response',
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          openAIResponseStatus: upstream.status,
          responseContentType: upstream.headers.get('content-type'),
        });
        if (activeReservationId) {
          if (isCardSpeech) {
            await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
          } else {
            await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
          }
        }
        if (activeRequestHash) {
          if (isVoiceSample) await markVoiceSampleGenerationFailed(serviceClient, activeRequestHash);
          else if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        }
        return json({ error: 'upstream_failed' }, 502);
      }

      stage = 'openai_response_read';
      let upstreamAudio: ArrayBuffer;
      const audioReadStartedAtMs = performance.now();
      try {
        upstreamAudio = await upstream.arrayBuffer();
      } catch (error) {
        diagnostic('error', 'tts_audio_read_exception', requestId, {
          stage,
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          openAIResponseStatus: upstream.status,
          responseContentType: upstream.headers.get('content-type'),
          ...exceptionDetails(error),
        });
        throw error;
      }
      diagnostic('info', 'tts_audio_downloaded', requestId, {
        stage,
        action,
        textLength: inputLength,
        selectedVoice: voice,
        requestedAudioFormat: format,
        openAIResponseStatus: upstream.status,
        responseContentType: upstream.headers.get('content-type'),
        audioByteLength: upstreamAudio.byteLength,
        durationMs: elapsedMs(audioReadStartedAtMs),
      });
      const contentType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
      stage = 'wav_analysis';
      const wavAnalysisStartedAtMs = performance.now();
      const analysis = format === 'wav' ? analyzeWavBestEffort(upstreamAudio) : null;
      const wavAnalysisCompletedAtMs = performance.now();
      const timing = analysis?.timing ?? null;
      const arrayBuffer = analysis?.audio ?? upstreamAudio;

      if (timing) {
        diagnostic('info', 'tts_wav_analysis_complete', requestId, {
          stage,
          wavParsingStage: 'complete',
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          audioByteLength: upstreamAudio.byteLength,
          before: timing.before,
          after: timing.after,
          trimmed: timing.trimmed,
          removedBytes: upstreamAudio.byteLength - arrayBuffer.byteLength,
          durationMs: elapsedMs(wavAnalysisStartedAtMs, wavAnalysisCompletedAtMs),
        });
      } else if (analysis?.failure) {
        diagnostic('warn', 'tts_wav_analysis_failed', requestId, {
          stage,
          wavParsingStage: analysis.failure.stage,
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          audioByteLength: upstreamAudio.byteLength,
          exceptionName: analysis.failure.name,
          exceptionMessage: analysis.failure.message,
        });
      }

      if (isVoiceSample && activeRequestHash) {
        runInBackground(
          finalizeVoiceSample(
            serviceClient, activeRequestHash, voice, contentType, arrayBuffer, requestId,
          ),
          requestId,
          action,
        );
        activeRequestHash = null;
      } else if (activeReservationId && activeRequestHash) {
        const finalization = isCardSpeech
          ? finalizeCardSpeech(
              serviceClient, user.id, activeReservationId, activeRequestHash, requestId,
            )
          : finalizeCustomSpeech(
              serviceClient, user.id, activeReservationId, activeRequestHash,
              format, contentType, arrayBuffer, requestId,
            );
        runInBackground(finalization, requestId, action);
        activeReservationId = null;
        activeRequestHash = null;
      }

      stage = 'audio_response_construction';
      const timingHeaders = audioTimingHeaders(timing);
      if (timing && Object.keys(timingHeaders).length === 0) {
        diagnostic('warn', 'tts_timing_headers_omitted', requestId, {
          stage: 'response_header_creation',
          action,
          textLength: inputLength,
          selectedVoice: voice,
          requestedAudioFormat: format,
          exceptionName: 'InvalidTimingMetadata',
          exceptionMessage: 'Timing values were outside the encoded audio duration',
        });
      }
      const headers = {
        ...corsHeaders,
        'Content-Type': contentType,
        'Content-Length': String(arrayBuffer.byteLength),
        'X-WordPing-Cache': 'miss',
        'X-WordPing-Request-ID': requestId,
        ...edgeTimingHeaders({
          startedAtMs: handlerStartedAtMs,
          coldStart,
          authMs: elapsedMs(authStartedAtMs, authCompletedAtMs),
          planMs: elapsedMs(planLookupStartedAtMs, planLookupCompletedAtMs),
          preOpenAIMs: elapsedMs(handlerStartedAtMs, openAIRequestStartedAtMs),
          openAIMs: elapsedMs(openAIRequestStartedAtMs, openAIResponseReceivedAtMs),
          audioReadMs: elapsedMs(audioReadStartedAtMs, wavAnalysisStartedAtMs),
          wavAnalysisMs: elapsedMs(wavAnalysisStartedAtMs, wavAnalysisCompletedAtMs),
          responsePreparationMs: elapsedMs(wavAnalysisCompletedAtMs),
        }),
        ...timingHeaders,
      };
      diagnostic('info', 'tts_audio_response_ready', requestId, {
        stage,
        action,
        textLength: inputLength,
        selectedVoice: voice,
        requestedAudioFormat: format,
        audioByteLength: arrayBuffer.byteLength,
        timingHeadersPresent: Object.keys(timingHeaders).length > 0,
        coldStart,
        totalDurationMs: elapsedMs(handlerStartedAtMs),
        authDurationMs: elapsedMs(authStartedAtMs, authCompletedAtMs),
        planDurationMs: elapsedMs(planLookupStartedAtMs, planLookupCompletedAtMs),
        preOpenAIDurationMs: elapsedMs(handlerStartedAtMs, openAIRequestStartedAtMs),
        openAIDurationMs: elapsedMs(openAIRequestStartedAtMs, openAIResponseReceivedAtMs),
        audioReadDurationMs: elapsedMs(audioReadStartedAtMs, wavAnalysisStartedAtMs),
        wavAnalysisDurationMs: elapsedMs(wavAnalysisStartedAtMs, wavAnalysisCompletedAtMs),
        responsePreparationDurationMs: elapsedMs(wavAnalysisCompletedAtMs),
      });
      return new Response(arrayBuffer, {
        status: 200,
        headers,
      });
    }

    if (!TEXT_ACTIONS.has(action)) return json({ error: 'invalid_action', received: action }, 400);
    if (text.length > 500) return json({ error: 'text_too_long', length: text.length }, 400);
    const language = LANGUAGE_NAMES[typeof body.langCode === 'string' ? body.langCode : ''] ?? 'English';
    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openAIKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: getSystemPrompt(action, language) },
          { role: 'user', content: text },
        ],
        max_tokens: 150,
        temperature: 0.5,
      }),
      signal: controller.signal,
    });
    if (upstream.status === 429) return json({ error: 'quota_exceeded' }, 429);
    if (!upstream.ok) {
      diagnostic('error', 'text_openai_response_error', requestId, {
        stage: 'openai_response',
        action,
        textLength: text.length,
        openAIResponseStatus: upstream.status,
        responseContentType: upstream.headers.get('content-type'),
      });
      return json({ error: 'upstream_failed' }, 502);
    }
    const result = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const output = result.choices?.[0]?.message?.content?.trim();
    if (!output) {
      console.error('[OpenAI text invalid_response]', { choicesLength: result.choices?.length ?? 0 });
      return json({ error: 'invalid_response' }, 502);
    }
    return json({ text: output });
  } catch (error) {
    const isTimeout = error instanceof DOMException && error.name === 'AbortError';
    diagnostic('error', 'tts_internal_exception', requestId, {
      stage,
      action,
      isTimeout,
      ...exceptionDetails(error),
    });
    if (activeReservationId) {
      if (isCardSpeech) {
        await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
      } else {
        await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
      }
    }
    if (activeRequestHash) {
      if (isVoiceSample) await markVoiceSampleGenerationFailed(serviceClient, activeRequestHash);
      else if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
      else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
    }
    if (isTimeout) return json({ error: 'request_timeout' }, 504);
    if (stage.startsWith('openai_')) return json({ error: 'upstream_failed' }, 502);
    if (stage.includes('claim') || stage.includes('reservation') || stage === 'plan_lookup') {
      return json({ error: 'service_unavailable' }, 503);
    }
    return json({ error: 'internal_error' }, 500);
  } finally {
    clearTimeout(timeout);
  }
});
