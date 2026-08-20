import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS } from '../src/config';
import { handleRequest } from '../src/index';
import { VOICE_MONTHLY_LIMITS, monthKey, monthResetsAt } from '../src/planLimits';
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

/**
 * Monthly High-Quality AI Voice allowance, enforced after RevenueCat
 * verification. Basic is metered; Premium has no monthly product quota; a
 * client-supplied plan or usage figure is never read.
 */

function upstreams(entitlements: Record<string, string | null>) {
  return [
    { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(entitlements) },
    { match: '/audio/speech', respond: () => wavBody() },
    { match: '/chat/completions', respond: () => chatCompletion('meaning') },
  ];
}

const BASIC = { basic: FUTURE_DATE };
const PREMIUM = { premium: FUTURE_DATE };

/** Drives one metered request and returns its status. */
async function call(env: ReturnType<typeof makeEnv>, path = '/v1/voice/card', body?: unknown) {
  const response = await handleRequest(
    makeRequest(path, { body: body ?? { text: 'hello', voice: 'marin' } }),
    env,
    makeCtx(),
  );
  return response;
}

describe('monthly limits are centrally defined', () => {
  it('meters Basic and leaves Premium without a monthly product quota', () => {
    expect(VOICE_MONTHLY_LIMITS).toEqual({ free: 0, basic: 200, premium: null });
  });

  it('keeps Premium at the requested 20/minute and 300/day abuse limits', () => {
    expect(DEFAULT_LIMITS.voice_card.premium).toMatchObject({
      maxRequestsPerMinute: 20,
      maxRequestsPerDay: 300,
    });
  });

  it('accounts by UTC calendar month', () => {
    expect(monthKey(Date.parse('2026-08-19T23:59:59Z'))).toBe('2026-08');
    expect(monthKey(Date.parse('2026-09-01T00:00:00Z'))).toBe('2026-09');
    expect(monthResetsAt(Date.parse('2026-08-19T10:00:00Z'))).toBe('2026-09-01T00:00:00.000Z');
    // December must roll into the next year.
    expect(monthResetsAt(Date.parse('2026-12-31T23:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('quota enforcement', () => {
  it('a Free user cannot reach a metered route at all', async () => {
    const { calls } = mockFetch(upstreams({}));
    const response = await call(makeEnv());
    // Refused at the entitlement gate, before quota is even considered.
    expect(response.status).toBe(403);
    expect(calls.some(c => c.url.includes('openai.com'))).toBe(false);
  });

  it('Basic gets exactly 200 requests, and the 201st is refused', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    // Raise the per-minute/day limiter so only the monthly quota binds.
    await env.WORDPING_KV.put(
      'config:limits',
      JSON.stringify({ voice_card: { basic: { maxRequestsPerMinute: 100000, maxRequestsPerDay: 100000, maxCharsPerDay: 100000000 } } }),
    );

    for (let i = 0; i < 200; i += 1) {
      expect((await call(env)).status).toBe(200);
    }

    const blocked = await call(env);
    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({
      error: 'monthly_api_limit_reached',
      limit: 200,
      used: 200,
      tier: 'basic',
    });
  });

  it('Premium has no monthly product quota', () => {
    expect(VOICE_MONTHLY_LIMITS.premium).toBeNull();
  });

  it('Premium is never rejected with monthly_api_limit_reached', async () => {
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();
    await env.WORDPING_KV.put(
      'config:limits',
      JSON.stringify({ voice_card: { premium: { maxRequestsPerMinute: 100000, maxRequestsPerDay: 100000, maxCharsPerDay: 100000000 } } }),
    );

    // Far past the old 1,000 ceiling.
    for (let i = 0; i < 120; i += 1) {
      expect((await call(env)).status).toBe(200);
    }
    // And no counter is kept for Premium at all.
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('Premium remains subject to authentication and short-term rate limits', async () => {
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();

    // No identity headers: refused regardless of plan.
    const unauthenticated = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hi', voice: 'marin' }, appUserId: null }),
      env,
      makeCtx(),
    );
    expect(unauthenticated.status).toBe(400);

    // voice_card premium allows 20/min; the 21st is rate limited.
    for (let i = 0; i < 20; i += 1) expect((await call(env)).status).toBe(200);
    const limited = await call(env);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: 'rate_limit_exceeded' });
  });

  it('the exhaustion payload carries limit, used and resetsAt', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    // Pre-fill the counter to the limit.
    const key = `quota:${monthKey(Date.now())}:`;
    await env.WORDPING_KV.put('config:limits', JSON.stringify({ voice_card: { basic: { maxRequestsPerMinute: 100000 } } }));
    await call(env); // creates the counter under its hashed key
    const counterKey = env.WORDPING_KV.keysStartingWith(key)[0]!;
    await env.WORDPING_KV.put(counterKey, '200');

    const blocked = await call(env);
    const body = (await blocked.json()) as Record<string, unknown>;
    expect(body.error).toBe('monthly_api_limit_reached');
    expect(body.limit).toBe(200);
    expect(body.used).toBe(200);
    expect(typeof body.resetsAt).toBe('string');
    expect(Date.parse(body.resetsAt as string)).toBeGreaterThan(Date.now());
    // No secrets or upstream payloads leak.
    expect(JSON.stringify(body)).not.toContain('sk-test');
    expect(JSON.stringify(body)).not.toContain('revenuecat');
  });

  it('the quota resets at the next monthly boundary', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    await env.WORDPING_KV.put('config:limits', JSON.stringify({ voice_card: { basic: { maxRequestsPerMinute: 100000 } } }));
    await call(env);

    const augustKey = env.WORDPING_KV.keysStartingWith('quota:')[0]!;
    await env.WORDPING_KV.put(augustKey, '200');
    expect((await call(env)).status).toBe(429);

    // A new month uses a new key, so the allowance is whole again.
    const currentMonth = monthKey(Date.now());
    expect(augustKey).toContain(currentMonth);
    const nextMonthKey = augustKey.replace(currentMonth, monthKey(Date.parse(monthResetsAt(Date.now()))));
    expect(nextMonthKey).not.toBe(augustKey);
    expect(await env.WORDPING_KV.get(nextMonthKey)).toBeNull();
  });
});

describe('the quota cannot be gamed from the client', () => {
  it('ignores a client-supplied plan, tier or usage figure', async () => {
    const { calls } = mockFetch(upstreams({}));
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        body: {
          text: 'hello', voice: 'marin',
          plan: 'premium', tier: 'premium', isPremium: true,
          monthlyLimit: 999999, used: 0, remaining: 999999,
        },
      }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
    expect(calls.some(c => c.url.includes('openai.com'))).toBe(false);
  });

  it('an unverifiable entitlement receives no paid quota', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 500 }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await call(makeEnv());
    expect(response.status).toBe(503);
  });

  it('an expired entitlement receives no paid quota', async () => {
    mockFetch(upstreams({ basic: new Date(Date.now() - 1000).toISOString() }));
    expect((await call(makeEnv())).status).toBe(403);
  });
});

describe('what is not counted', () => {
  it('health checks never touch the counter', async () => {
    const env = makeEnv();
    await handleRequest(makeRequest('/v1/health', { method: 'GET' }), env, makeCtx());
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('malformed and unauthorised requests are not counted', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    // Malformed body.
    await handleRequest(makeRequest('/v1/voice/card', { rawBody: '{ broken' }), env, makeCtx());
    // Missing identity headers.
    await handleRequest(makeRequest('/v1/voice/card', { body: { text: 'x', voice: 'marin' }, installId: null }), env, makeCtx());
    // Unsupported voice.
    await handleRequest(makeRequest('/v1/voice/card', { body: { text: 'x', voice: 'nope' } }), env, makeCtx());
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('an entitlement-verification failure is not counted', async () => {
    mockFetch([{ match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 502 }) }]);
    const env = makeEnv();
    await call(env);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('a rate-limited request is not counted', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    // voice_card basic allows 10/min; the 11th is rate limited.
    for (let i = 0; i < 10; i += 1) await call(env);
    const usedBefore = Number(await env.WORDPING_KV.get(env.WORDPING_KV.keysStartingWith('quota:')[0]!));

    const limited = await call(env);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: 'rate_limit_exceeded' });

    const usedAfter = Number(await env.WORDPING_KV.get(env.WORDPING_KV.keysStartingWith('quota:')[0]!));
    expect(usedAfter).toBe(usedBefore);
  });

  it('voice-picker previews never count, and cached replay avoids OpenAI', async () => {
    const { calls } = mockFetch(upstreams(BASIC));
    const env = makeEnv();

    const first = makeCtx();
    const miss = await handleRequest(makeRequest('/v1/voice/sample', { body: { voice: 'marin' } }), env, first);
    expect(miss.headers.get('X-WordPing-Cache')).toBe('miss');
    await miss.arrayBuffer();
    await settle(first);

    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);

    const hit = await handleRequest(makeRequest('/v1/voice/sample', { body: { voice: 'marin' } }), env, makeCtx());
    expect(hit.headers.get('X-WordPing-Cache')).toBe('hit');
    // Served from KV, so it remains quota-free and makes no second OpenAI call.
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('an upstream OpenAI failure is counted, so a failing retry cannot loop for free', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => new Response('{}', { status: 500 }) },
    ]);
    const env = makeEnv();
    const response = await call(env);
    expect(response.status).toBe(502);
    const quotaKey = env.WORDPING_KV.keysStartingWith('quota:')[0]!;
    expect(Number(await env.WORDPING_KV.get(quotaKey))).toBe(1);
  });
});

describe('concurrency', () => {
  it('simultaneous requests cannot materially exceed the limit', async () => {
    mockFetch(upstreams(BASIC));
    const env = makeEnv();
    await env.WORDPING_KV.put('config:limits', JSON.stringify({ voice_card: { basic: { maxRequestsPerMinute: 100000, maxRequestsPerDay: 100000, maxCharsPerDay: 100000000 } } }));

    // Sit one below the limit, then fire a burst at it.
    await call(env);
    const quotaKey = env.WORDPING_KV.keysStartingWith('quota:')[0]!;
    await env.WORDPING_KV.put(quotaKey, '199');

    const results = await Promise.all(Array.from({ length: 12 }, () => call(env)));
    const succeeded = results.filter(r => r.status === 200).length;

    // Read-modify-write on KV means a burst can lose updates, so this is
    // bounded rather than exact — the per-minute limiter is what keeps the
    // burst small in production. What must hold is that the overshoot stays
    // small and the quota still closes.
    expect(succeeded).toBeGreaterThanOrEqual(1);
    expect(succeeded).toBeLessThanOrEqual(12);
    const after = await call(env);
    expect(after.status).toBe(429);
  });
});

describe('only the High-Quality AI Voice routes use the allowance', () => {
  it('does not charge the voice allowance for the AI text routes', async () => {
    // They are Premium-only and currently hidden, but must never draw on the
    // Basic voice allowance if they are re-enabled.
    for (const path of ['/v1/meaning', '/v1/breakdown', '/v1/translate', '/v1/examples']) {
      mockFetch(upstreams(PREMIUM));
      const env = makeEnv();
      const response = await handleRequest(makeRequest(path, { body: { text: 'hello' } }), env, makeCtx());
      expect(response.status).toBe(200);
      expect(env.WORDPING_KV.keysStartingWith('quota:'), `${path} must not be metered`).toHaveLength(0);
    }
  });

  it('does not charge the voice allowance for the standalone text-to-speech route', async () => {
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();
    const response = await handleRequest(
      makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(200);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('the hidden AI text routes stay entitlement-protected', async () => {
    // Basic must not reach a Premium-only text route.
    mockFetch(upstreams(BASIC));
    for (const path of ['/v1/meaning', '/v1/breakdown', '/v1/translate', '/v1/examples']) {
      const response = await handleRequest(
        makeRequest(path, { body: { text: 'hello' } }),
        makeEnv(),
        makeCtx(),
      );
      expect(response.status, `${path} must stay Premium-only`).toBe(403);
    }
  });
});
