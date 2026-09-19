import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { privacyHash } from '../src/identity';
import {
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  wavBody,
} from './helpers';

const APP_USER_ID = '$RCAnonymousID:stale-basic-user';

async function cacheBasicAndExhaustCards(
  env: ReturnType<typeof makeEnv>,
): Promise<void> {
  const warmed = await handleRequest(makeRequest('/v1/voice/credits', {
    appUserId: APP_USER_ID,
    body: { mode: 'cards' },
  }), env, makeCtx());
  expect(warmed.status).toBe(200);
  const ledgerId = await privacyHash(env, 'rcuser', APP_USER_ID);
  env.VOICE_CREDITS.cardStates.set(ledgerId, {
    grantedCards: Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`spent-${index}`, true as const]),
    ),
    reservations: {},
  });
}

describe('voice-card deny-path entitlement refresh', () => {
  it('generates as Premium after a fresh-install restore refresh', async () => {
    const { calls } = mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }),
      },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();

    const refreshed = await handleRequest(makeRequest('/v1/voice/credits', {
      appUserId: APP_USER_ID,
      body: { mode: 'cards' },
    }), env, makeCtx());
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({ tier: 'premium' });

    const card = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: APP_USER_ID,
      body: { text: 'restored', voice: 'marin', cardId: 'restored-card' },
    }), env, makeCtx());
    expect(card.status).toBe(200);
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(1);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('lets the first card request after a Premium upgrade bypass stale Basic', async () => {
    let tier: 'basic' | 'premium' = 'basic';
    const { calls } = mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber({ [tier]: FUTURE_DATE }),
      },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    await cacheBasicAndExhaustCards(env);

    tier = 'premium';
    const response = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: APP_USER_ID,
      body: { text: 'upgrade', voice: 'marin', cardId: 'new-card' },
    }), env, makeCtx());

    expect(response.status).toBe(200);
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(2);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('keeps returning 403 when RevenueCat still verifies Basic', async () => {
    const { calls } = mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }),
      },
    ]);
    const env = makeEnv();
    await cacheBasicAndExhaustCards(env);

    const response = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: APP_USER_ID,
      body: { text: 'still basic', voice: 'marin', cardId: 'new-card' },
    }), env, makeCtx());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'voice_credits_exhausted', grant: 10, remaining: 0,
    });
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(2);
  });

  it('guards repeated exhausted requests from repeated RevenueCat calls', async () => {
    const { calls } = mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }),
      },
    ]);
    const env = makeEnv();
    await cacheBasicAndExhaustCards(env);

    for (const cardId of ['denied-one', 'denied-two']) {
      const response = await handleRequest(makeRequest('/v1/voice/card', {
        appUserId: APP_USER_ID,
        body: { text: cardId, voice: 'marin', cardId },
      }), env, makeCtx());
      expect(response.status).toBe(403);
    }

    // One warm-up lookup and one deny-path lookup. The second denial is guarded.
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(2);
  });

  it('lets an explicit post-purchase refresh bypass an active deny guard', async () => {
    let tier: 'basic' | 'premium' = 'basic';
    const { calls } = mockFetch([
      {
        match: 'api.revenuecat.com',
        respond: () => revenueCatSubscriber({ [tier]: FUTURE_DATE }),
      },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    await cacheBasicAndExhaustCards(env);
    const ledgerId = await privacyHash(env, 'rcuser', APP_USER_ID);
    const exhaustedState = structuredClone(env.VOICE_CREDITS.cardStates.get(ledgerId));

    // The deny-path refresh verifies Basic and creates the 20-second guard.
    const denied = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: APP_USER_ID,
      body: { text: 'before purchase', voice: 'marin', cardId: 'before-purchase' },
    }), env, makeCtx());
    expect(denied.status).toBe(403);

    // A purchase ten seconds later uses this explicit endpoint. It force-refreshes
    // independently of the deny guard and replaces the stale cache with Premium.
    env.WORDPING_KV.now += 10_000;
    tier = 'premium';
    const refreshed = await handleRequest(makeRequest('/v1/voice/credits', {
      appUserId: APP_USER_ID,
      body: { mode: 'cards' },
    }), env, makeCtx());
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({ tier: 'premium' });

    const retried = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: APP_USER_ID,
      body: { text: 'after purchase', voice: 'marin', cardId: 'after-purchase' },
    }), env, makeCtx());
    expect(retried.status).toBe(200);
    expect(calls.filter(call => call.url.includes('api.revenuecat.com'))).toHaveLength(3);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
    expect(env.VOICE_CREDITS.cardStates.get(ledgerId)).toEqual(exhaustedState);
  });
});
