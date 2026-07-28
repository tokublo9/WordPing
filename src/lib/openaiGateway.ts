import { DEFAULT_AI_VOICE, isAIVoice, type AIVoice } from './aiVoices';
import { requireSupabaseSession, supabase } from './supabase';

export type AITextAction = 'meaning' | 'breakdown' | 'translation' | 'example';

interface GatewayResponse {
  text?: string;
  error?: string;
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
  action: 'speech' | 'speech_custom' = 'speech',
): Promise<ArrayBuffer> {
  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (!trimmedText) throw new Error('input_empty');

  // Normalize and validate voice — fall back to default if the persisted value
  // is missing, has stale whitespace, or is a legacy name the server rejects.
  const normalizedVoice = typeof voice === 'string' ? voice.trim().toLowerCase() : '';
  const validVoice: AIVoice = isAIVoice(normalizedVoice) ? normalizedVoice : DEFAULT_AI_VOICE;

  if (!supabase) throw new Error('service_unavailable');
  const session = await requireSupabaseSession();

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
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
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

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, text: trimmedText, voice: validVoice, format }),
    signal,
  });

  if (!response.ok) {
    const responseContentType = response.headers.get('content-type') ?? '';
    const errorBody = responseContentType.includes('application/json')
      ? await response.json()
      : await response.text();
    console.error('[TTS Edge Function error]', {
      status: response.status,
      body: errorBody,
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
    throw new Error('service_unavailable');
  }

  return response.arrayBuffer();
}
