import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AIRequestError,
  errorFromNetworkFailure,
  errorFromWorkerResponse,
  isAIRequestError,
  MESSAGE_KEY_BY_KIND,
  type AIErrorKind,
} from '../../src/lib/api/errors';

test('every Worker error code maps to a client classification', () => {
  const expected: Record<string, AIErrorKind> = {
    invalid_request: 'invalid_input',
    invalid_voice: 'invalid_input',
    input_too_long: 'invalid_input',
    unsupported_media_type: 'invalid_input',
    payload_too_large: 'invalid_input',
    missing_install_id: 'invalid_input',
    subscription_required: 'subscription_required',
    rate_limit_exceeded: 'rate_limited',
    usage_limit_exceeded: 'usage_limited',
    quota_exceeded: 'rate_limited',
    feature_disabled: 'service_unavailable',
    // Not 'service_unavailable': a verification failure is its own thing, and
    // conflating them is what produced a fake speech outage.
    entitlement_service_unavailable: 'entitlement_unverified',
    entitlement_verification_failed: 'entitlement_unverified',
    service_not_configured: 'not_configured',
    monthly_api_limit_reached: 'monthly_limit_reached',
    internal_error: 'service_unavailable',
    upstream_failed: 'generation_failed',
    request_timeout: 'timeout',
  };

  for (const [code, kind] of Object.entries(expected)) {
    const error = errorFromWorkerResponse({ status: 500, code });
    assert.equal(error.kind, kind, `${code} should classify as ${kind}`);
  }
});

test('an unrecognised future code still classifies from the status', () => {
  assert.equal(errorFromWorkerResponse({ status: 403, code: 'brand_new_code' }).kind, 'subscription_required');
  assert.equal(errorFromWorkerResponse({ status: 429, code: 'brand_new_code' }).kind, 'rate_limited');
  assert.equal(errorFromWorkerResponse({ status: 400, code: 'brand_new_code' }).kind, 'invalid_input');
  assert.equal(errorFromWorkerResponse({ status: 504, code: 'brand_new_code' }).kind, 'timeout');
  assert.equal(errorFromWorkerResponse({ status: 502, code: 'brand_new_code' }).kind, 'generation_failed');
  assert.equal(errorFromWorkerResponse({ status: 503 }).kind, 'service_unavailable');
});

test('legacy message codes the existing screens match on are preserved', () => {
  // These strings are compared directly in WordModal, SettingsModal,
  // TextToSpeechScreen and useWordCardVoicePlayback.
  assert.equal(errorFromWorkerResponse({ status: 403, code: 'subscription_required' }).message, 'plan_required');
  assert.equal(errorFromWorkerResponse({ status: 429, code: 'rate_limit_exceeded' }).message, 'rate_limit_exceeded');
  assert.equal(errorFromWorkerResponse({ status: 429, code: 'usage_limit_exceeded' }).message, 'usage_limit_exceeded');
  assert.equal(errorFromWorkerResponse({ status: 429, code: 'quota_exceeded' }).message, 'rate_limit_exceeded');
  assert.equal(errorFromWorkerResponse({ status: 400, code: 'input_too_long' }).message, 'input_too_long');
  assert.equal(errorFromWorkerResponse({ status: 502, code: 'upstream_failed' }).message, 'service_unavailable');
});

test('offline, timeout and cancellation are distinguished from each other', () => {
  const offline = errorFromNetworkFailure(new TypeError('Network request failed'));
  assert.equal(offline.kind, 'offline');

  const aborted = new Error('aborted');
  aborted.name = 'AbortError';
  assert.equal(errorFromNetworkFailure(aborted).kind, 'cancelled');

  const timedOut = new Error('timed out');
  timedOut.name = 'TimeoutError';
  assert.equal(errorFromNetworkFailure(timedOut).kind, 'timeout');

  assert.equal(errorFromNetworkFailure('a string').kind, 'service_unavailable');
});

test('offline maps to the service-unavailable message the UI already handles', () => {
  // The screens branch on this legacy code, so a transport failure must keep
  // mapping to 'service_unavailable' rather than a new string.
  assert.equal(errorFromNetworkFailure(new TypeError('Network request failed')).message, 'service_unavailable');
});

test('retry-after and request id survive onto the error', () => {
  const error = errorFromWorkerResponse({
    status: 429,
    code: 'rate_limit_exceeded',
    requestId: 'abc-123',
    retryAfterSeconds: 42,
  });
  assert.equal(error.requestId, 'abc-123');
  assert.equal(error.retryAfterSeconds, 42);
  assert.equal(error.serverCode, 'rate_limit_exceeded');
});

test('optional diagnostics are undefined when the response carried none', () => {
  const error = errorFromWorkerResponse({ status: 500 });
  assert.equal(error.requestId, undefined);
  assert.equal(error.retryAfterSeconds, undefined);
  assert.equal(error.serverCode, undefined);
});

test('every classification has a message key', () => {
  const kinds: AIErrorKind[] = [
    'offline', 'timeout', 'cancelled', 'subscription_required', 'rate_limited',
    'usage_limited', 'invalid_input', 'service_unavailable', 'generation_failed',
  ];
  for (const kind of kinds) {
    assert.equal(typeof MESSAGE_KEY_BY_KIND[kind], 'string');
    assert.ok(MESSAGE_KEY_BY_KIND[kind].length > 0);
  }
});

test('AIRequestError is recognisable and is a real Error', () => {
  const error = new AIRequestError('timeout');
  assert.ok(error instanceof Error);
  assert.ok(isAIRequestError(error));
  assert.equal(isAIRequestError(new Error('plain')), false);
  assert.equal(error.name, 'AIRequestError');
});

test('an error message never carries server detail or user text', () => {
  const error = errorFromWorkerResponse({
    status: 400,
    code: 'invalid_request',
    requestId: 'abc-123',
  });
  // The message is a fixed code, so nothing from the response body can end up
  // in a user-facing string by accident.
  assert.equal(error.message, 'invalid_request');
  assert.equal(error.message.includes('abc-123'), false);
});

// ── AI Voice failure classification (regression) ─────────────────────────────

test('a failed entitlement verification is not reported as a speech outage', () => {
  // Root cause of the AI Voice incident: the Worker returned 503
  // entitlement_service_unavailable because RevenueCat rejected its key, and
  // this collapsed into the generic "speech service unavailable" message.
  for (const code of ['entitlement_service_unavailable', 'entitlement_verification_failed']) {
    const error = errorFromWorkerResponse({ status: 503, code });
    assert.equal(error.kind, 'entitlement_unverified', `${code} must classify as unverified`);
    assert.notEqual(error.kind, 'service_unavailable');
    assert.equal(MESSAGE_KEY_BY_KIND[error.kind], 'err_entitlement_unverified');
  }
});

test('a misconfigured service is distinguished from a transient outage', () => {
  const error = errorFromWorkerResponse({ status: 503, code: 'service_not_configured' });
  assert.equal(error.kind, 'not_configured');
  assert.equal(MESSAGE_KEY_BY_KIND[error.kind], 'err_service_not_configured');
});

test('only genuine Worker and OpenAI failures say "temporarily unavailable"', () => {
  for (const code of ['internal_error', 'feature_disabled', 'not_found', 'method_not_allowed']) {
    assert.equal(errorFromWorkerResponse({ status: 500, code }).kind, 'service_unavailable');
  }
  assert.equal(errorFromWorkerResponse({ status: 502, code: 'upstream_failed' }).kind, 'generation_failed');
  assert.equal(MESSAGE_KEY_BY_KIND.service_unavailable, 'ai_service_unavailable_msg');
});

test('a Free user gets subscription_required, never a service failure', () => {
  const error = errorFromWorkerResponse({ status: 403, code: 'subscription_required' });
  assert.equal(error.kind, 'subscription_required');
  assert.equal(error.message, 'plan_required');
  assert.equal(MESSAGE_KEY_BY_KIND[error.kind], 'err_plan_required_speech');
});

test('the monthly voice limit is its own classification, not an outage', () => {
  const error = errorFromWorkerResponse({
    status: 429,
    code: 'monthly_api_limit_reached',
    quota: { limit: 100, used: 100, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' },
  });
  assert.equal(error.kind, 'monthly_limit_reached');
  assert.deepEqual(error.quota, { limit: 100, used: 100, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' });
});

test('rate limiting, offline and timeout each keep their own message', () => {
  assert.equal(errorFromWorkerResponse({ status: 429, code: 'rate_limit_exceeded' }).kind, 'rate_limited');
  assert.equal(MESSAGE_KEY_BY_KIND.rate_limited, 'err_rate_limited');
  assert.equal(errorFromNetworkFailure(new TypeError('Network request failed')).kind, 'offline');
  assert.equal(MESSAGE_KEY_BY_KIND.offline, 'err_offline');
  const timedOut = new Error('t'); timedOut.name = 'TimeoutError';
  assert.equal(errorFromNetworkFailure(timedOut).kind, 'timeout');
  assert.equal(MESSAGE_KEY_BY_KIND.timeout, 'err_timeout');
});

test('the Worker request id is retained for diagnostics', () => {
  const error = errorFromWorkerResponse({
    status: 503, code: 'entitlement_verification_failed', requestId: '02220567-b3e1-44ef',
  });
  assert.equal(error.requestId, '02220567-b3e1-44ef');
  assert.equal(error.serverCode, 'entitlement_verification_failed');
});

test('every classification still has a message key', () => {
  for (const kind of [
    'offline', 'timeout', 'cancelled', 'subscription_required', 'rate_limited',
    'usage_limited', 'invalid_input', 'service_unavailable', 'generation_failed',
    'monthly_limit_reached', 'entitlement_unverified', 'not_configured',
  ] as const) {
    assert.equal(typeof MESSAGE_KEY_BY_KIND[kind], 'string');
    assert.ok(MESSAGE_KEY_BY_KIND[kind].length > 0, `${kind} needs a message key`);
  }
});
