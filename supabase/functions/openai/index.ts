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

type Plan = 'free' | 'basic' | 'premium';
type ServiceClient = ReturnType<typeof createClient>;

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

async function readCachedSpeech(
  serviceClient: ServiceClient,
  path: string,
  contentType: string,
): Promise<Response | null> {
  const { data, error } = await serviceClient.storage.from(SPEECH_CACHE_BUCKET).download(path);
  if (error || !data) {
    console.error('[speech_custom_cache] download failed', { path, message: error?.message });
    return null;
  }
  const bytes = await data.arrayBuffer();
  return new Response(bytes, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType,
      'Content-Length': String(bytes.byteLength),
      'X-WordPing-Cache': 'hit',
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

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAIKey = Deno.env.get('OPENAI_API_KEY')?.trim();

  if (!authHeader || !supabaseUrl || !anonKey) return json({ error: 'unauthorized' }, 401);
  if (!openAIKey) return json({ error: 'service_unavailable' }, 503);
  if (!serviceRoleKey) {
    console.error('[plan_check] SUPABASE_SERVICE_ROLE_KEY not set');
    return json({ error: 'service_unavailable' }, 503);
  }

  // Verify user JWT via the anon key — the token is the verified identity.
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

  console.log({
    action,
    textLength: text.length,
    voice: body.voice,
    format: body.format,
  });

  if (!text) return json({ error: 'input_empty' }, 400);

  // ── Server-side plan enforcement ──────────────────────────────────────────────
  // Read the plan from the database using the service role key.
  // The client cannot override this by sending a plan claim in the request body.
  // Any action not explicitly allowed for the verified plan is rejected here
  // before any OpenAI call is attempted.
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: planRow, error: planError } = await serviceClient
    .from('user_plans')
    .select('plan')
    .eq('user_id', user.id)
    .maybeSingle();
  if (planError) {
    console.error('[plan_check] Failed to query user_plans:', planError.message);
  }
  const plan: Plan = (planRow?.plan as Plan) ?? 'free';

  // Access matrix:
  //   free    → no OpenAI access at all
  //   basic   → card speech (action: 'speech') only
  //   premium → card speech + standalone TTS + all text AI actions
  if (action === 'speech') {
    if (plan === 'free') return json({ error: 'plan_required', required: 'basic' }, 403);
  } else if (action === 'speech_custom') {
    if (plan !== 'premium') return json({ error: 'premium_required', required: 'premium' }, 403);
  } else if (TEXT_ACTIONS.has(action)) {
    if (plan !== 'premium') return json({ error: 'plan_required', required: 'premium' }, 403);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), action === 'speech' || action === 'speech_custom' ? 50000 : 25000);

  // Reservation and deduplication state — declared before try so the catch block
  // can clean up whichever path was active when an unexpected error is thrown.
  let activeReservationId: string | null = null;
  let activeRequestHash: string | null = null;
  let isCardSpeech = false;

  try {
    if (action === 'speech' || action === 'speech_custom') {
      const voice = typeof body.voice === 'string' ? body.voice : '';
      const format = body.format === 'mp3' ? 'mp3' : 'wav';
      if (!VOICES.has(voice)) return json({ error: 'invalid_voice', received: voice }, 400);
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
        const { data: claimStatus, error: claimError } = await serviceClient.rpc(
          'claim_speech_card_generation',
          { p_user_id: user.id, p_request_hash: activeRequestHash },
        );
        if (claimError) {
          console.error('[speech_card] claim failed', claimError.message);
          return json({ error: 'service_unavailable' }, 503);
        }
        if (claimStatus === 'in_progress') {
          return json({ error: 'generation_in_progress' }, 409);
        }

        // Atomically check and reserve quota. OpenAI is never called when this
        // returns an error_code.
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
          console.error('[speech_card] reservation failed', reservationError.message);
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
          const { data: claims, error: claimError } = await serviceClient.rpc(
            'claim_speech_custom_generation',
            { p_user_id: user.id, p_request_hash: activeRequestHash },
          );
          if (claimError) {
            console.error('[speech_custom] claim failed', claimError.message);
            return json({ error: 'service_unavailable' }, 503);
          }
          const claim = Array.isArray(claims) ? claims[0] : claims;
          if (claim?.claim_status === 'claimed') break;
          if (claim?.claim_status === 'completed' && claim.storage_path && claim.content_type) {
            const cached = await readCachedSpeech(serviceClient, claim.storage_path, claim.content_type);
            if (cached) return cached;
            await markGenerationFailed(serviceClient, user.id, activeRequestHash);
            continue;
          }
          if (attempt === 199) return json({ error: 'generation_in_progress' }, 409);
          await new Promise(resolve => setTimeout(resolve, 250));
        }

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
          console.error('[speech_custom] reservation failed', reservationError.message);
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
      try {
        upstream = await fetch('https://api.openai.com/v1/audio/speech', {
          method: 'POST',
          headers: { Authorization: `Bearer ${openAIKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: SPEECH_MODEL, input: text, voice, response_format: format }),
          signal: controller.signal,
        });
      } catch (error) {
        console.error('[OpenAI speech fetch exception]', {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
          voice,
          format,
        });
        if (activeReservationId) {
          if (isCardSpeech) {
            await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
          } else {
            await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
          }
        }
        if (activeRequestHash) {
          if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
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
          if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        }
        return json({ error: 'quota_exceeded' }, 429);
      }
      if (!upstream.ok) {
        const upstreamBody = await upstream.text();
        console.error('[OpenAI speech upstream error]', {
          status: upstream.status,
          statusText: upstream.statusText,
          body: upstreamBody,
          model: SPEECH_MODEL,
          voice,
          format,
        });
        if (activeReservationId) {
          if (isCardSpeech) {
            await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
          } else {
            await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
          }
        }
        if (activeRequestHash) {
          if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
          else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        }
        return json({ error: 'upstream_failed', upstreamStatus: upstream.status }, 502);
      }

      console.log('[OpenAI speech response received]', {
        status: upstream.status,
        contentType: upstream.headers.get('content-type'),
        contentLength: upstream.headers.get('content-length'),
      });

      const arrayBuffer = await upstream.arrayBuffer();
      const contentType = format === 'mp3' ? 'audio/mpeg' : 'audio/wav';

      if (isCardSpeech && activeReservationId && activeRequestHash) {
        // OpenAI successfully generated audio: commit the reservation.
        // There is no server-side audio cache for speech_card — the client caches
        // the file locally in Paths.cache/tts/ and replays from disk on subsequent
        // requests, so those replays never reach the Edge Function.
        const { error: completeError } = await serviceClient.rpc(
          'complete_speech_card_usage',
          { p_reservation_id: activeReservationId },
        );
        if (completeError) {
          console.error('[speech_card] usage completion failed', completeError.message);
        }
        await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'completed');
      } else if (activeReservationId && activeRequestHash) {
        // speech_custom: commit the reservation and upload to server-side cache.
        const { error: completeError } = await serviceClient.rpc(
          'complete_speech_custom_usage',
          { p_reservation_id: activeReservationId },
        );
        if (completeError) {
          console.error('[speech_custom] usage completion failed', completeError.message);
          await markGenerationFailed(serviceClient, user.id, activeRequestHash);
          return json({ error: 'service_unavailable' }, 503);
        }

        const storagePath = `${user.id}/${activeRequestHash}.${format}`;
        const { error: uploadError } = await serviceClient.storage
          .from(SPEECH_CACHE_BUCKET)
          .upload(storagePath, arrayBuffer, { contentType, upsert: true });
        if (uploadError) {
          // Usage is consumed because OpenAI did generate it; return the audio
          // and allow a future request to regenerate and re-cache.
          console.error('[speech_custom_cache] upload failed', uploadError.message);
          await markGenerationFailed(serviceClient, user.id, activeRequestHash);
        } else {
          const { error: cacheUpdateError } = await serviceClient
            .from('speech_custom_generations')
            .update({
              status: 'completed',
              storage_path: storagePath,
              content_type: contentType,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('request_hash', activeRequestHash);
          if (cacheUpdateError) {
            console.error('[speech_custom_cache] metadata update failed', cacheUpdateError.message);
            await markGenerationFailed(serviceClient, user.id, activeRequestHash);
          }
        }
      }

      return new Response(arrayBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Content-Length': String(arrayBuffer.byteLength),
          'X-WordPing-Cache': 'miss',
        },
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
      const errorText = await upstream.text();
      console.error('OpenAI upstream error', { status: upstream.status, body: errorText });
      return json({ error: 'upstream_failed', upstreamStatus: upstream.status, upstreamBody: errorText }, 502);
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
    console.error('[OpenAI request exception]', {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : String(error),
      action,
      isTimeout,
    });
    if (activeReservationId) {
      if (isCardSpeech) {
        await serviceClient.rpc('release_speech_card_usage', { p_reservation_id: activeReservationId });
      } else {
        await serviceClient.rpc('release_speech_custom_usage', { p_reservation_id: activeReservationId });
      }
    }
    if (activeRequestHash) {
      if (isCardSpeech) await markCardGenerationDone(serviceClient, user.id, activeRequestHash, 'failed');
      else await markGenerationFailed(serviceClient, user.id, activeRequestHash);
    }
    return json({ error: isTimeout ? 'request_timeout' : 'upstream_failed' }, 502);
  } finally {
    clearTimeout(timeout);
  }
});
