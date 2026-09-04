import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/index';
import { privacyHash } from '../src/identity';
import { BASIC_LIFETIME_VOICE_CREDITS, isLifetimeCreditFeature } from '../src/lifetimeCredits';
import { VOICE_LIFETIME_CREDITS } from '../src/planLimits';
import {
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  wavBody,
} from './helpers';

/**
 * Basic's one-time AI Voice grant.
 *
 * The rule being pinned is that a credit is spent by exactly one thing — a new
 * generation that succeeded — and by nothing else. Everything that fails, is
 * refused, is cached, or is a preview must leave the balance where it was,
 * because a balance that never refills cannot afford to be wrong.
 */

const BASIC = { basic: FUTURE_DATE };
const PREMIUM = { premium: FUTURE_DATE };
const APP_USER_ID = '$RCAnonymousID:abc123def456';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function ledgerName(env: ReturnType<typeof makeEnv>): Promise<string> {
  return privacyHash(env, 'rcuser', APP_USER_ID);
}

function speak(path = '/v1/voice/card', body: unknown = { text: 'hello', voice: 'marin' }) {
  return makeRequest(path, { body });
}

describe('the grant', () => {
  it('is a lifetime figure, not a monthly one', () => {
    expect(BASIC_LIFETIME_VOICE_CREDITS).toBe(200);
    expect(VOICE_LIFETIME_CREDITS.basic).toBe(200);
    // Premium is unmetered and Free has no access; neither has a balance.
    expect(VOICE_LIFETIME_CREDITS.premium).toBeNull();
    expect(VOICE_LIFETIME_CREDITS.free).toBe(0);
  });

  it('covers word-card generation only', () => {
    expect(isLifetimeCreditFeature('voice_card')).toBe(true);
    for (const feature of ['voice_sample', 'voice_promo', 'voice_custom', 'meaning']) {
      expect(isLifetimeCreditFeature(feature)).toBe(false);
    }
  });

  it('is issued on first sight of a subscriber who predates the benefit', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const response = await handleRequest(speak(), env, makeCtx());

    expect(response.status).toBe(200);
    // Granted, then immediately charged for the generation that triggered it.
    expect(env.VOICE_CREDITS.remaining(await ledgerName(env))).toBe(199);
  });
});

describe('what spends a credit', () => {
  it('charges exactly one for a successful generation', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const name = await ledgerName(env);
    env.VOICE_CREDITS.seed(name, 5);

    await handleRequest(speak(), env, makeCtx());
    expect(env.VOICE_CREDITS.remaining(name)).toBe(4);
  });

  it('charges nothing when the generation fails upstream', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => new Response('nope', { status: 500 }) },
    ]);
    const env = makeEnv();
    const name = await ledgerName(env);
    env.VOICE_CREDITS.seed(name, 5);

    const response = await handleRequest(speak(), env, makeCtx());
    expect(response.status).toBeGreaterThanOrEqual(500);
    // The opposite of the monthly counter's rule, and affordable because the
    // ledger is atomic: nothing had to be reserved pessimistically.
    expect(env.VOICE_CREDITS.remaining(name)).toBe(5);
  });

  it('charges nothing for a preview or a promo clip', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const name = await ledgerName(env);
    env.VOICE_CREDITS.seed(name, 5);

    await handleRequest(speak('/v1/voice/sample', { voice: 'marin' }), env, makeCtx());
    await handleRequest(speak('/v1/voice/promo', { sample: 'spontaneous' }), env, makeCtx());
    expect(env.VOICE_CREDITS.remaining(name)).toBe(5);
  });

  it('never touches the ledger for Premium', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(PREMIUM) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const response = await handleRequest(speak(), env, makeCtx());

    expect(response.status).toBe(200);
    expect([...env.VOICE_CREDITS.states.values()]).toEqual([]);
  });
});

describe('an exhausted balance', () => {
  it('is refused before OpenAI, with the code the app shows its dialog for', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    env.VOICE_CREDITS.seed(await ledgerName(env), 0);

    const response = await handleRequest(speak(), env, makeCtx());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'voice_credits_exhausted',
      grant: 200,
      remaining: 0,
    });
    // Refused costs nothing upstream.
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });

  it('does not stop the voice-picker preview, which spends no credit', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    env.VOICE_CREDITS.seed(await ledgerName(env), 0);

    const response = await handleRequest(
      speak('/v1/voice/sample', { voice: 'marin' }),
      env,
      makeCtx(),
    );
    expect(response.status).toBe(200);
  });
});

describe('an unreadable ledger', () => {
  it('fails closed rather than granting unmetered generation', async () => {
    const { calls } = mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(BASIC) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    // A namespace whose stub throws, standing in for a Durable Object outage.
    env.VOICE_CREDITS = {
      idFromName: (name: string) => name,
      get: () => ({ fetch: () => { throw new Error('ledger down'); } }),
    } as unknown as typeof env.VOICE_CREDITS;

    const response = await handleRequest(speak(), env, makeCtx());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: 'entitlement_verification_failed',
    });
    expect(calls.some(call => call.url.includes('openai.com'))).toBe(false);
  });
});
