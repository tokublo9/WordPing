import type { AIVoice } from './aiVoices';
import { requireSupabaseSession, supabase } from './supabase';

export type AITextAction = 'meaning' | 'breakdown' | 'translation' | 'example';

interface GatewayResponse {
  text?: string;
  audioBase64?: string;
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
    if (status === 401 || status === 403) throw new Error('authentication_failed');
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
): Promise<string> {
  const result = await invokeGateway({ action: 'speech', text, voice, format }, signal, 60000);
  if (typeof result.audioBase64 !== 'string' || !result.audioBase64) throw new Error('invalid_response');
  return result.audioBase64;
}
