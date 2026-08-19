import { describe, expect, it } from 'vitest';
import { handleRequest } from '../src/index';
import { MAX_REQUEST_BODY_BYTES, SPEECH_MODEL, TEXT_MODEL } from '../src/config';
import {
  chatCompletion,
  FUTURE_DATE,
  makeCtx,
  makeEnv,
  makeRequest,
  mockFetch,
  revenueCatSubscriber,
  wavBody,
} from './helpers';

function premiumRoutes() {
  return [
    { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
    { match: '/audio/speech', respond: () => wavBody() },
    { match: '/chat/completions', respond: () => chatCompletion('a meaning') },
  ];
}

describe('request shape', () => {
  it('rejects any method other than POST on an AI endpoint', async () => {
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { method: 'GET' }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST, OPTIONS');
    await expect(response.json()).resolves.toMatchObject({ error: 'method_not_allowed' });
  });

  it('rejects a body that is not declared as JSON', async () => {
    const response = await handleRequest(
      makeRequest('/v1/meaning', { contentType: 'text/plain', body: { text: 'hi' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({ error: 'unsupported_media_type' });
  });

  it('rejects an oversized body before reading it', async () => {
    mockFetch(premiumRoutes());
    const request = makeRequest('/v1/voice/card', { rawBody: 'x'.repeat(64) });
    request.headers.set('Content-Length', String(MAX_REQUEST_BODY_BYTES + 1));

    const response = await handleRequest(request, makeEnv(), makeCtx());
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({ error: 'payload_too_large' });
  });

  it('rejects an oversized body even when Content-Length lies', async () => {
    const { calls } = mockFetch(premiumRoutes());
    const request = makeRequest('/v1/voice/card', {
      rawBody: JSON.stringify({ text: 'x'.repeat(MAX_REQUEST_BODY_BYTES), voice: 'marin' }),
    });
    request.headers.delete('Content-Length');

    const response = await handleRequest(request, makeEnv(), makeCtx());
    expect(response.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it('rejects malformed JSON', async () => {
    const response = await handleRequest(
      makeRequest('/v1/meaning', { rawBody: '{ not json' }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_request',
      reason: 'malformed_json',
    });
  });

  it('rejects an empty text field', async () => {
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: '   ' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_request' });
  });

  it('requires both identity headers', async () => {
    for (const missing of [{ installId: null }, { appUserId: null }] as const) {
      const response = await handleRequest(
        makeRequest('/v1/meaning', { body: { text: 'hello' }, ...missing }),
        makeEnv(),
        makeCtx(),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'missing_install_id' });
    }
  });

  it('returns 404 for an unknown path without touching any upstream', async () => {
    const { calls } = mockFetch(premiumRoutes());
    const response = await handleRequest(
      makeRequest('/v1/anything', { body: { text: 'hi' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it('puts a request id on every response', async () => {
    const response = await handleRequest(makeRequest('/v1/nope'), makeEnv(), makeCtx());
    const body = (await response.json()) as { requestId: string };
    expect(response.headers.get('X-WordPing-Request-Id')).toBe(body.requestId);
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/u);
  });
});

describe('server-side allowlists', () => {
  it('rejects a voice that is not on the allowlist', async () => {
    const { calls } = mockFetch(premiumRoutes());
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'darth-vader' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'invalid_voice' });
    // Rejected before entitlement lookup, so nothing at all went out.
    expect(calls).toHaveLength(0);
  });

  it('ignores a client-supplied model and upstream URL', async () => {
    const { calls } = mockFetch(premiumRoutes());
    const response = await handleRequest(
      makeRequest('/v1/voice/card', {
        body: {
          text: 'hello',
          voice: 'marin',
          model: 'gpt-4o-audio-preview',
          base_url: 'https://attacker.example/v1',
          endpoint: 'https://attacker.example',
          max_tokens: 100000,
        },
      }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(200);

    const speechCall = calls.find(call => call.url.includes('/audio/speech'));
    expect(speechCall?.url).toBe('https://api.openai.com/v1/audio/speech');
    const sent = JSON.parse(String(speechCall?.init.body)) as Record<string, unknown>;
    expect(sent.model).toBe(SPEECH_MODEL);
    expect(sent).not.toHaveProperty('base_url');
    expect(sent).not.toHaveProperty('endpoint');
    expect(sent).not.toHaveProperty('max_tokens');
    expect(calls.every(call => !call.url.includes('attacker.example'))).toBe(true);
  });

  it('pins the text model regardless of request content', async () => {
    const { calls } = mockFetch(premiumRoutes());
    await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'serendipity', model: 'gpt-4o', langCode: 'ja' } }),
      makeEnv(),
      makeCtx(),
    );
    const chatCall = calls.find(call => call.url.includes('/chat/completions'));
    const sent = JSON.parse(String(chatCall?.init.body)) as { model: string };
    expect(sent.model).toBe(TEXT_MODEL);
  });

  it('caps input length per tier', async () => {
    const { calls } = mockFetch(premiumRoutes());
    // voice_card premium allows 500 characters.
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'a'.repeat(501), voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: 'input_too_long',
      maxCharacters: 500,
    });
    expect(calls.some(call => call.url.includes('/audio/speech'))).toBe(false);
  });

  it('counts code points, not UTF-16 units, against the limit', async () => {
    mockFetch(premiumRoutes());
    // 300 astral-plane characters = 600 UTF-16 units but 300 code points.
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: '𝔞'.repeat(300), voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(200);
  });
});

describe('response hygiene', () => {
  it('never returns a stack trace or an internal message', async () => {
    mockFetch([
      { match: 'api.revenuecat.com', respond: () => revenueCatSubscriber({ premium: FUTURE_DATE }) },
      {
        match: '/audio/speech',
        respond: () => { throw new Error('boom at /Users/secret/path/index.ts:42'); },
      },
    ]);
    const response = await handleRequest(
      makeRequest('/v1/voice/card', { body: { text: 'hello', voice: 'marin' } }),
      makeEnv(),
      makeCtx(),
    );
    expect(response.status).toBe(502);
    const raw = await response.text();
    expect(raw).not.toContain('boom');
    expect(raw).not.toContain('/Users/');
    expect(JSON.parse(raw)).toMatchObject({ error: 'upstream_failed' });
  });

  it('never echoes a secret', async () => {
    mockFetch(premiumRoutes());
    const response = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    const raw = await response.text();
    expect(raw).not.toContain('sk-test-openai-key');
    expect(raw).not.toContain('sk-test-revenuecat-key');
    expect(raw).not.toContain('test-salt');
  });

  it('sets security headers on success and on failure', async () => {
    mockFetch(premiumRoutes());
    const ok = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hello' } }),
      makeEnv(),
      makeCtx(),
    );
    const bad = await handleRequest(makeRequest('/v1/nope'), makeEnv(), makeCtx());
    for (const response of [ok, bad]) {
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    }
  });

  it('reflects CORS only for a configured origin, and never as authentication', async () => {
    mockFetch(premiumRoutes());
    const allowed = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hi' }, origin: 'http://localhost:8081' }),
      makeEnv(),
      makeCtx(),
    );
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:8081');

    const foreign = await handleRequest(
      makeRequest('/v1/meaning', { body: { text: 'hi' }, origin: 'https://evil.example' }),
      makeEnv(),
      makeCtx(),
    );
    expect(foreign.headers.get('Access-Control-Allow-Origin')).toBeNull();
    // The request still succeeds: CORS is a browser hint, not an auth boundary.
    expect(foreign.status).toBe(200);
  });
});
