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

test('Premium has a monthly generation budget; Basic has a one-time card grant', () => {
  // Zero here no longer means "no feature" — it means no *monthly* allowance.
  assert.deepEqual(VOICE_MONTHLY_LIMITS, { free: 0, basic: 0, premium: 400 });
  // 0 = the plan does not have the feature. null = it has it, uncapped.
  assert.deepEqual(VOICE_LIFETIME_CREDITS, { free: 0, basic: 10, premium: null });
});

test('the table keeps Premium as included and labels the Basic grant as one-time', () => {
  // The wording comes from the dictionaries, so the helper is given a stub
  // translator here: what it owns is which key is chosen and how the number is
  // substituted, not the sentence itself.
  const t = (key: string) => (key === 'cmp_voice_one_time' ? '{n} one-time' : '{n} / month');
  assert.equal(formatVoiceMonthlyLimit('premium', 'en-US', t as never), null);
  assert.equal(formatVoiceMonthlyLimit('premium', 'ja', t as never), null);
  // Basic renders its grant, and says it is one-time: calling it monthly in
  // the comparison table would mislead at the moment of purchase.
  assert.equal(formatVoiceMonthlyLimit('basic', 'en-US', t as never), '10 one-time');
  assert.equal(formatVoiceMonthlyLimit('basic', 'ja', t as never), '10 one-time');
  assert.equal(formatVoiceMonthlyLimit('basic', 'en-US', t as never, 5), '5 one-time');
  assert.equal(formatVoiceMonthlyLimit('free', 'en-US', t as never), null);
  assert.equal(formatVoiceMonthlyLimit('free', 'ja', t as never), null);
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

test('Premium monthly-limit message defers generation without an upgrade', () => {
  const message = buildQuotaMessage(
    { limit: 100, used: 100, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'premium' },
    'en-US',
  );
  assert.equal(message.bodyKey, 'premium_voice_deferred_month');
  assert.equal(message.offerUpgrade, false, 'Premium is already the top plan');
});

test('Premium 30-minute audio limit uses the duration popup', () => {
  const message = buildQuotaMessage(
    { limit: 1_800_000, used: 1_799_900, resetsAt: '2026-10-01T00:00:00.000Z', tier: 'premium', reason: 'duration' },
    'ja',
  );
  assert.equal(message.bodyKey, 'premium_voice_deferred_duration');
  assert.equal(message.offerUpgrade, false);
});

test('Basic 90-second audio limit uses its own popup and offers Premium', () => {
  const message = buildQuotaMessage(
    { limit: 90_000, used: 89_990, resetsAt: '2026-10-01T00:00:00.000Z', tier: 'basic', reason: 'duration' },
    'ja',
  );
  assert.equal(message.bodyKey, 'basic_voice_deferred_duration');
  assert.equal(message.offerUpgrade, true);
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
