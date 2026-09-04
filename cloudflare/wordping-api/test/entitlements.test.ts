import { describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/index';
import { tierFromSubscriber } from '../src/entitlements';
import {
  chatCompletion,
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  PAST_DATE,
  revenueCatSubscriber,
  wavBody,
} from './helpers';

const RESOLVED = { entitlementBasic: 'basic', entitlementPremium: 'premium' };

describe('tierFromSubscriber', () => {
  it('reads premium ahead of basic', () => {
    const payload = { subscriber: { entitlements: { basic: { expires_date: FUTURE_DATE }, premium: { expires_date: FUTURE_DATE } } } };
    expect(tierFromSubscriber(payload, RESOLVED)).toBe('premium');
  });

  it('treats a null expiry as a lifetime entitlement', () => {
    expect(tierFromSubscriber({ subscriber: { entitlements: { basic: { expires_date: null } } } }, RESOLVED)).toBe('basic');
  });

  it('treats an expired entitlement as free', () => {
    expect(tierFromSubscriber({ subscriber: { entitlements: { premium: { expires_date: PAST_DATE } } } }, RESOLVED)).toBe('free');
  });

  it('treats an unparsable expiry as inactive rather than valid', () => {
    expect(tierFromSubscriber({ subscriber: { entitlements: { premium: { expires_date: 'not-a-date' } } } }, RESOLVED)).toBe('free');
  });

  it('ignores entitlement identifiers it was not told to look for', () => {
    expect(tierFromSubscriber({ subscriber: { entitlements: { gold: { expires_date: FUTURE_DATE } } } }, RESOLVED)).toBe('free');
  });

  it('returns free for a subscriber with no entitlements at all', () => {
    expect(tierFromSubscriber({ subscriber: {} }, RESOLVED)).toBe('free');
  });
});

describe('entitlement enforcement', () => {
  it('denies a free user a premium text action', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
      { match: '/chat/completions', respond: () => chatCompletion('nope') },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'subscription_required',
      requiredTier: 'premium',
    });
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });

  it('denies a basic user the premium-only custom voice endpoint', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/custom', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });

  it('allows a basic user the word-card voice endpoint while credits remain', async () => {
    // Basic reaches AI Voice through its one-time grant. The tier gate lets it
    // knock; the credit ledger is what decides whether it proceeds.
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(200);
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(true);
  });

  it('allows a basic user the voice-picker preview, which spends no credit', async () => {
    // The picker previews the voice AI Voice would use, so it moves with it.
    // Its audio is server-authored and KV-cached, so it costs one generation
    // for everyone rather than one credit per subscriber.
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const response = await handleRequest(
      makeRequest('/v1/voice/sample', { body: { voice: 'marin' } }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(200);
    expect([...env.VOICE_CREDITS.states.values()]).toEqual([]);
  });

  it('allows a premium user the word-card voice endpoint', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
  });

  it('never trusts a client-asserted premium flag', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
      { match: '/chat/completions', respond: () => chatCompletion('leaked') },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/meaning', {
        body: { text: 'hello', isPremium: true, subscribed: true, tier: 'premium', plan: 'premium' },
      }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
  });

  it('returns a temporary-service error when RevenueCat is unreachable', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => { throw new TypeError('fetch failed'); } },
      { match: '/chat/completions', respond: () => chatCompletion('should not happen') },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('30');
    // Renamed: a transient failure is now distinct from a rejected key, which
    // reports service_not_configured instead.
    await expect(response.json()).resolves.toMatchObject({
      error: 'entitlement_verification_failed',
    });
  });

  it('returns a temporary-service error when RevenueCat times out', async () => {
    mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => {
          const error = new Error('timed out');
          error.name = 'TimeoutError';
          throw error;
        },
      },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ reason: 'timeout' });
  });

  it('fails closed when RevenueCat returns a server error', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 500 }) },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(503);
  });

  it('treats an unknown subscriber as free rather than as an outage', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => new Response('{}', { status: 404 }) },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
  });

  it('caches a successful lookup instead of re-asking RevenueCat', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/chat/completions', respond: () => chatCompletion('meaning') },
    ]);
    const env = makeEnv();
    for (let index = 0; index < 3; index += 1) {
      const response = await handleRequest(
        makeRequest('/v1/meaning', { body: { text: `word ${index}` } }),
        env,
        makeCtx(),
      );
      expect(response.status).toBe(200);
    }
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(1);
  });

  it('re-checks a free verdict quickly so a new purchase takes effect', async () => {
    const env = makeEnv();
    let subscribed = false;
    mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber(subscribed ? { premium: FUTURE_DATE } : {}),
      },
      { match: '/chat/completions', respond: () => chatCompletion('meaning') },
    ]);

    const denied = await handleRequest(makeRequest('/v1/meaning', { body: { text: 'a' } }), env, makeCtx());
    expect(denied.status).toBe(403);

    // The negative cache lasts 30 s; step past it and the purchase is picked up.
    subscribed = true;
    env.WORDPING_KV.now += 31_000;

    const allowed = await handleRequest(makeRequest('/v1/meaning', { body: { text: 'a' } }), env, makeCtx());
    expect(allowed.status).toBe(200);
  });

  it('never caches a service failure', async () => {
    const env = makeEnv();
    let failing = true;
    mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => (failing ? new Response('{}', { status: 502 }) : revenueCatSubscriber({ premium: FUTURE_DATE })),
      },
      { match: '/chat/completions', respond: () => chatCompletion('meaning') },
    ]);

    expect((await handleRequest(makeRequest('/v1/meaning', { body: { text: 'a' } }), env, makeCtx())).status).toBe(503);
    expect(env.WORDPING_KV.keysStartingWith('entitlement:')).toHaveLength(0);

    failing = false;
    expect((await handleRequest(makeRequest('/v1/meaning', { body: { text: 'a' } }), env, makeCtx())).status).toBe(200);
  });

  it('sends the RevenueCat secret only to RevenueCat, url-encoding the app user id', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/chat/completions', respond: () => chatCompletion('meaning') },
    ]);
    await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' }, appUserId: '$RCAnonymousID:abc123' }),
      makeEnv(),
      makeCtx(),
    );

    const rcCall = calls.find(call => call.url.includes('api.revenuecat.com'));
    expect(rcCall?.url).toBe('https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aabc123');
    expect(String((rcCall?.init.headers as Record<string, string>).Authorization)).toContain('sk-test-revenuecat-key');

    const openAICall = calls.find(call => call.url.includes('openai.com'));
    const openAIHeaders = openAICall?.init.headers as Record<string, string>;
    expect(openAIHeaders.Authorization).toBe('Bearer sk-test-openai-key');
    expect(JSON.stringify(openAIHeaders)).not.toContain('revenuecat');
  });

  it('ignores the dev bypass unless the request arrived over localhost', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
      { match: '/chat/completions', respond: () => chatCompletion('meaning') },
    ]);
    const env = makeEnv({ DEV_BYPASS_ENTITLEMENTS: '1' });

    const deployed = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      env,
      makeCtx(),
    );
    expect(deployed.status).toBe(403);

    const local = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' }, host: 'localhost' }),
      env,
      makeCtx(),
    );
    expect(local.status).toBe(200);
  });

  it('logs no user text and no secret', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(line => { lines.push(String(line)); });
    vi.spyOn(console, 'warn').mockImplementation(line => { lines.push(String(line)); });
    vi.spyOn(console, 'error').mockImplementation(line => { lines.push(String(line)); });

    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/chat/completions', respond: () => chatCompletion('a very private completion') },
    ]);
    await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'my-secret-vocabulary-word' } }),
      makeEnv(),
      makeCtx(),
    );

    const combined = lines.join('\n');
    expect(combined).not.toContain('my-secret-vocabulary-word');
    expect(combined).not.toContain('a very private completion');
    expect(combined).not.toContain('sk-test-openai-key');
    expect(combined).not.toContain('sk-test-revenuecat-key');
    expect(combined).not.toContain('$RCAnonymousID');
    expect(combined).not.toContain('203.0.113.9');
  });

  it('does not log raw AI input or a request body when an upstream request fails', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(line => { lines.push(String(line)); });
    vi.spyOn(console, 'warn').mockImplementation(line => { lines.push(String(line)); });
    vi.spyOn(console, 'error').mockImplementation(line => { lines.push(String(line)); });

    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => { throw new Error('upstream connection failed'); } },
    ]);
    await handleRequest(
      makeRequest('/v1/voice/card', {
        body: { text: 'private-word-that-must-never-be-logged', voice: 'marin' },
      }),
      makeEnv(),
      makeCtx(),
    );

    const combined = lines.join('\n');
    expect(combined).not.toContain('private-word-that-must-never-be-logged');
    expect(combined).not.toContain('"text"');
    expect(combined).not.toContain('"body"');
  });
});
