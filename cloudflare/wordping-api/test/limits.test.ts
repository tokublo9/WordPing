import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { KILLSWITCH_KEY, LIMITS_KEY } from '../src/runtimeConfig';
import { VOICE_SAMPLE_VERSION } from '../src/config';
import {
  chatCompletion,
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  settle,
  wavBody,
} from './helpers';

function premiumUpstreams() {
  return [
    { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
    { match: '/audio/speech', respond: () => wavBody() },
    { match: '/chat/completions', respond: () => chatCompletion('meaning') },
  ];
}

describe('rate limiting', () => {
  it('returns 429 with Retry-After once the per-minute request limit is reached', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    // voice_custom premium: 5 requests per minute.
    for (let index = 0; index < 5; index += 1) {
      const allowed = await handleRequest(
        makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
        env,
        makeCtx(),
      );
      expect(allowed.status).toBe(200);
    }

    const blocked = await handleRequest(
      makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(blocked.status).toBe(429);
    const retryAfter = Number(blocked.headers.get('Retry-After'));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
    await expect(blocked.json()).resolves.toMatchObject({
      error: 'rate_limit_exceeded',
      scope: 'install',
      window: 'minute',
      limit: 5,
    });
  });

  it('does not call OpenAI once the limit is reached', async () => {
    const { calls } = mockFetch(premiumUpstreams());
    const env = makeEnv();
    for (let index = 0; index < 6; index += 1) {
      await handleRequest(
        makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
        env,
        makeCtx(),
      );
    }
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(5);
  });

  it('separates budgets per feature', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    for (let index = 0; index < 5; index += 1) {
      await handleRequest(
        makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
        env,
        makeCtx(),
      );
    }
    // voice_custom is exhausted; voice_card has its own, untouched budget.
    const other = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(other.status).toBe(200);
  });

  it('separates budgets per install', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    for (let index = 0; index < 5; index += 1) {
      await handleRequest(
        makeRequest('/v1/voice/custom', { body: { text: 'hi', voice: 'marin' }, installId: 'install-aaaaaaaaaaaa' }),
        env,
        makeCtx(),
      );
    }
    const otherInstall = await handleRequest(
      makeRequest('/v1/voice/custom', { body: { text: 'hi', voice: 'marin' }, installId: 'install-bbbbbbbbbbbb' }),
      env,
      makeCtx(),
    );
    expect(otherInstall.status).toBe(200);
  });

  it('enforces a daily character budget separately from the request count', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    // Tighten voice_card premium so the character budget binds first.
    await env.WORDPING_KV.put(
      LIMITS_KEY,
      JSON.stringify({ voice_card: { premium: { maxCharsPerDay: 600, maxRequestsPerMinute: 100 } } }),
    );

    for (let index = 0; index < 2; index += 1) {
      const allowed = await handleRequest(
        makeRequest('/v1/voice/card', { body: { text: 'a'.repeat(300), voice: 'marin' } }),
        env,
        makeCtx(),
      );
      expect(allowed.status).toBe(200);
    }

    const blocked = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'a'.repeat(300), voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      error: 'usage_limit_exceeded',
      window: 'day',
      limit: 600,
    });
  });

  it('stores only hashed identifiers in rate-limit keys', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    await handleRequest(
      makeRequest('/v1/voice/card', {
        body: { text: 'hello', voice: 'marin' },
        installId: 'install-0123456789abcdef',
      }),
      env,
      makeCtx(),
    );

    const keys = env.WORDPING_KV.keysStartingWith('rl:');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain('install-0123456789abcdef');
      expect(key).not.toContain('203.0.113.9');
      expect(key).not.toContain('RCAnonymousID');
    }
    expect(keys.some(key => key.includes(':install:'))).toBe(true);
    expect(keys.some(key => key.includes(':ip:'))).toBe(true);
  });
});

describe('operator kill switch', () => {
  it('disables one feature without affecting the others', async () => {
    const { calls } = mockFetch(premiumUpstreams());
    const env = makeEnv();
    await env.WORDPING_KV.put(KILLSWITCH_KEY, JSON.stringify({ voice_custom: true }));

    const disabled = await handleRequest(
      makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(disabled.status).toBe(503);
    expect(disabled.headers.get('Retry-After')).toBe('300');
    await expect(disabled.json()).resolves.toMatchObject({
      error: 'feature_disabled',
      feature: 'voice_custom',
    });
    // Refused before entitlement verification, so nothing was spent.
    expect(calls).toHaveLength(0);

    const stillWorking = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(stillWorking.status).toBe(200);
  });

  it('ignores a malformed kill-switch value rather than failing the request', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    await env.WORDPING_KV.put(KILLSWITCH_KEY, 'not json at all');

    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(200);
  });

  it('lets an operator revoke a whole tier by setting limits to zero', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    await env.WORDPING_KV.put(
      LIMITS_KEY,
      JSON.stringify({ voice_card: { premium: { maxRequestsPerMinute: 0 } } }),
    );

    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(429);
  });

  it('ignores a malformed limits override', async () => {
    mockFetch(premiumUpstreams());
    const env = makeEnv();
    await env.WORDPING_KV.put(LIMITS_KEY, JSON.stringify({ voice_card: { premium: { maxRequestsPerMinute: -5 } } }));

    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(200);
  });
});

describe('upstream failures', () => {
  it('maps an OpenAI timeout to 504', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      {
        match: '/audio/speech',
        respond: () => {
          const error = new Error('timed out');
          error.name = 'TimeoutError';
          throw error;
        },
      },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ error: 'request_timeout' });
  });

  it('maps an OpenAI 429 to quota_exceeded, distinct from our own rate limit', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/chat/completions', respond: () => new Response('{}', { status: 429 }) },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: 'quota_exceeded' });
  });

  it('never retries an OpenAI request that may already have been billed', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => new Response('{}', { status: 500 }) },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(502);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('refuses to relay an audio body larger than the ceiling', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      {
        match: '/audio/speech',
        respond: () =>
          new Response(new Uint8Array(8), {
            status: 200,
            headers: { 'Content-Length': String(64 * 1024 * 1024) },
          }),
      },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ reason: 'audio_too_large' });
  });

  it('returns 500 without detail when a required secret is missing', async () => {
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv({ OPENAI_API_KEY: '' }),
      makeCtx(),
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ error: 'internal_error' });
    expect(Object.keys(body)).toEqual(['error', 'requestId']);
  });
});

describe('voice sample cache', () => {
  it('generates once and serves the rest from KV', async () => {
    const { calls } = mockFetch(premiumUpstreams());
    const env = makeEnv();

    const first = makeCtx();
    const miss = await handleRequest(
      makeRequest('/v1/voice/sample', { body: { voice: 'marin' } }),
      env,
      first,
    );
    expect(miss.status).toBe(200);
    expect(miss.headers.get('X-WordPing-Cache')).toBe('miss');
    // Drain the client branch so the tee'd cache branch can complete.
    await miss.arrayBuffer();
    await settle(first);

    expect(env.WORDPING_KV.keysStartingWith(`sample:${VOICE_SAMPLE_VERSION}:marin`)).toHaveLength(1);

    const hit = await handleRequest(
      makeRequest('/v1/voice/sample', { body: { voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(hit.headers.get('X-WordPing-Cache')).toBe('hit');
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('ignores client-supplied text and uses the server-side sample sentence', async () => {
    const { calls } = mockFetch(premiumUpstreams());
    await handleRequest(
      makeRequest('/v1/voice/sample', { body: { voice: 'nova', text: 'read my arbitrary text' } }),
      makeEnv(),
      makeCtx(),
    );
    const speechCall = calls.find(call => call.url.includes('/audio/speech'));
    const sent = JSON.parse(String(speechCall?.init.body)) as { input: string };
    expect(sent.input).toBe('Welcome to WordPing. This is the Nova voice.');
  });

  it('rejects a voice that has no sample sentence', async () => {
    const { calls } = mockFetch(premiumUpstreams());
    // 'echo' is an allowlisted voice but is not offered in the app's picker.
    const response = await handleRequest(
      makeRequest('/v1/voice/sample', { body: { voice: 'echo' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_voice' });
    expect(calls).toHaveLength(0);
  });
});

describe('health endpoint', () => {
  it('reports configuration presence without revealing values', async () => {
    const response = await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(JSON.parse(raw)).toMatchObject({
      ok: true,
      openAIKeyConfigured: true,
      revenueCatKeyConfigured: true,
      rateLimitSaltConfigured: true,
    });
    expect(raw).not.toContain('sk-test');
  });
});
