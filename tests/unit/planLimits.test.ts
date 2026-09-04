import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  VOICE_LIFETIME_CREDITS,
  VOICE_MONTHLY_LIMITS,
  formatVoiceMonthlyLimit,
} from '../../src/lib/planLimits';
import { buildQuotaMessage, fillQuotaTemplate } from '../../src/lib/api/quotaMessage';

test('the client mirrors the Worker limits exactly', () => {
  // The Worker enforces its own copy. If these drift, the paywall would promise
  // one allowance while the server enforced another.
  const workerSource = fs.readFileSync('cloudflare/wordping-api/src/planLimits.ts', 'utf8');
  // Anchored on the declaration: the doc comments now name the other table,
  // and an unanchored match walked forward into the wrong one.
  const block = /export const VOICE_MONTHLY_LIMITS[^=]*=\s*\{([\s\S]*?)\}/u.exec(workerSource);
  assert.ok(block, 'Worker limits not found');

  const workerValues = Object.fromEntries(
    [...block[1]!.matchAll(/(free|basic|premium):\s*([\d_]+|null)/gu)]
      .map(match => [match[1], match[2] === 'null' ? null : Number(match[2]!.replace(/_/gu, ''))]),
  );
  assert.deepEqual(workerValues, VOICE_MONTHLY_LIMITS);

  // The lifetime grant is the half that actually gives Basic access, so it has
  // to match too — a drift here would promise credits the server never grants.
  const lifetime = /export const VOICE_LIFETIME_CREDITS[^=]*=\s*\{([\s\S]*?)\}/u.exec(workerSource);
  assert.ok(lifetime, 'Worker lifetime credits not found');
  const workerCredits = Object.fromEntries(
    [...lifetime[1]!.matchAll(/(free|basic|premium):\s*([\d_]+|null)/gu)]
      .map(match => [match[1], match[2] === 'null' ? null : Number(match[2]!.replace(/_/gu, ''))]),
  );
  assert.deepEqual(workerCredits, VOICE_LIFETIME_CREDITS);
});

test('no plan is metered by the month; Basic is metered by a one-time grant', () => {
  // Zero here no longer means "no feature" — it means no *monthly* allowance.
  assert.deepEqual(VOICE_MONTHLY_LIMITS, { free: 0, basic: 0, premium: null });
  // 0 = the plan does not have the feature. null = it has it, uncapped.
  assert.deepEqual(VOICE_LIFETIME_CREDITS, { free: 0, basic: 200, premium: null });
});

test('null carries both meanings, and a one-time grant is labelled as one', () => {
  // Null for Premium means "included"; null for Free and Basic means "not
  // included". `planCanUseAI` is what tells the comparison table which is which,
  // so neither ever renders as the number zero.
  assert.equal(formatVoiceMonthlyLimit('premium', 'en-US'), null);
  assert.equal(formatVoiceMonthlyLimit('premium', 'ja'), null);
  // Basic renders its grant, and says it is one-time: calling it monthly in
  // the comparison table would mislead at the moment of purchase.
  assert.equal(formatVoiceMonthlyLimit('basic', 'en-US'), '200 one-time');
  assert.equal(formatVoiceMonthlyLimit('basic', 'ja'), '200回（1回限り）');
  assert.equal(formatVoiceMonthlyLimit('free', 'en-US'), null);
  assert.equal(formatVoiceMonthlyLimit('free', 'ja'), null);
});

test('a Basic user at the voice limit gets the voice message and the upgrade', () => {
  const message = buildQuotaMessage(
    { limit: 200, used: 200, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' },
    'en-US',
  );
  assert.equal(message.titleKey, 'err_voice_limit_title');
  assert.equal(message.bodyKey, 'err_voice_limit_basic');
  assert.equal(message.offerUpgrade, true);
  assert.equal(message.values.limit, '200');
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
