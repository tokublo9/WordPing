import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  errorFromNetworkFailure,
  errorFromWorkerResponse,
  MESSAGE_KEY_BY_KIND,
} from '../../src/lib/api/errors';
import { buildQuotaMessage } from '../../src/lib/api/quotaMessage';

test('Basic monthly exhaustion is distinct from a network error and offers Premium', () => {
  const quota = {
    limit: 200,
    used: 200,
    resetsAt: '2026-09-01T00:00:00.000Z',
    tier: 'basic' as const,
  };
  const exhausted = errorFromWorkerResponse({
    status: 429,
    code: 'monthly_api_limit_reached',
    quota,
  });
  const offline = errorFromNetworkFailure(new TypeError('Network request failed'));
  const presentation = buildQuotaMessage(quota, 'en-US');

  assert.equal(exhausted.kind, 'monthly_limit_reached');
  assert.notEqual(exhausted.kind, offline.kind);
  assert.equal(MESSAGE_KEY_BY_KIND[exhausted.kind], 'err_voice_limit_basic');
  assert.deepEqual(exhausted.quota, quota);
  assert.equal(presentation.offerUpgrade, true);
  assert.equal(presentation.values.limit, '200');
});

test('a Premium short-term throttle uses retry-later messaging without an upgrade prompt', () => {
  const throttled = errorFromWorkerResponse({
    status: 429,
    code: 'rate_limit_exceeded',
    retryAfterSeconds: 37,
  });

  assert.equal(throttled.kind, 'rate_limited');
  assert.equal(throttled.retryAfterSeconds, 37);
  assert.equal(throttled.quota, undefined);
  assert.equal(MESSAGE_KEY_BY_KIND[throttled.kind], 'err_rate_limited');

  const hook = fs.readFileSync('src/hooks/useWordCardVoicePlayback.ts', 'utf8');
  const branch = /case 'rate_limited':([\s\S]*?)case 'usage_limited':/u.exec(hook)?.[1];
  assert.ok(branch, 'rate-limited presentation branch not found');
  // Usage limits now use the non-blocking top banner. An alert was modal for a
  // condition the user can only wait out, and it blocked the card underneath.
  assert.match(branch, /showTopBanner\(\{ id: 'voice-limit:rate', message: t\('err_rate_limited'\) \}\)/u);
  assert.doesNotMatch(branch, /Alert\.alert/u);
  assert.doesNotMatch(branch, /upgradeAction|onUpgrade/u);
});

test('the existing retry-later copy is available in English and Japanese', () => {
  const i18n = fs.readFileSync('src/i18n.ts', 'utf8');
  assert.match(
    i18n,
    /err_rate_limited:\s+'Too many requests just now\. Please wait a moment and try again\.'/u,
  );
  assert.match(
    i18n,
    /err_rate_limited:\s+'リクエストが多すぎます。少し待ってからお試しください。'/u,
  );
});

test('the Basic allowance alert does not describe rate-limited Premium as unlimited', () => {
  const i18n = fs.readFileSync('src/i18n.ts', 'utf8');
  assert.match(
    i18n,
    /Premium has no such ceiling, but normal service limits apply\./u,
  );
  assert.match(
    i18n,
    /Premiumには月間上限はありませんが、通常のサービス利用制限が適用されます。/u,
  );
  assert.doesNotMatch(i18n, /Premium for unlimited access|Premiumにアップグレードすると無制限/u);
});
