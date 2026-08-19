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
    entitlement_service_unavailable: 'service_unavailable',
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
