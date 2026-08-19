import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { VOICE_MONTHLY_LIMITS, formatVoiceMonthlyLimit } from '../../src/lib/planLimits';
import { buildQuotaMessage, fillQuotaTemplate } from '../../src/lib/api/quotaMessage';

test('the client mirrors the Worker limits exactly', () => {
  // The Worker enforces its own copy. If these drift, the paywall would promise
  // one allowance while the server enforced another.
  const workerSource = fs.readFileSync('cloudflare/wordping-api/src/planLimits.ts', 'utf8');
  const block = /VOICE_MONTHLY_LIMITS[^=]*=\s*\{([\s\S]*?)\}/u.exec(workerSource);
  assert.ok(block, 'Worker limits not found');

  const workerValues = Object.fromEntries(
    [...block[1]!.matchAll(/(free|basic|premium):\s*([\d_]+|null)/gu)]
      .map(match => [match[1], match[2] === 'null' ? null : Number(match[2]!.replace(/_/gu, ''))]),
  );
  assert.deepEqual(workerValues, VOICE_MONTHLY_LIMITS);
});

test('Basic is metered and Premium has no monthly product quota', () => {
  assert.deepEqual(VOICE_MONTHLY_LIMITS, { free: 0, basic: 100, premium: null });
});

test('Basic renders a count and Premium defers to the included symbol', () => {
  assert.equal(formatVoiceMonthlyLimit('basic', 'en-US'), '100 / month');
  assert.equal(formatVoiceMonthlyLimit('basic', 'ja'), '月100回');
  // null tells the table to render its shared circle rather than a number.
  assert.equal(formatVoiceMonthlyLimit('premium', 'en-US'), null);
  assert.equal(formatVoiceMonthlyLimit('premium', 'ja'), null);
  assert.equal(formatVoiceMonthlyLimit('free', 'en-US'), '0');
  assert.equal(formatVoiceMonthlyLimit('free', 'ja'), '0回');
});

test('the Basic value is short enough for an iPhone SE column', () => {
  // The feature column is ~40% of a 320pt screen; both strings are well inside
  // what fits at the table's font size on three lines.
  assert.ok(formatVoiceMonthlyLimit('basic', 'en-US')!.length <= 12);
  assert.ok(formatVoiceMonthlyLimit('basic', 'ja')!.length <= 8);
});

test('a Basic user at the voice limit gets the voice message and the upgrade', () => {
  const message = buildQuotaMessage(
    { limit: 100, used: 100, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' },
    'en-US',
  );
  assert.equal(message.titleKey, 'err_voice_limit_title');
  assert.equal(message.bodyKey, 'err_voice_limit_basic');
  assert.equal(message.offerUpgrade, true);
  assert.equal(message.values.limit, '100');
  // The reset date is available where the UI wants it.
  assert.match(message.values.date, /September|2026/u);
});

test('there is no Premium monthly-limit message left to show', () => {
  // Premium has no monthly product quota, so the Worker cannot produce this
  // error for it — and there is only one message either way.
  const message = buildQuotaMessage(
    { limit: 100, used: 100, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'premium' },
    'en-US',
  );
  assert.equal(message.bodyKey, 'err_voice_limit_basic');
  assert.equal(message.offerUpgrade, false, 'Premium is already the top plan');
});

test('the message uses the server figures, not the client constants', () => {
  // A Worker that has been updated ahead of the app must still be quoted correctly.
  const message = buildQuotaMessage(
    { limit: 250, used: 250, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' },
    'en-US',
  );
  assert.equal(message.values.limit, '250');
});

test('templates fill limit and date', () => {
  assert.equal(
    fillQuotaTemplate('Used all {limit} requests. Resets {date}.', { limit: '100', date: '1 Sept' }),
    'Used all 100 requests. Resets 1 Sept.',
  );
  // An unknown placeholder is left alone rather than blanked.
  assert.equal(fillQuotaTemplate('{other}', { limit: '1', date: 'x' }), '{other}');
});

test('a malformed reset date degrades instead of crashing', () => {
  const message = buildQuotaMessage(
    { limit: 100, used: 100, resetsAt: 'not-a-date', tier: 'basic' },
    'en-US',
  );
  assert.equal(message.values.date, 'not-a-date');
});
