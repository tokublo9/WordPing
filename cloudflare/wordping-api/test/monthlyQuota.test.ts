import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIMITS } from '../src/config';
import { privacyHash } from '../src/identity';
import { handleRequest } from '../src/index';
import { audioDurationMs } from '../src/audioDuration';
import { applyAudioDuration, applyVoiceQuota, reserveMonthlyQuota } from '../src/monthlyQuota';
import { BASIC_MONTHLY_AUDIO_MS, PREMIUM_MONTHLY_AUDIO_MS, VOICE_MONTHLY_LIMITS, VOICE_QUOTA_FEATURES } from '../src/planLimits';
import { FUTURE_DATE, makeCtx, makeEnv, makeRequest, mockFetch, revenueCatSubscriber, wavBody } from './helpers';

const SUBSCRIBER = '$RCAnonymousID:abc123def456';

afterEach(() => vi.useRealTimers());

function premiumUpstreams() {
  return mockFetch([
    { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
    { match: '/audio/speech', respond: () => wavBody() },
  ]);
}

async function card(env: ReturnType<typeof makeEnv>, appUserId = SUBSCRIBER) {
  return handleRequest(makeRequest('/v1/voice/card', {
    appUserId, body: { text: 'hello', voice: 'marin' },
  }), env, makeCtx());
}

describe('Premium AI Voice budget', () => {
  it('defines 200 per UTC day and 400 per UTC month', () => {
    expect(DEFAULT_LIMITS.voice_card.premium.maxRequestsPerDay).toBe(200);
    expect(VOICE_MONTHLY_LIMITS.premium).toBe(400);
    expect(VOICE_QUOTA_FEATURES).toEqual(['voice_card']);
    expect(PREMIUM_MONTHLY_AUDIO_MS).toBe(30 * 60_000);
    expect(BASIC_MONTHLY_AUDIO_MS).toBe(90_000);
  });

  it('measures generated WAV and MP3 audio rather than card text or cached playback', async () => {
    const wav = await wavBody(1_000).arrayBuffer();
    expect(audioDurationMs(wav, 'wav')).toBe(1_000);
    new DataView(wav).setUint32(40, 0xffffffff, true);
    expect(audioDurationMs(wav, 'wav')).toBe(1_000);
    const mp3 = new Uint8Array(417 * 10);
    for (let at = 0; at < mp3.length; at += 417) mp3.set([0xff, 0xfb, 0x90, 0x00], at);
    expect(audioDurationMs(mp3.buffer, 'mp3')).toBeGreaterThan(250);
    expect(audioDurationMs(new Uint8Array(64).buffer, 'wav')).toBeNull();
  });

  it('stops at 30 minutes of generated audio and resets at the next UTC month', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    const state = { ...applyVoiceQuota(undefined, now, 0, false).next,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS - 1_000 };
    const last = applyAudioDuration(state, now, 1_000);
    expect(last.decision.allowed).toBe(true);
    expect(last.next.monthAudioMs).toBe(PREMIUM_MONTHLY_AUDIO_MS);
    expect(applyVoiceQuota(last.next, now, 5, true).decision).toMatchObject({
      allowed: false, window: 'month', reason: 'duration', limit: PREMIUM_MONTHLY_AUDIO_MS,
    });
    const nextMonth = Date.parse('2026-10-01T00:00:00.000Z');
    expect(applyVoiceQuota(last.next, nextMonth, 5, true).decision.allowed).toBe(true);
    expect(applyVoiceQuota(last.next, nextMonth, 5, true).next.monthAudioMs).toBe(0);
  });

  it('marks the month exhausted when the next clip cannot fit, avoiding repeated paid attempts', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    const state = { ...applyVoiceQuota(undefined, now, 0, false).next,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS - 500 };
    const rejected = applyAudioDuration(state, now, 1_000);
    expect(rejected.decision).toMatchObject({ allowed: false, reason: 'duration', used: PREMIUM_MONTHLY_AUDIO_MS - 500 });
    expect(rejected.next.monthAudioExhausted).toBe(true);
    expect(applyVoiceQuota(rejected.next, now, 5, true).decision.reason).toBe('duration');
  });

  it('gives Basic 90 seconds per UTC month without burning its one-time card slots', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    const state = { ...applyVoiceQuota(undefined, now, 0, false).next,
      monthBasicAudioMs: BASIC_MONTHLY_AUDIO_MS - 500 };
    const rejected = applyAudioDuration(state, now, 1_000, 'basic');
    expect(rejected.decision).toMatchObject({ allowed: false, reason: 'duration', limit: 90_000 });
    expect(rejected.next.monthBasicAudioExhausted).toBe(true);
    expect(applyAudioDuration(rejected.next, now, 0, 'basic').decision.allowed).toBe(false);
    // A mid-month upgrade does not inherit the smaller Basic stop flag.
    expect(applyVoiceQuota(rejected.next, now, 5, true).decision.allowed).toBe(true);
    expect(applyVoiceQuota(rejected.next, now, 5, true).next.monthAudioMs).toBe(0);
    expect(applyAudioDuration({ ...state, monthBasicAudioMs: 0,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS }, now, 1_000, 'basic').decision.allowed).toBe(true);
    const nextMonth = Date.parse('2026-10-01T00:00:00.000Z');
    expect(applyAudioDuration(rejected.next, nextMonth, 1_000, 'basic').decision.allowed).toBe(true);
  });

  it('accepts the 200th generation and defers the 201st until the next UTC day', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    const base = applyVoiceQuota(undefined, now, 5, true).next;
    const before = { ...base, minuteUsed: 0, dayUsed: 199, monthUsed: 199 };
    const last = applyVoiceQuota(before, now, 5, true);
    expect(last.decision.allowed).toBe(true);
    expect(last.next.dayUsed).toBe(200);
    const blocked = applyVoiceQuota(last.next, now, 5, true);
    expect(blocked.decision).toMatchObject({ allowed: false, window: 'day', limit: 200, used: 200,
      resetsAt: '2026-09-19T00:00:00.000Z' });
    const tomorrow = applyVoiceQuota(blocked.next, Date.parse('2026-09-19T00:00:00.000Z'), 5, true);
    expect(tomorrow.decision.allowed).toBe(true);
    expect(tomorrow.next.dayUsed).toBe(1);
    expect(tomorrow.next.monthUsed).toBe(201);
  });

  it('accepts the 400th generation and defers the 401st until the next UTC month', () => {
    const now = Date.parse('2026-09-18T12:00:00.000Z');
    const base = applyVoiceQuota(undefined, now, 5, true).next;
    const before = { ...base, minuteUsed: 0, dayUsed: 10, monthUsed: 399 };
    const last = applyVoiceQuota(before, now, 5, true);
    expect(last.decision.allowed).toBe(true);
    const blocked = applyVoiceQuota(last.next, now, 5, true);
    expect(blocked.decision).toMatchObject({ allowed: false, window: 'month', limit: 400, used: 400,
      resetsAt: '2026-10-01T00:00:00.000Z' });
    expect(applyVoiceQuota(blocked.next, Date.parse('2026-10-01T00:00:00.000Z'), 5, true).decision.allowed).toBe(true);
  });

  it('serializes reservations per subscriber and keeps separate accounts separate', async () => {
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    const other = await privacyHash(env, 'rcuser', 'another-subscriber');
    const now = Date.now();
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, now, 0, false).next,
      dayUsed: 199, monthUsed: 399,
    });
    const results = await Promise.all([
      reserveMonthlyQuota(env, { tier: 'premium', hashedAppUserId: identity, characters: 5 }),
      reserveMonthlyQuota(env, { tier: 'premium', hashedAppUserId: identity, characters: 5 }),
    ]);
    expect(results.filter(result => result?.allowed)).toHaveLength(1);
    expect(results.find(result => !result?.allowed)?.window).toBe('month');
    expect((await reserveMonthlyQuota(env, { tier: 'premium', hashedAppUserId: other }))?.allowed).toBe(true);
    expect(env.WORDPING_KV.keysStartingWith('quota:')).toHaveLength(0);
  });

  it('rejects an exhausted Premium request before OpenAI and reports the reset', async () => {
    const { calls } = premiumUpstreams();
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      dayUsed: 0, monthUsed: 400,
    });
    const response = await card(env);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'monthly_api_limit_reached', tier: 'premium', limit: 400, used: 400,
    });
    expect(calls.some(call => call.url.includes('/audio/speech'))).toBe(false);
  });

  it('returns a monthly duration error after generating a clip that would exceed 30 minutes', async () => {
    const { calls } = premiumUpstreams();
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS - 1,
    });
    const response = await card(env);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'monthly_api_limit_reached', reason: 'duration',
      limit: PREMIUM_MONTHLY_AUDIO_MS,
    });
    expect(calls.some(call => call.url.includes('/audio/speech'))).toBe(true);
    const retry = await card(env);
    expect(retry.status).toBe(429);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('accepts legacy MP3 card requests and meters their encoded audio duration', async () => {
    const mp3 = new Uint8Array(417 * 10);
    for (let at = 0; at < mp3.length; at += 417) mp3.set([0xff, 0xfb, 0x90, 0x00], at);
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => new Response(mp3, {
        headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(mp3.length) },
      }) },
    ]);
    const env = makeEnv();
    const response = await handleRequest(makeRequest('/v1/voice/card', {
      appUserId: SUBSCRIBER, body: { text: 'hello', voice: 'marin', format: 'mp3' },
    }), env, makeCtx());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('audio/mpeg');
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    expect(env.VOICE_CREDITS.quotaStates.get(identity)?.monthAudioMs).toBeGreaterThan(250);
  });

  it('shares the 30-minute budget with standalone Premium text-to-speech', async () => {
    const { calls } = premiumUpstreams();
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS - 1,
    });
    const custom = await handleRequest(makeRequest('/v1/voice/custom', {
      appUserId: SUBSCRIBER, body: { text: 'hello', voice: 'marin' },
    }), env, makeCtx());
    expect(custom.status).toBe(429);
    await expect(custom.json()).resolves.toMatchObject({ error: 'monthly_api_limit_reached', reason: 'duration' });
    const cardResponse = await card(env);
    expect(cardResponse.status).toBe(429);
    expect(calls.filter(call => call.url.includes('/audio/speech'))).toHaveLength(1);
  });

  it('does not deliver two concurrent clips across the final second of the monthly budget', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody(1_000) },
    ]);
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      monthAudioMs: PREMIUM_MONTHLY_AUDIO_MS - 1_000,
    });
    const responses = await Promise.all([0, 1].map(() => handleRequest(makeRequest('/v1/voice/custom', {
      appUserId: SUBSCRIBER, body: { text: 'hello', voice: 'marin' },
    }), env, makeCtx())));
    expect(responses.map(response => response.status).sort()).toEqual([200, 429]);
    expect(env.VOICE_CREDITS.quotaStates.get(identity)?.monthAudioMs).toBe(PREMIUM_MONTHLY_AUDIO_MS);
  });

  it('returns a daily Retry-After for the 201st generation', async () => {
    const { calls } = premiumUpstreams();
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      dayUsed: 200, monthUsed: 200,
    });
    const response = await card(env);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    await expect(response.json()).resolves.toMatchObject({
      error: 'rate_limit_exceeded', scope: 'account', window: 'day', limit: 200,
    });
    expect(calls.some(call => call.url.includes('/audio/speech'))).toBe(false);
  });

  it('meters Basic audio duration without applying the Premium generation count', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    expect((await card(env)).status).toBe(200);
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    expect(env.VOICE_CREDITS.quotaStates.get(identity)).toMatchObject({
      monthBasicAudioMs: 10, dayUsed: 0, monthUsed: 0,
    });
  });

  it('defers Basic card audio at 90 seconds and releases its card credit', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ basic: FUTURE_DATE }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const env = makeEnv();
    const identity = await privacyHash(env, 'rcuser', SUBSCRIBER);
    env.VOICE_CREDITS.quotaStates.set(identity, {
      ...applyVoiceQuota(undefined, Date.now(), 0, false).next,
      monthBasicAudioMs: BASIC_MONTHLY_AUDIO_MS - 1,
    });
    const response = await card(env);
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: 'monthly_api_limit_reached', tier: 'basic', reason: 'duration', limit: 90_000,
    });
    expect(env.VOICE_CREDITS.states.get(identity)?.remaining).toBe(10);
  });
});
