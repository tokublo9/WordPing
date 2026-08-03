export interface OpenAISpeechRequest {
  apiKey: string;
  model: string;
  text: string;
  voice: string;
  format: 'wav' | 'mp3';
  signal?: AbortSignal;
}

type FetchImplementation = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Deno-compatible OpenAI request boundary with an injectable fetch for tests. */
export function fetchOpenAISpeech(
  request: OpenAISpeechRequest,
  fetchImplementation: FetchImplementation = fetch,
): Promise<Response> {
  return fetchImplementation('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${request.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      input: request.text,
      voice: request.voice,
      response_format: request.format,
    }),
    signal: request.signal,
  });
}
