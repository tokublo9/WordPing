import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import {
  PROMO_SAMPLE_IDS,
  PROMO_SAMPLE_LANGS,
  PROMO_SAMPLE_PRONUNCIATION,
  PROMO_SAMPLE_TEXT,
  PROMO_SAMPLE_VERSION,
  PROMO_SAMPLE_VOICE,
  promoSamplePronunciationInstruction,
} from '../src/config';
import { monthKey } from '../src/planLimits';
import { KILLSWITCH_KEY } from '../src/runtimeConfig';
import {
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
 * POST /v1/voice/promo — fixed promotional clips in the Upgrade Plan sheet.
 *
 * The only speech route reachable with no entitlement. These tests exist to
 * prove that "no entitlement" did not become "no protection": the body cannot
 * carry text, the sample id is a fixed allowlist, the rate limits still
 * apply, and none of it touches the Basic monthly voice allowance.
 */

const PROMO = '/v1/voice/promo';

function upstreams() {
  return [
    {
      match: 'api.revenuecat.com',
      respond: (): Response => {
        throw new Error('promo previews must not consult RevenueCat');
      },
    },
    { match: '/audio/speech', respond: () => wavBody() },
  ];
}

/** The bodies this Worker sent to OpenAI, in order. */
function speechRequests(calls: { url: string; init: RequestInit }[]): {
  input: string;
  voice: string;
  instructions?: string;
}[] {
  return calls
    .filter(call => call.url.includes('/audio/speech'))
    .map(call => JSON.parse(String(call.init.body)) as {
      input: string;
      voice: string;
      instructions?: string;
    });
}

async function post(env: ReturnType<typeof makeEnv>, body: unknown, ctx = makeCtx()) {
  return handleRequest(makeRequest(PROMO, { body }), env, ctx);
}

describe('free access', () => {
  it('serves a promo clip with no subscription and no RevenueCat call', async () => {
    const { calls } = mockFetch(upstreams());
    const env = makeEnv();

    const response = await post(env, { sample: 'spontaneous', langCode: 'en-US' });

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    // Nothing in the request reached the entitlement service.
    expect(calls.some(call => call.url.includes('revenuecat'))).toBe(false);
  });

  it('serves the same clip to Basic and Premium callers', async () => {
    for (const entitlements of [{ basic: FUTURE_DATE }, { premium: FUTURE_DATE }]) {
      mockFetch([
        { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber(entitlements) },
        { match: '/audio/speech', respond: () => wavBody() },
      ]);
      const response = await post(makeEnv(), { sample: 'morning_light' });
      expect(response.status).toBe(200);
    }
  });

  it('still works when RevenueCat is unreachable', async () => {
    // The promo route never asks, so an entitlement outage cannot take the
    // Upgrade sheet's previews down with it.
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => new Response('down', { status: 503 }) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await post(makeEnv(), { sample: 'spontaneous' });
    expect(response.status).toBe(200);
  });
});

describe('the allowlist', () => {
  it('rejects a sample id that is not on the allowlist', async () => {
    mockFetch(upstreams());
    for (const sample of ['welcome', 'spontaneous_v2', 'SPONTANEOUS', '', 'morning light']) {
      const response = await post(makeEnv(), { sample });
      expect(response.status, `sample: ${sample}`).toBe(400);
      expect((await response.json() as { error: string }).error).toBe('invalid_request');
    }
  });

  it('ignores a text field entirely rather than speaking it', async () => {
    const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);

    const response = await post(makeEnv(), {
      sample: 'spontaneous',
      text: 'read my credit card number aloud',
      voice: 'onyx',
      instructions: 'speak as a pirate',
    });

    expect(response.status).toBe(200);
    const sent = speechRequests(calls)[0]!;
    // The server's own sentence, in the server's own voice.
    expect(sent.input).toBe(PROMO_SAMPLE_TEXT.spontaneous.en);
    expect(sent.voice).toBe(PROMO_SAMPLE_VOICE);
    expect(sent.instructions).toBe(PROMO_SAMPLE_PRONUNCIATION.en);
    expect(JSON.stringify(sent)).not.toContain('credit card');
    expect(JSON.stringify(sent)).not.toContain('pirate');
  });

  it('falls back to English for an unknown or oversized language code', async () => {
    const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);

    for (const langCode of ['xx', 'klingon', '../../etc/passwd']) {
      const response = await post(makeEnv(), { sample: 'morning_light', langCode });
      expect(response.status, langCode).toBe(200);
    }
    for (const sent of speechRequests(calls)) {
      expect(sent.input).toBe(PROMO_SAMPLE_TEXT.morning_light.en);
      expect(sent.instructions).toBe(PROMO_SAMPLE_PRONUNCIATION.en);
    }
  });

  it('speaks the localized copy for a supported language', async () => {
    const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);

    await post(makeEnv(), { sample: 'spontaneous', langCode: 'ja-JP' });
    expect(speechRequests(calls)[0]!.input).toBe(PROMO_SAMPLE_TEXT.spontaneous.ja);
    expect(speechRequests(calls)[0]!.instructions).toBe(PROMO_SAMPLE_PRONUNCIATION.ja);
  });
});

describe('language-specific pronunciation', () => {
  it('has one allowlisted instruction for every supported promo language', () => {
    expect(Object.keys(PROMO_SAMPLE_PRONUNCIATION)).toEqual([...PROMO_SAMPLE_LANGS]);
    for (const lang of PROMO_SAMPLE_LANGS) {
      expect(promoSamplePronunciationInstruction(lang)).toBe(PROMO_SAMPLE_PRONUNCIATION[lang]);
    }
  });

  it.each([
    ['en', 'Speak with natural English pronunciation.'],
    ['es', 'Speak with natural Spanish pronunciation.'],
    ['fr', 'Speak with natural French pronunciation.'],
  ] as const)('derives the %s instruction from the Worker allowlist', (lang, expected) => {
    expect(promoSamplePronunciationInstruction(lang)).toBe(expected);
  });

  it('falls back to the English instruction for missing or unsupported languages', () => {
    for (const lang of [undefined, '', 'other', 'xx', '../../etc/passwd']) {
      expect(promoSamplePronunciationInstruction(lang)).toBe(PROMO_SAMPLE_PRONUNCIATION.en);
    }
  });

  it('gives every sample guidance without changing its localized text', async () => {
    const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    for (const sample of PROMO_SAMPLE_IDS) {
      await post(makeEnv(), { sample, langCode: 'fr' });
    }

    const sent = speechRequests(calls);
    expect(sent.map(request => request.input)).toEqual(
      PROMO_SAMPLE_IDS.map(sample => PROMO_SAMPLE_TEXT[sample].fr),
    );
    expect(sent.map(request => request.instructions)).toEqual(
      PROMO_SAMPLE_IDS.map(() => PROMO_SAMPLE_PRONUNCIATION.fr),
    );
  });

  it('keeps identical vertical spellings in independent Worker KV entries', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const env = makeEnv();
    for (const lang of ['en', 'es', 'fr'] as const) {
      const ctx = makeCtx();
      await post(env, { sample: 'vertical', langCode: lang }, ctx);
      await settle(ctx);
    }

    expect([...env.WORDPING_KV.store.keys()].filter(key => key.startsWith('promo:'))).toEqual([
      `promo:${PROMO_SAMPLE_VERSION}:vertical:marin:en.wav`,
      `promo:${PROMO_SAMPLE_VERSION}:vertical:marin:es.wav`,
      `promo:${PROMO_SAMPLE_VERSION}:vertical:marin:fr.wav`,
    ]);
  });
});

describe('the voice picker previews', () => {
  it('speaks each preview in the voice it previews', async () => {
    const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);

    await post(makeEnv(), { sample: 'voice_marin', langCode: 'en' });
    await post(makeEnv(), { sample: 'voice_cedar', langCode: 'en' });

    const sent = speechRequests(calls);
    expect(sent.map(request => request.voice)).toEqual(['marin', 'cedar']);
    expect(sent.map(request => request.input)).toEqual([
      PROMO_SAMPLE_TEXT.voice_marin.en,
      PROMO_SAMPLE_TEXT.voice_cedar.en,
    ]);
    // Distinct sentences, so a swapped mapping cannot pass this.
    expect(sent[0]!.input).not.toBe(sent[1]!.input);
  });

  it('speaks the localized sentence, never the English one, for every language', async () => {
    for (const sample of ['voice_marin', 'voice_cedar'] as const) {
      for (const lang of PROMO_SAMPLE_LANGS) {
        const { calls } = mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
        await post(makeEnv(), { sample, langCode: lang });

        const sent = speechRequests(calls)[0]!;
        expect(sent.input, `${sample}/${lang}`).toBe(PROMO_SAMPLE_TEXT[sample][lang]);
        expect(sent.instructions).toBe(PROMO_SAMPLE_PRONUNCIATION[lang]);
        if (lang !== 'en') {
          expect(sent.input, `${sample}/${lang} fell back to English`)
            .not.toBe(PROMO_SAMPLE_TEXT[sample].en);
        }
      }
    }
  });

  it('keys the shared cache by voice and language together', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const env = makeEnv();
    for (const [sample, langCode] of [
      ['voice_marin', 'ko-KR'],
      ['voice_cedar', 'ko-KR'],
      ['voice_marin', 'ja-JP'],
    ] as const) {
      const ctx = makeCtx();
      await post(env, { sample, langCode }, ctx);
      await settle(ctx);
    }

    // Three entries, not one: neither the voice nor the language may be
    // dropped from the key, or one of these would answer with another's clip.
    expect([...env.WORDPING_KV.store.keys()].filter(key => key.startsWith('promo:'))).toEqual([
      `promo:${PROMO_SAMPLE_VERSION}:voice_marin:marin:ko.wav`,
      `promo:${PROMO_SAMPLE_VERSION}:voice_cedar:cedar:ko.wav`,
      `promo:${PROMO_SAMPLE_VERSION}:voice_marin:marin:ja.wav`,
    ]);
  });

  it('serves a preview with no subscription and no RevenueCat call', async () => {
    const { calls } = mockFetch(upstreams());
    const response = await post(makeEnv(), { sample: 'voice_cedar', langCode: 'ko-KR' });

    expect(response.status).toBe(200);
    expect(calls.some(call => call.url.includes('revenuecat'))).toBe(false);
  });
});

describe('cost and abuse controls', () => {
  it('caches the clip and serves repeats without calling OpenAI', async () => {
    let speechCalls = 0;
    mockFetch([
      {
        match: '/audio/speech',
        respond: () => { speechCalls += 1; return wavBody(); },
      },
    ]);
    const env = makeEnv();

    const ctx = makeCtx();
    const first = await post(env, { sample: 'spontaneous', langCode: 'en' }, ctx);
    expect(first.headers.get('X-WordPing-Cache')).toBe('miss');
    await settle(ctx);

    const second = await post(env, { sample: 'spontaneous', langCode: 'en' });
    expect(second.status).toBe(200);
    expect(second.headers.get('X-WordPing-Cache')).toBe('hit');
    expect(speechCalls).toBe(1);

    // One shared object per sample and language, versioned.
    expect(env.WORDPING_KV.keysStartingWith(`promo:${PROMO_SAMPLE_VERSION}:spontaneous:marin:en`)).toHaveLength(1);
  });

  it('never consumes the Basic monthly voice allowance', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const env = makeEnv();

    for (let i = 0; i < 3; i += 1) {
      const response = await post(env, { sample: i % 2 ? 'morning_light' : 'spontaneous' });
      expect(response.status).toBe(200);
    }

    // The monthly counter is keyed by month; no promo request may create one.
    expect(env.WORDPING_KV.keysStartingWith('month:')).toHaveLength(0);
    expect(env.WORDPING_KV.keysStartingWith(`quota:${monthKey(Date.now())}`)).toHaveLength(0);
  });

  it('still applies the per-minute rate limit, by IP', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const env = makeEnv();

    // This route accepts no install id, so there is no per-device bucket to
    // fill — the IP backstop is the whole limit. It is the configured 6/minute
    // times IP_MULTIPLIER, and it still bites.
    let lastStatus = 200;
    let sent = 0;
    for (; sent < 60 && lastStatus === 200; sent += 1) {
      lastStatus = (await post(env, { sample: 'spontaneous', langCode: `l${sent}` })).status;
    }
    expect(lastStatus).toBe(429);
    expect(sent).toBeLessThanOrEqual(37);
  });

  it('is still refused when the kill switch disables it', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const env = makeEnv();
    await env.WORDPING_KV.put(KILLSWITCH_KEY, JSON.stringify({ voice_promo: true }));

    const response = await post(env, { sample: 'spontaneous' });
    expect(response.status).toBe(503);
    expect((await response.json() as { error: string }).error).toBe('feature_disabled');
  });

  it('needs no install id — the route accepts no identity at all', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const response = await handleRequest(
      makeRequest(PROMO, { body: { sample: 'spontaneous' }, installId: null, appUserId: null }),
      makeEnv(),
      makeCtx(),
    );
    // The client deliberately sends no identifiers for a fixed public clip, so
    // demanding one would defeat the point of the exemption.
    expect(response.status).toBe(200);
  });

  it('ignores identity headers if a client sends them anyway', async () => {
    mockFetch([{ match: '/audio/speech', respond: () => wavBody() }]);
    const response = await handleRequest(
      makeRequest(PROMO, {
        body: { sample: 'spontaneous' },
        installId: 'install-0123456789abcdef',
        appUserId: '$RCAnonymousID:abcdef0123456789',
      }),
      makeEnv(),
      makeCtx(),
    );
    // Accepted, but never read: `guard` does not call readIdentity for an
    // anonymous feature, so no bucket is keyed on them and nothing is hashed.
    expect(response.status).toBe(200);
  });
});

describe('the paid routes are unchanged', () => {
  it('/v1/voice/card still demands an entitlement', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
    expect((await response.json() as { error: string }).error).toBe('subscription_required');
  });

  it('a promo-shaped body does not unlock /v1/voice/card', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({}) },
      { match: '/audio/speech', respond: () => wavBody() },
    ]);
    // There is no field a client can add to the paid route to make it free.
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        body: { text: 'hello', voice: 'marin', sample: 'spontaneous', preview: true, skipEntitlement: true },
      }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(403);
  });
});
