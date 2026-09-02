import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { WORKER_VERSION } from '../src/version';
import { classifyRevenueCatStatus, sanitizeUpstreamMessage } from '../src/entitlements';
import {
  FUTURE_DATE, makeCtx, makeEnv, makeRequest, mockFetch, revenueCatSubscriber, wavBody,
} from './helpers';

/**
 * Regression for the AI Voice incident: RevenueCat rejected the Worker's key
 * with 401, which surfaced as a generic 503 and read to the user as a speech
 * outage. A rejected key is a configuration fault and must say so.
 */

function voiceCall(env: ReturnType<typeof makeEnv>) {
  return handleRequest(
    makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
    env,
    makeCtx(),
  );
}

describe('a rejected RevenueCat key', () => {
  it('is reported as a configuration fault, not a transient outage', async () => {
    for (const status of [401, 403]) {
      mockFetch([{ match: 'api.revenuecat.com', respond: () => new Response('{}', { status }) }]);
      const response = await voiceCall(makeEnv());
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        error: 'service_not_configured',
        reason: 'entitlement_credentials',
      });
    }
  });

  it('never reveals the key or the upstream body', async () => {
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => new Response(JSON.stringify({ message: 'Invalid API key sk_secret_value' }), { status: 401 }),
    }]);
    const raw = await (await voiceCall(makeEnv())).text();
    expect(raw).not.toContain('sk_secret_value');
    expect(raw).not.toContain('sk-test');
    expect(raw).not.toContain('Invalid API key');
  });

  it('still fails closed — no OpenAI call is made', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 401 }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    await voiceCall(makeEnv());
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });
});

describe('a genuinely transient verification failure', () => {
  it('is retryable and distinct from a configuration fault', async () => {
    for (const status of [500, 502, 503]) {
      mockFetch([{ match: 'api.revenuecat.com', respond: () => new Response('{}', { status }) }]);
      const response = await voiceCall(makeEnv());
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('30');
      await expect(response.json()).resolves.toMatchObject({
        error: 'entitlement_verification_failed',
        reason: 'upstream_error',
      });
    }
  });

  it('classifies a timeout as retryable too', async () => {
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => { const e = new Error('t'); e.name = 'TimeoutError'; throw e; },
    }]);
    await expect((await voiceCall(makeEnv())).json()).resolves.toMatchObject({
      error: 'entitlement_verification_failed', reason: 'timeout',
    });
  });
});

describe('health reports the truth about the key', () => {
  it('reports unauthorized when RevenueCat rejects the key, and is not ok', async () => {
    mockFetch([{ match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 401 }) }]);
    const response = await handleRequest(makeRequest('/v1/health', { method: 'GET' }), makeEnv(), makeCtx());
    const body = (await response.json()) as Record<string, unknown>;
    // The old health said "configured: true" purely because the string existed,
    // which is why it looked green during the outage.
    expect(body.revenueCatKeyConfigured).toBe(true);
    expect(body.revenueCatAuth).toBe('unauthorized');
    expect(body.ok).toBe(false);
  });

  it('reports ok when the key is accepted', async () => {
    mockFetch([{ match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) }]);
    const body = (await (await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }), makeEnv(), makeCtx(),
    )).json()) as Record<string, unknown>;
    expect(body.revenueCatAuth).toBe('ok');
    expect(body.ok).toBe(true);
  });

  it('carries a non-secret version so a stale deployment is visible', async () => {
    mockFetch([{ match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) }]);
    const raw = await (await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }), makeEnv(), makeCtx(),
    )).text();
    const body = JSON.parse(raw) as Record<string, unknown>;
    expect(body.version).toBe(WORKER_VERSION);
    expect(typeof body.version).toBe('string');
    // Nothing sensitive rides along.
    expect(raw).not.toContain('sk-test');
    expect(raw).not.toContain('test-salt');
  });
});

describe('paid users still work once the key is valid', () => {
  it('a Basic user is refused voice, like a Free one', async () => {
    // High-Quality AI Voice is Premium. Basic pays for Custom Voice for Words,
    // which is a local audio file and never reaches this Worker.
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await voiceCall(makeEnv());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'subscription_required',
      requiredTier: 'premium',
    });
  });

  it('a Premium user can generate voice', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    expect((await voiceCall(makeEnv())).status).toBe(200);
  });

  it('a Free user gets subscription_required, not a service failure', async () => {
    mockFetch([{ match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) }]);
    const response = await voiceCall(makeEnv());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'subscription_required' });
  });

  it('every configured voice is accepted and an unknown one fails validation', async () => {
    for (const voice of ['cedar', 'fable', 'alloy', 'ash', 'coral', 'nova', 'marin', 'shimmer']) {
      mockFetch([
        { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
        { match: '/audio/speech', respond: () => wavBody() },
      ]);
      const response = await handleRequest(
        makeRequest('/v1/voice/card', { body: { text: 'hi', voice } }),
        makeEnv(),
        makeCtx(),
      );
      expect(response.status, `${voice} must be accepted`).toBe(200);
    }

    mockFetch([{ match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) }]);
    const bad = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hi', voice: 'not-a-voice' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(bad.status).toBe(400);
    await expect(bad.json()).resolves.toMatchObject({ error: 'invalid_voice' });
  });
});

// ── Status classification (regression) ───────────────────────────────────────

describe('RevenueCat status classification', () => {
  it('treats every 2xx as authorized, including 201', () => {
    // 201 is what RevenueCat returns when the lookup creates a subscriber it
    // has not seen before. It is a success, and reporting it as unauthorized is
    // exactly what made a valid key look rejected.
    for (const status of [200, 201, 202, 204, 299]) {
      expect(classifyRevenueCatStatus(status), `${status} must be ok`).toBe('ok');
    }
  });

  it('treats only 401 and 403 as unauthorized', () => {
    expect(classifyRevenueCatStatus(401)).toBe('unauthorized');
    expect(classifyRevenueCatStatus(403)).toBe('unauthorized');
    for (const status of [400, 402, 429, 500, 502, 503]) {
      expect(classifyRevenueCatStatus(status), `${status} must not be unauthorized`).toBe('unreachable');
    }
  });

  it('treats 404 as authorized — the key worked, the subscriber does not exist', () => {
    expect(classifyRevenueCatStatus(404)).toBe('ok');
  });
});

describe('a 201 flows all the way through', () => {
  it('health reports ok and surfaces the upstream status', async () => {
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 201 }),
    }]);
    const body = (await (await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }), makeEnv(), makeCtx(),
    )).json()) as Record<string, unknown>;

    expect(body.revenueCatAuth).toBe('ok');
    expect(body.revenueCatStatus).toBe(201);
    expect(body.ok).toBe(true);
  });

  it('a real voice request verifies the entitlement instead of erroring', async () => {
    // The live path, not the health probe: a 201 with an active entitlement
    // must produce audio.
    mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => new Response(
          JSON.stringify({ subscriber: { entitlements: { premium: { expires_date: FUTURE_DATE } } } }),
          { status: 201 },
        ),
      },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    expect((await voiceCall(makeEnv())).status).toBe(200);
  });

  it('a 201 with no entitlements resolves to free, not a service error', async () => {
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => new Response(JSON.stringify({ subscriber: { entitlements: {} } }), { status: 201 }),
    }]);
    const response = await voiceCall(makeEnv());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'subscription_required' });
  });
});

describe('a secret with surrounding whitespace', () => {
  it('is trimmed before it reaches the Authorization header', async () => {
    // `echo "sk_..." | wrangler secret put` stores a trailing newline. Sent raw
    // it becomes `Bearer sk_...\n` and RevenueCat answers 401, which is
    // indistinguishable from a genuinely bad key.
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv({ REVENUECAT_SECRET_API_KEY: '  sk-test-revenuecat-key\n' });

    expect((await voiceCall(env)).status).toBe(200);

    const rcCall = calls.find(call => call.url.includes('api.revenuecat.com'));
    const auth = String((rcCall?.init.headers as Record<string, string>).Authorization);
    expect(auth).toBe('Bearer sk-test-revenuecat-key');
    expect(auth).not.toMatch(/\s$/u);
    expect(auth).not.toContain('\n');
  });

  it('the health probe and the live lookup send identical headers', async () => {
    // A probe that authenticated differently could report ok while real
    // requests failed — the failure mode this whole fix is about.
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv({ REVENUECAT_SECRET_API_KEY: ' sk-test-revenuecat-key ' });

    await handleRequest(makeRequest('/v1/health', { method: 'GET' }), env, makeCtx());
    await voiceCall(env);

    const rcCalls = calls.filter(call => call.url.includes('api.revenuecat.com'));
    expect(rcCalls.length).toBeGreaterThanOrEqual(2);
    const headers = rcCalls.map(call => JSON.stringify(call.init.headers));
    expect(new Set(headers).size, 'probe and lookup must send the same headers').toBe(1);
  });

  it('a blank secret is reported as unauthorized rather than probed', async () => {
    const { calls } = mockFetch([{ match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) }]);
    const body = (await (await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }), makeEnv({ REVENUECAT_SECRET_API_KEY: '   ' }), makeCtx(),
    )).json()) as Record<string, unknown>;

    expect(body.revenueCatKeyConfigured).toBe(false);
    expect(body.revenueCatAuth).toBe('unauthorized');
    expect(body.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('server-to-server identification', () => {
  it('never sends X-Platform, which makes RevenueCat reject the secret key', async () => {
    // RevenueCat answers 403 code 7243 "Secret API keys should not be used in
    // your app." when the request looks like it came from a client app. The
    // header is what triggers it, so no RevenueCat call may carry it.
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();

    await handleRequest(makeRequest('/v1/health', { method: 'GET' }), env, makeCtx());
    await voiceCall(env);

    const rcCalls = calls.filter(call => call.url.includes('api.revenuecat.com'));
    expect(rcCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of rcCalls) {
      const headers = call.init.headers as Record<string, string>;
      expect(Object.keys(headers).map(key => key.toLowerCase())).not.toContain('x-platform');
    }
  });

  it("surfaces RevenueCat's reason instead of leaving a bare status", async () => {
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => new Response(
        JSON.stringify({ code: 7243, message: 'Secret API keys should not be used in your app.' }),
        { status: 403 },
      ),
    }]);
    const body = (await (await handleRequest(
      makeRequest('/v1/health', { method: 'GET' }), makeEnv(), makeCtx(),
    )).json()) as Record<string, unknown>;

    expect(body.revenueCatAuth).toBe('unauthorized');
    expect(body.revenueCatStatus).toBe(403);
    expect(body.revenueCatMessage).toContain('7243');
  });

  it('redacts anything key-shaped out of an upstream message', () => {
    expect(sanitizeUpstreamMessage('bad key sk_abcdef123456 supplied')).toBe('bad key [redacted] supplied');
    expect(sanitizeUpstreamMessage('Authorization: Bearer sk_secret_here')).toContain('[redacted]');
    expect(sanitizeUpstreamMessage('x'.repeat(500))).toHaveLength(200);
  });
});
