import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { privacyHash } from '../src/identity';
import {
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
} from './helpers';

const DEVICE_ID = '$RCAnonymousID:tester-device';

describe('tester Basic ledger reset', () => {
  it('is unavailable unless explicitly enabled', async () => {
    const env = makeEnv({ ADMIN_RESET_SECRET: 'test-admin-secret' });
    const response = await handleRequest(makeRequest('/v1/admin/voice-credits/reset', {
      headers: { Authorization: 'Bearer test-admin-secret' },
      body: { deviceId: DEVICE_ID },
    }), env, makeCtx());
    expect(response.status).toBe(404);
  });

  it('requires the admin bearer secret', async () => {
    const env = makeEnv({
      ENABLE_ADMIN_LEDGER_RESET: '1',
      ADMIN_RESET_SECRET: 'test-admin-secret',
    });
    const response = await handleRequest(makeRequest('/v1/admin/voice-credits/reset', {
      headers: { Authorization: 'Bearer wrong-secret' },
      body: { deviceId: DEVICE_ID },
    }), env, makeCtx());
    expect(response.status).toBe(401);
  });

  it('resolves the canonical RevenueCat identity and clears only Basic balances', async () => {
    const canonicalId = '$RCAnonymousID:canonical-tester';
    mockFetch([{
      match: 'api.revenuecat.com',
      respond: () => new Response(JSON.stringify({ subscriber: {
        original_app_user_id: canonicalId,
        entitlements: { basic: { expires_date: FUTURE_DATE } },
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    }]);
    const env = makeEnv({
      ENABLE_ADMIN_LEDGER_RESET: '1',
      ADMIN_RESET_SECRET: 'test-admin-secret',
    });
    const ledgerId = await privacyHash(env, 'rcuser', canonicalId);
    env.VOICE_CREDITS.cardStates.set(ledgerId, {
      grantedCards: { one: true }, reservations: {},
    });
    env.VOICE_CREDITS.seed(ledgerId, 0);
    env.VOICE_CREDITS.quotaStates.set(ledgerId, {
      minute: '2026-09-19T00:00', minuteUsed: 1,
      day: '2026-09-19', dayUsed: 1, dayCharacters: 4,
      month: '2026-09', monthUsed: 1,
    });

    const response = await handleRequest(makeRequest('/v1/admin/voice-credits/reset', {
      headers: { Authorization: 'Bearer test-admin-secret' },
      body: { deviceId: DEVICE_ID },
    }), env, makeCtx());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ ok: true }));
    expect(env.VOICE_CREDITS.cardStates.has(ledgerId)).toBe(false);
    expect(env.VOICE_CREDITS.states.has(ledgerId)).toBe(false);
    expect(env.VOICE_CREDITS.quotaStates.has(ledgerId)).toBe(true);
  });
});
