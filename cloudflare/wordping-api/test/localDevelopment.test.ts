import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import {
  BASIC_MONTHLY_LIMIT_SCENARIO,
  localScenarioQuotaKey,
} from '../src/localDevelopment';
import {
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  settle,
} from './helpers';

const LOCAL_APP_USER_ID = '$RCAnonymousID:abc123def456';

function scenarioEnv() {
  return makeEnv({
    OPENAI_API_KEY: '',
    REVENUECAT_SECRET_API_KEY: '',
    LOCAL_AI_VOICE_TEST_SCENARIO: BASIC_MONTHLY_LIMIT_SCENARIO,
  });
}

describe('local Basic monthly-limit scenario', () => {
  it('reports its complete safety contract without contacting an upstream', async () => {
    const { calls } = mockFetch([]);
    const response = await handleRequest(
      makeRequest('/v1/health', { method: 'GET', host: '127.0.0.1' }),
      scenarioEnv(),
      makeCtx(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      localAiVoiceTestScenario: 'basic_monthly_limit',
      entitlement: 'mock-basic',
      upstreamsMocked: true,
      storage: 'isolated-local-kv',
    });
    expect(calls).toHaveLength(0);
  });

  it('seeds 200 and returns the real monthly-limit response without RevenueCat or OpenAI', async () => {
    const { calls } = mockFetch([]);
    const env = scenarioEnv();
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        host: 'localhost',
        body: { text: 'manual local limit test', voice: 'marin' },
      }),
      env,
      makeCtx(),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'monthly_api_limit_reached',
      limit: 200,
      used: 200,
      tier: 'basic',
    });
    const quotaKey = await localScenarioQuotaKey(env, LOCAL_APP_USER_ID);
    expect(await env.WORDPING_KV.get(quotaKey)).toBe('200');
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toEqual([quotaKey]);
    expect(calls).toHaveLength(0);
  });

  it('uses deterministic local audio if an unmetered voice route reaches the upstream boundary', async () => {
    const { calls } = mockFetch([]);
    const env = scenarioEnv();
    const ctx = makeCtx();
    const response = await handleRequest(
      makeRequest('/v1/voice/sample', {
        host: '127.0.0.1',
        body: { voice: 'marin' },
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(44);
    await settle(ctx);
    expect(calls).toHaveLength(0);
  });

  it('ignores the scenario on a non-loopback Worker and follows normal entitlement verification', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        body: { text: 'must not receive local access', voice: 'marin' },
      }),
      makeEnv({ LOCAL_AI_VOICE_TEST_SCENARIO: BASIC_MONTHLY_LIMIT_SCENARIO }),
      makeCtx(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'subscription_required' });
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(1);
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });
});
