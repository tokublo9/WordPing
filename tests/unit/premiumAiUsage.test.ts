import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAiUsageReset, parsePremiumAiUsage, remainingAiRequests } from '../../src/lib/premiumAiUsage';

test('Premium usage accepts verified day and month counters and clamps exhausted balances', () => {
  const usage = parsePremiumAiUsage({
    tier: 'premium',
    usage: {
      day: { used: 19, limit: 200, resetsAt: '2026-09-19T00:00:00.000Z' },
      month: { used: 401, limit: 400, resetsAt: '2026-10-01T00:00:00.000Z' },
    },
  });
  assert.ok(usage);
  assert.equal(remainingAiRequests(usage.day), 181);
  assert.equal(remainingAiRequests(usage.month), 0);
});

test('Basic balances and malformed server counters cannot be displayed as Premium usage', () => {
  const usage = { day: { used: 1, limit: 200, resetsAt: '2026-09-19T00:00:00.000Z' },
    month: { used: 1, limit: 400, resetsAt: '2026-10-01T00:00:00.000Z' } };
  assert.equal(parsePremiumAiUsage({ tier: 'basic', usage }), null);
  assert.equal(parsePremiumAiUsage({ tier: 'premium', usage: { ...usage, day: { ...usage.day, used: -1 } } }), null);
  assert.equal(parsePremiumAiUsage({ tier: 'premium', usage: { ...usage, month: { ...usage.month, resetsAt: 'invalid' } } }), null);
});

test('reset countdown follows UTC timestamps and formats Japanese naturally', () => {
  const now = Date.parse('2026-09-18T12:00:00.000Z');
  assert.equal(formatAiUsageReset('2026-09-19T00:00:00.000Z', now, 'en-US'), '12h 0m');
  assert.equal(formatAiUsageReset('2026-09-19T00:00:00.000Z', now, 'ja'), '12時間 0分');
  assert.equal(formatAiUsageReset('2026-10-01T00:00:00.000Z', now, 'en-US'), '12d 12h');
});
