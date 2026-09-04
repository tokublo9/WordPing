import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS, FEATURE_TIER } from '../src/config';
import { VOICE_LIFETIME_CREDITS, VOICE_QUOTA_FEATURES } from '../src/planLimits';
import { privacyHash } from '../src/identity';
import { handleRequest } from '../src/index';
import { reserveMonthlyQuota } from '../src/monthlyQuota';
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
 * verification.
 *
 * NO TIER IS METERED BY THE MONTH. Premium is sold as included, so its limit is
 * null. Basic's 200 are a one-time lifetime grant with its own module and its
 * own tests (lifetimeCredits) — deliberately not this counter, which resets
 * every month. VOICE_QUOTA_FEATURES is empty, so nothing routes here at all.
 *
 * The machinery below is therefore dormant rather than deleted: it is what a
 * future genuinely-monthly plan would switch back on, and the tests here pin
 * the two things that still have to hold — that nothing opens a counter, and
 * that a zero limit refuses without spending anything.
 *
 * A client-supplied plan or usage figure is still never read.
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
const DEFAULT_APP_USER_ID = '$RCAnonymousID:abc123def456';

afterEach(() => {
  vi.useRealTimers();
});

async function monthlyUsageKey(
  env: ReturnType<typeof makeEnv>,
  appUserId: string,
  now: number,
): Promise<string> {
  const hashedAppUserId = await privacyHash(env, 'rcuser', appUserId);
  return `quota:${monthKey(now)}:${hashedAppUserId}`;
}

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
  it('gives no tier a monthly product quota', () => {
    // Zero here means "no *monthly* allowance", not "no feature": Basic's
    // access is VOICE_LIFETIME_CREDITS, which this counter never sees.
    expect(VOICE_MONTHLY_LIMITS).toEqual({ free: 0, basic: 0, premium: null });
    expect(VOICE_LIFETIME_CREDITS).toEqual({ free: 0, basic: 200, premium: null });
    // Basic may reach the route; the credit ledger decides whether it proceeds.
    expect(FEATURE_TIER.voice_card).toBe('basic');
    expect(FEATURE_TIER.voice_sample).toBe('basic');
    // Nothing is routed through the monthly counter any more.
    expect(VOICE_QUOTA_FEATURES).toEqual([]);
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

  it('the only entitled tier is unmetered, so a granted request opens no counter', async () => {
    // The replacement for the old 199/200/201 walk. That sequence needed a
    // metered tier that could also reach the route, and no tier is both today.
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();
    expect((await call(env)).status).toBe(200);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('a zero-limit tier is refused without spending or writing anything', async () => {
    // Driven directly, because the entitlement gate stops these tiers before the
    // reservation is reached. This is the branch a future metered plan revives.
    const env = makeEnv();
    for (const tier of ['free', 'basic'] as const) {
      const decision = await reserveMonthlyQuota(env, { tier, hashedAppUserId: 'hashed' }, 'req');
      expect(decision.allowed, `${tier} has no allowance to spend`).toBe(false);
      expect(decision.limit).toBe(0);
      expect(decision.used).toBe(0);
      expect(Date.parse(decision.resetsAt)).toBeGreaterThan(Date.now());
    }
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
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

  it('an exhausted reservation reports limit, used and resetsAt and leaks nothing', async () => {
    // Over HTTP this payload is currently unreachable — no tier is both entitled
    // and metered — so the refusal shape is pinned at the reservation itself.
    const env = makeEnv();
    const key = await monthlyUsageKey(env, DEFAULT_APP_USER_ID, Date.now());
    await env.WORDPING_KV.put(key, '200');
    const hashedAppUserId = await privacyHash(env, 'rcuser', DEFAULT_APP_USER_ID);

    const decision = await reserveMonthlyQuota(env, { tier: 'basic', hashedAppUserId }, 'req');
    expect(decision.allowed).toBe(false);
    expect(decision.limit).toBe(0);
    expect(typeof decision.resetsAt).toBe('string');
    expect(Date.parse(decision.resetsAt)).toBeGreaterThan(Date.now());
    // The refusal carries counters and a date, never a secret or an upstream body.
    expect(JSON.stringify(decision)).not.toContain('sk-test');
    expect(JSON.stringify(decision)).not.toContain('revenuecat');
    // ...and it spends nothing: the seeded counter is untouched.
    expect(await env.WORDPING_KV.get(key)).toBe('200');
  });

  it('the quota resets at the next monthly boundary', async () => {
    // Pure key arithmetic, which is what the reset actually is: a new UTC month
    // means a different counter key, so the allowance is whole again.
    const env = makeEnv();
    const augustNow = Date.parse('2026-08-19T10:00:00.000Z');
    const augustKey = await monthlyUsageKey(env, DEFAULT_APP_USER_ID, augustNow);
    await env.WORDPING_KV.put(augustKey, '200');

    const septemberNow = Date.parse(monthResetsAt(augustNow));
    const septemberKey = await monthlyUsageKey(env, DEFAULT_APP_USER_ID, septemberNow);
    expect(augustKey).toContain('2026-08');
    expect(septemberKey).toContain('2026-09');
    expect(septemberKey).not.toBe(augustKey);
    expect(await env.WORDPING_KV.get(septemberKey)).toBeNull();
    expect(await env.WORDPING_KV.get(augustKey)).toBe('200');
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

  it('a rate-limited request is refused by the short-term limiter, not the counter', async () => {
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();
    // voice_card premium allows 20/min; the 21st is rate limited. With no tier
    // metered, the per-minute and per-day limits are the live protection.
    for (let i = 0; i < 20; i += 1) expect((await call(env)).status).toBe(200);

    const limited = await call(env);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({ error: 'rate_limit_exceeded' });
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('voice-picker previews never count, and cached replay avoids OpenAI', async () => {
    const { calls } = mockFetch(upstreams(PREMIUM));
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

  it('an upstream OpenAI failure is reported without a stack trace or a retry', async () => {
    // This used to assert the failure still spent a monthly unit, so a
    // deliberately-failing request could not loop for free. With no tier
    // metered there is no unit to spend: the per-minute and per-day limits in
    // ratelimit.ts are what bound the loop now, and the Worker never retries.
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(PREMIUM) },
      { match: '/audio/speech', respond: () => new Response('{}', { status: 500 }) },
    ]);
    const env = makeEnv();
    const response = await call(env);
    expect(response.status).toBe(502);
    // One upstream attempt, never a retry — a timeout is indistinguishable from
    // a slow success and a retry risks billing twice.
    expect(calls.filter(c => c.url.includes('/audio/speech'))).toHaveLength(1);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });
});

describe('concurrency', () => {
  it('a burst of granted requests still opens no counter', async () => {
    // The old test bounded the overshoot of a read-modify-write counter under a
    // burst. Without a metered tier there is no counter to overshoot; what must
    // still hold is that a burst neither creates one nor escapes the limiter.
    mockFetch(upstreams(PREMIUM));
    const env = makeEnv();
    const results = await Promise.all(Array.from({ length: 12 }, () => call(env)));
    expect(results.every(r => r.status === 200 || r.status === 429)).toBe(true);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
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
