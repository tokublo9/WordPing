import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const LANGUAGE_NAMES: Record<string, string> = {
  'en-US': 'English', es: 'Spanish', fr: 'French', ja: 'Japanese', ko: 'Korean',
  'zh-CN': 'Chinese (Simplified)', de: 'German', it: 'Italian', 'pt-BR': 'Portuguese',
  ru: 'Russian', ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', nl: 'Dutch', vi: 'Vietnamese',
  th: 'Thai', id: 'Indonesian', pl: 'Polish', el: 'Greek', sv: 'Swedish',
};
const TEXT_ACTIONS = new Set(['meaning', 'breakdown', 'translation', 'example']);
const VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']);

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

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openAIKey = Deno.env.get('OPENAI_API_KEY');
  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: 'unauthorized' }, 401);
  if (!openAIKey) return json({ error: 'service_unavailable' }, 503);

  const token = authHeader.replace(/^Bearer\s+/i, '');
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return json({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'invalid_request' }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return json({ error: 'input_empty' }, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), action === 'speech' ? 50000 : 25000);
  try {
    if (action === 'speech') {
      const voice = typeof body.voice === 'string' ? body.voice : '';
      const format = body.format === 'mp3' ? 'mp3' : 'wav';
      if (!VOICES.has(voice) || text.length > 4096) return json({ error: 'invalid_request' }, 400);
      const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openAIKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', input: text, voice, response_format: format }),
        signal: controller.signal,
      });
      if (upstream.status === 429) return json({ error: 'quota_exceeded' }, 429);
      if (!upstream.ok) return json({ error: 'upstream_failed' }, 502);
      const bytes = new Uint8Array(await upstream.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
      }
      return json({ audioBase64: btoa(binary) });
    }

    if (!TEXT_ACTIONS.has(action) || text.length > 500) return json({ error: 'invalid_request' }, 400);
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
    if (!upstream.ok) return json({ error: 'upstream_failed' }, 502);
    const result = await upstream.json() as { choices?: Array<{ message?: { content?: string } }> };
    const output = result.choices?.[0]?.message?.content?.trim();
    return output ? json({ text: output }) : json({ error: 'invalid_response' }, 502);
  } catch (error) {
    return json({ error: error instanceof DOMException && error.name === 'AbortError' ? 'request_timeout' : 'upstream_failed' }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
