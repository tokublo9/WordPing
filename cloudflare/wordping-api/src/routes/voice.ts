import {
  DEFAULT_VOICE,
  MAX_AUDIO_RESPONSE_BYTES,
  PROMO_SAMPLE_CACHE_TTL_SECONDS,
  PROMO_SAMPLE_VERSION,
  PROMO_SAMPLE_VOICE,
  VOICE_SAMPLE_CACHE_TTL_SECONDS,
  VOICE_SAMPLE_TEXT,
  VOICE_SAMPLE_VERSION,
  promoSampleText,
  resolvePromoLang,
  resolveVoice,
  type AudioFormat,
  type Voice,
} from '../config';
import { audioResponse, errorResponse, type ResponseContext } from '../http';
import { log } from '../log';
import { requestSpeech } from '../openai';
import { guard, type GuardContext } from '../pipeline';
import { voiceCardSchema, voiceCustomSchema, voicePromoSchema, voiceSampleSchema } from '../schemas';

function contentTypeFor(format: AudioFormat): string {
  return format === 'mp3' ? 'audio/mpeg' : 'audio/wav';
}

function voiceOrNull(voice: string): 'invalid_voice' | null {
  return resolveVoice(voice) === null ? 'invalid_voice' : null;
}

/**
 * Upstream declares a size we are unwilling to relay. Streaming means we cannot
 * measure the body without buffering it, so the declared length is the only
 * pre-flight signal available; an undeclared length is allowed through, and
 * OpenAI's own output ceiling bounds it in practice.
 */
function tooLarge(upstream: Response): boolean {
  const declared = Number(upstream.headers.get('Content-Length') ?? '');
  return Number.isFinite(declared) && declared > MAX_AUDIO_RESPONSE_BYTES;
}

function relay(
  response: ResponseContext,
  upstream: Response,
  format: AudioFormat,
  cache: 'hit' | 'miss',
  body: BodyInit,
): Response {
  const headers: Record<string, string> = { 'X-WordPing-Cache': cache };
  const declared = upstream.headers.get('Content-Length');
  if (declared !== null) headers['Content-Length'] = declared;
  return audioResponse(response, body, contentTypeFor(format), headers);
}

/** POST /v1/voice/card — word-card pronunciation. Basic and Premium. */
export async function handleVoiceCard(context: GuardContext): Promise<Response> {
  const result = await guard(context, {
    feature: 'voice_card',
    schema: voiceCardSchema,
    validate: body => voiceOrNull(body.voice),
    billableText: body => body.text,
  });
  if (!result.ok) return result.response;

  const { body, characters } = result.value;
  const voice = resolveVoice(body.voice) ?? DEFAULT_VOICE;
  const format: AudioFormat = body.format ?? 'wav';

  const upstream = await requestSpeech(
    {
      apiKey: context.env.OPENAI_API_KEY,
      text: body.text,
      voice,
      format,
      timeoutMs: context.resolved.speechTimeoutMs,
    },
    context.response.requestId,
  );
  if (tooLarge(upstream)) {
    await upstream.body?.cancel();
    return errorResponse(context.response, 'upstream_failed', 502, { reason: 'audio_too_large' });
  }

  log('info', 'voice_card_ok', context.response.requestId, { voice, format, characters });
  return relay(context.response, upstream, format, 'miss', upstream.body!);
}

/**
 * POST /v1/voice/sample — voice previews for the picker.
 *
 * The sample sentence is chosen server-side, so no user text is involved and
 * the result is identical for every caller. That makes it the one response
 * worth caching in KV: eight voices generated once, then served to everyone.
 */
export async function handleVoiceSample(context: GuardContext): Promise<Response> {
  const result = await guard(context, {
    feature: 'voice_sample',
    schema: voiceSampleSchema,
    // Previews are identical for every caller and usually served from KV. A
    // cache hit costs nothing upstream, so it must not consume monthly quota.
    deferQuota: true,
    validate: body => {
      const voice = resolveVoice(body.voice);
      if (voice === null) return 'invalid_voice';
      return VOICE_SAMPLE_TEXT[voice] === undefined ? 'invalid_voice' : null;
    },
    billableText: body => {
      const voice = resolveVoice(body.voice);
      return (voice !== null ? VOICE_SAMPLE_TEXT[voice] : undefined) ?? '';
    },
  });
  if (!result.ok) return result.response;

  const voice = resolveVoice(result.value.body.voice) as Voice;
  const text = VOICE_SAMPLE_TEXT[voice] as string;
  const cacheKey = `sample:${VOICE_SAMPLE_VERSION}:${voice}.wav`;

  const cached = await context.env.WORDPING_KV.get(cacheKey, 'arrayBuffer').catch(() => null);
  if (cached) {
    log('info', 'voice_sample_cache_hit', context.response.requestId, { voice });
    return audioResponse(context.response, cached, contentTypeFor('wav'), {
      'X-WordPing-Cache': 'hit',
      'Content-Length': String(cached.byteLength),
    });
  }

  // Cache miss: this request is about to reach OpenAI, so it is charged.
  const exhausted = await result.value.reserveQuota();
  if (exhausted) return exhausted;

  const upstream = await requestSpeech(
    {
      apiKey: context.env.OPENAI_API_KEY,
      text,
      voice,
      format: 'wav',
      timeoutMs: context.resolved.speechTimeoutMs,
    },
    context.response.requestId,
  );
  if (tooLarge(upstream)) {
    await upstream.body?.cancel();
    return errorResponse(context.response, 'upstream_failed', 502, { reason: 'audio_too_large' });
  }

  // Split the stream: one branch goes to the client immediately, the other is
  // written to KV in the background. Neither is buffered in the isolate.
  const [toClient, toCache] = upstream.body!.tee();
  context.ctx.waitUntil(
    context.env.WORDPING_KV
      .put(cacheKey, toCache, { expirationTtl: VOICE_SAMPLE_CACHE_TTL_SECONDS })
      .catch(() => {
        log('warn', 'voice_sample_cache_write_failed', context.response.requestId, { voice });
      }),
  );

  log('info', 'voice_sample_ok', context.response.requestId, { voice });
  return relay(context.response, upstream, 'wav', 'miss', toClient);
}

/**
 * POST /v1/voice/promo — the two promotional clips in the Upgrade Plan sheet.
 *
 * The only speech route reachable without a subscription. What makes that safe
 * is not a flag but the shape of the request: there is no text field and no
 * voice field, so a caller picks one of two server-authored sentences and
 * nothing else. Both clips live in KV, shared by every user, which means the
 * entire feature costs two OpenAI generations per cache lifetime.
 *
 * Never metered against the Basic monthly voice allowance — `voice_promo` is
 * absent from VOICE_QUOTA_FEATURES — and never a substitute for /v1/voice/card,
 * which still requires an entitlement for arbitrary text.
 */
export async function handleVoicePromo(context: GuardContext): Promise<Response> {
  const result = await guard(context, {
    feature: 'voice_promo',
    schema: voicePromoSchema,
    // A cached clip costs nothing upstream; the route reserves only on a miss.
    // (No tier meters this feature today, so this is belt and braces.)
    deferQuota: true,
    billableText: body => promoSampleText(body.sample, resolvePromoLang(body.langCode)),
  });
  if (!result.ok) return result.response;

  const { sample } = result.value.body;
  const lang = resolvePromoLang(result.value.body.langCode);
  const text = promoSampleText(sample, lang);
  const cacheKey = `promo:${PROMO_SAMPLE_VERSION}:${sample}:${lang}.wav`;

  const cached = await context.env.WORDPING_KV.get(cacheKey, 'arrayBuffer').catch(() => null);
  if (cached) {
    log('info', 'voice_promo_cache_hit', context.response.requestId, { sample, lang });
    return audioResponse(context.response, cached, contentTypeFor('wav'), {
      'X-WordPing-Cache': 'hit',
      'Content-Length': String(cached.byteLength),
    });
  }

  const exhausted = await result.value.reserveQuota();
  if (exhausted) return exhausted;

  const upstream = await requestSpeech(
    {
      apiKey: context.env.OPENAI_API_KEY,
      text,
      voice: PROMO_SAMPLE_VOICE,
      format: 'wav',
      timeoutMs: context.resolved.speechTimeoutMs,
    },
    context.response.requestId,
  );
  if (tooLarge(upstream)) {
    await upstream.body?.cancel();
    return errorResponse(context.response, 'upstream_failed', 502, { reason: 'audio_too_large' });
  }

  const [toClient, toCache] = upstream.body!.tee();
  context.ctx.waitUntil(
    context.env.WORDPING_KV
      .put(cacheKey, toCache, { expirationTtl: PROMO_SAMPLE_CACHE_TTL_SECONDS })
      .catch(() => {
        log('warn', 'voice_promo_cache_write_failed', context.response.requestId, { sample, lang });
      }),
  );

  log('info', 'voice_promo_ok', context.response.requestId, { sample, lang });
  return relay(context.response, upstream, 'wav', 'miss', toClient);
}

/** POST /v1/voice/custom — standalone text-to-speech screen. Premium only. */
export async function handleVoiceCustom(context: GuardContext): Promise<Response> {
  const result = await guard(context, {
    feature: 'voice_custom',
    schema: voiceCustomSchema,
    validate: body => voiceOrNull(body.voice),
    billableText: body => body.text,
  });
  if (!result.ok) return result.response;

  const { body, characters } = result.value;
  const voice = resolveVoice(body.voice) ?? DEFAULT_VOICE;
  const format: AudioFormat = body.format ?? 'wav';

  const upstream = await requestSpeech(
    {
      apiKey: context.env.OPENAI_API_KEY,
      text: body.text,
      voice,
      format,
      timeoutMs: context.resolved.speechTimeoutMs,
      ...(body.instructions ? { instructions: body.instructions } : {}),
    },
    context.response.requestId,
  );
  if (tooLarge(upstream)) {
    await upstream.body?.cancel();
    return errorResponse(context.response, 'upstream_failed', 502, { reason: 'audio_too_large' });
  }

  log('info', 'voice_custom_ok', context.response.requestId, { voice, format, characters });
  return relay(context.response, upstream, format, 'miss', upstream.body!);
}
