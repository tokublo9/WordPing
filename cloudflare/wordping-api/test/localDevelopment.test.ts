import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { LOCAL_AI_VOICE_SCENARIO } from '../src/localDevelopment';
import {
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  settle,
} from './helpers';

function scenarioEnv() {
  return makeEnv({
    OPENAI_API_KEY: '',
    REVENUECAT_SECRET_API_KEY: '',
    LOCAL_AI_VOICE_TEST_SCENARIO: LOCAL_AI_VOICE_SCENARIO,
  });
}

describe('local AI-voice scenario', () => {
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
      localAiVoiceTestScenario: 'local_ai_voice',
      entitlement: 'mock-premium',
      upstreamsMocked: true,
      storage: 'isolated-local-kv',
    });
    expect(calls).toHaveLength(0);
  });

  it('serves word-card voice from the mocked Premium entitlement, with no upstream', async () => {
    // The scenario mocks Premium because that is the tier AI Voice belongs to.
    // It used to mock Basic and assert the 200-generation exhaustion response;
    // no tier is metered now, so there is no exhaustion response to reach and
    // the harness's job is to drive the granted path offline instead.
    const { calls } = mockFetch([]);
    const env = scenarioEnv();
    const ctx = makeCtx();
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        host: 'localhost',
        body: { text: 'manual local voice test', voice: 'marin' },
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    await response.arrayBuffer();
    await settle(ctx);
    // Nothing metered, and nothing sent: no RevenueCat lookup and no OpenAI call.
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
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
      makeEnv({ LOCAL_AI_VOICE_TEST_SCENARIO: LOCAL_AI_VOICE_SCENARIO }),
      makeCtx(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'subscription_required' });
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(1);
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });
});
