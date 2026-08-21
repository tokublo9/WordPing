import {
  LANGUAGE_NAMES,
  OPENAI_CHAT_URL,
  OPENAI_SPEECH_URL,
  SPEECH_MODEL,
  TEXT_MODEL,
  type AudioFormat,
  type Voice,
} from './config';
import { log, redactError } from './log';

/**
 * The OpenAI boundary.
 *
 * NO REQUEST IN THIS MODULE IS EVER RETRIED. Once a request has left the
 * isolate there is no way to tell whether OpenAI processed and billed it — a
 * timeout or a dropped connection is indistinguishable from a slow success. An
 * automatic retry would therefore risk paying twice for one user action, so
 * failures surface to the caller and the user retries deliberately if they want
 * to. See docs/COST_CONTROLS.md.
 *
 * Model names and URLs come from config.ts only. Nothing here reads a request
 * body field.
 */

export type UpstreamFailure =
  | { kind: 'timeout' }
  | { kind: 'network' }
  | { kind: 'rate_limited' }
  | { kind: 'status'; status: number };

export class OpenAIError extends Error {
  constructor(readonly failure: UpstreamFailure) {
    super(`openai_${failure.kind}`);
    this.name = 'OpenAIError';
  }
}

function classifyFetchError(error: unknown): UpstreamFailure {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { kind: 'timeout' };
  }
  return { kind: 'network' };
}

export interface SpeechRequest {
  apiKey: string;
  text: string;
  voice: Voice;
  format: AudioFormat;
  /** Optional style hint. Length-capped by the schema before it reaches here. */
  instructions?: string;
  timeoutMs: number;
  /** Never fetch externally when a loopback-only local scenario is active. */
  localMock?: boolean;
}

function localMockWav(): Response {
  const sampleRate = 8_000;
  const samples = 800;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples * 2, true);
  return new Response(bytes, {
    status: 200,
    headers: { 'Content-Type': 'audio/wav', 'Content-Length': String(bytes.byteLength) },
  });
}

/**
 * Returns the raw upstream `Response`. The caller pipes `response.body`
 * straight through to the client, so the audio never lands in isolate memory.
 */
export async function requestSpeech(request: SpeechRequest, requestId: string): Promise<Response> {
  if (request.localMock === true) {
    log('info', 'local_openai_speech_mocked', requestId, { format: request.format });
    return localMockWav();
  }
  let response: Response;
  try {
    response = await fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SPEECH_MODEL,
        input: request.text,
        voice: request.voice,
        response_format: request.format,
        ...(request.instructions ? { instructions: request.instructions } : {}),
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    const failure = classifyFetchError(error);
    log('error', 'openai_speech_failed', requestId, { reason: failure.kind, ...redactError(error) });
    throw new OpenAIError(failure);
  }

  if (response.status === 429) throw new OpenAIError({ kind: 'rate_limited' });
  if (!response.ok || !response.body) {
    log('error', 'openai_speech_status', requestId, {
      status: response.status,
      hasBody: response.body !== null,
    });
    throw new OpenAIError({ kind: 'status', status: response.status });
  }
  return response;
}

const SYSTEM_PROMPTS: Readonly<Record<string, (language: string) => string>> = {
  meaning: language =>
    `You are a concise dictionary. Give the meaning of the user's word or phrase in ${language}. Answer with the meaning only, no preamble, under 200 characters.`,
  translation: language =>
    `You are a concise dictionary. Give the meaning of the user's word or phrase in ${language}. Answer with the meaning only, no preamble, under 200 characters.`,
  breakdown: language =>
    `Explain the structure of the user's word or phrase in ${language}: roots, prefixes, suffixes or grammar. Be brief and use no preamble.`,
  example: language =>
    `Write one natural example sentence using the user's word or phrase, then its ${language} translation on a second line. No preamble.`,
};

export type TextAction = keyof typeof SYSTEM_PROMPTS;

export function languageName(langCode: string | undefined): string {
  return (langCode !== undefined ? LANGUAGE_NAMES[langCode] : undefined) ?? 'English';
}

export interface TextRequest {
  apiKey: string;
  action: TextAction;
  text: string;
  langCode?: string;
  timeoutMs: number;
  /** Never fetch externally when a loopback-only local scenario is active. */
  localMock?: boolean;
}

export async function requestText(request: TextRequest, requestId: string): Promise<string> {
  const prompt = SYSTEM_PROMPTS[request.action];
  if (!prompt) throw new OpenAIError({ kind: 'status', status: 500 });
  if (request.localMock === true) {
    log('info', 'local_openai_text_mocked', requestId, { action: request.action });
    return 'Local development mock response.';
  }

  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${request.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: TEXT_MODEL,
        messages: [
          { role: 'system', content: prompt(languageName(request.langCode)) },
          { role: 'user', content: request.text },
        ],
        max_tokens: 150,
        temperature: 0.5,
      }),
      signal: AbortSignal.timeout(request.timeoutMs),
    });
  } catch (error) {
    const failure = classifyFetchError(error);
    log('error', 'openai_text_failed', requestId, { reason: failure.kind, ...redactError(error) });
    throw new OpenAIError(failure);
  }

  if (response.status === 429) throw new OpenAIError({ kind: 'rate_limited' });
  if (!response.ok) {
    log('error', 'openai_text_status', requestId, { status: response.status });
    throw new OpenAIError({ kind: 'status', status: response.status });
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const output = payload.choices?.[0]?.message?.content?.trim();
  if (!output) {
    // Length only — the generated text is user content and is never logged.
    log('error', 'openai_text_empty', requestId, { choices: payload.choices?.length ?? 0 });
    throw new OpenAIError({ kind: 'status', status: 502 });
  }
  return output;
}
