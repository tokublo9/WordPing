import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAiVoiceLimitMessage,
  fillTemplate,
  formatResetClockTime,
  formatResetMonthDay,
  formatWaitDuration,
  resolveAiVoiceLimit,
} from '../../src/lib/api/voiceLimitMessage';
import {
  showTopBanner,
  resetTopBannerState,
  subscribeToTopBanner,
  TOP_BANNER_DEDUPE_MS,
} from '../../src/lib/topBanner';

/**
 * The banner tells a user when they may play audio again. Every number in it is
 * derived, so the boundaries are pinned here rather than checked by eye.
 */

const NOW = Date.parse('2026-08-22T03:00:00.000Z');

// --- classification -------------------------------------------------------

test('a daily rejection is told apart from a short burst by the rate-limit window', () => {
  const daily = resolveAiVoiceLimit(
    { kind: 'rate_limited', limitWindow: 'day', retryAfterSeconds: 21_600 },
    NOW,
  );
  assert.deepEqual(daily, { reason: 'daily', resetsAtMs: NOW + 21_600_000 });

  const short = resolveAiVoiceLimit(
    { kind: 'rate_limited', limitWindow: 'minute', retryAfterSeconds: 45 },
    NOW,
  );
  assert.deepEqual(short, { reason: 'shortTerm', waitSeconds: 45 });
});

test('the daily character bucket classifies the same as the daily request bucket', () => {
  // usage_limit_exceeded is the chars bucket; both are daily allowances.
  const limit = resolveAiVoiceLimit(
    { kind: 'usage_limited', limitWindow: 'day', retryAfterSeconds: 3_600 },
    NOW,
  );
  assert.equal(limit?.reason, 'daily');
});

test('a monthly rejection carries the Worker reset date, not a renewal date', () => {
  const limit = resolveAiVoiceLimit(
    {
      kind: 'monthly_limit_reached',
      quota: { limit: 500, used: 500, resetsAt: '2026-09-01T00:00:00.000Z', tier: 'basic' },
    },
    NOW,
  );
  assert.deepEqual(limit, { reason: 'monthly', resetsAt: '2026-09-01T00:00:00.000Z' });
});

test('failures that are not usage limits produce no banner', () => {
  for (const kind of ['offline', 'timeout', 'subscription_required', 'generation_failed'] as const) {
    assert.equal(resolveAiVoiceLimit({ kind }, NOW), null);
  }
});

test('a limit with no timing to quote falls through rather than inventing one', () => {
  // Without Retry-After there is no reset moment, and without quota no date.
  assert.equal(resolveAiVoiceLimit({ kind: 'rate_limited', limitWindow: 'day' }, NOW), null);
  assert.equal(resolveAiVoiceLimit({ kind: 'rate_limited' }, NOW), null);
  assert.equal(resolveAiVoiceLimit({ kind: 'monthly_limit_reached' }, NOW), null);
});

// --- wait formatting ------------------------------------------------------

test('waits under an hour render as minutes, rounded up', () => {
  assert.deepEqual(formatWaitDuration(1), { unit: 'minutes', value: 1 });
  assert.deepEqual(formatWaitDuration(60), { unit: 'minutes', value: 1 });
  assert.deepEqual(formatWaitDuration(61), { unit: 'minutes', value: 2 });
  assert.deepEqual(formatWaitDuration(3_540), { unit: 'minutes', value: 59 });
});

test('exactly sixty minutes becomes one hour, not sixty minutes', () => {
  assert.deepEqual(formatWaitDuration(3_600), { unit: 'hours', value: 1 });
});

test('past an hour the wait rounds up so it never sends the user back too early', () => {
  assert.deepEqual(formatWaitDuration(3_660), { unit: 'hours', value: 2 });
  assert.deepEqual(formatWaitDuration(7_200), { unit: 'hours', value: 2 });
  assert.deepEqual(formatWaitDuration(21_600), { unit: 'hours', value: 6 });
});

test('a nonsensical wait still yields a usable figure', () => {
  for (const seconds of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    const wait = formatWaitDuration(seconds);
    assert.ok(wait.value >= 1, `${seconds} should not produce ${wait.value}`);
  }
});

// --- date and clock formatting -------------------------------------------

test('the monthly reset renders as month and day in Japanese', () => {
  assert.equal(formatResetMonthDay('2026-09-01T00:00:00.000Z', 'ja'), '9月1日');
  assert.equal(formatResetMonthDay('2026-12-01T00:00:00.000Z', 'ja'), '12月1日');
});

test('an unparseable or unsupported reset date never breaks the message', () => {
  assert.equal(formatResetMonthDay('not-a-date', 'ja'), 'not-a-date');
  assert.doesNotThrow(() => formatResetMonthDay('2026-09-01T00:00:00.000Z', 'zz-ZZ'));
});

test('the daily reset renders as a local clock time', () => {
  // 15:00 UTC is 00:00 the next day in JST — the boundary the message quotes.
  const rendered = formatResetClockTime(Date.parse('2026-08-22T15:00:00.000Z'), 'ja-JP');
  assert.match(rendered, /\d/u, 'a clock time should contain digits');
});

// --- message assembly -----------------------------------------------------

test('each reason selects its own template and substitutions', () => {
  const daily = buildAiVoiceLimitMessage({ reason: 'daily', resetsAtMs: NOW }, 'ja');
  assert.equal(daily.key, 'voice_limit_daily');
  assert.ok('time' in daily.values);

  const monthly = buildAiVoiceLimitMessage(
    { reason: 'monthly', resetsAt: '2026-09-01T00:00:00.000Z' },
    'ja',
  );
  assert.equal(monthly.key, 'voice_limit_monthly');
  assert.equal(monthly.values.date, '9月1日');

  const minutes = buildAiVoiceLimitMessage({ reason: 'shortTerm', waitSeconds: 300 }, 'ja');
  assert.equal(minutes.key, 'voice_limit_short_minutes');
  assert.equal(minutes.values.n, '5');

  const hours = buildAiVoiceLimitMessage({ reason: 'shortTerm', waitSeconds: 3_600 }, 'ja');
  assert.equal(hours.key, 'voice_limit_short_hours');
  assert.equal(hours.values.n, '1');
});

test('the Japanese templates fill without leaving a placeholder behind', () => {
  const filled = fillTemplate(
    '短時間に多くのリクエストがありました。{n}分後に新しい単語をAI Voiceで再生できます。',
    { n: '5' },
  );
  assert.equal(
    filled,
    '短時間に多くのリクエストがありました。5分後に新しい単語をAI Voiceで再生できます。',
  );
  assert.doesNotMatch(filled, /\{/u);
});

test('an unknown placeholder is left intact rather than blanked', () => {
  assert.equal(fillTemplate('a {missing} b', {}), 'a {missing} b');
});

// --- banner queueing ------------------------------------------------------

test('repeated taps while limited do not restart the banner', () => {
  resetTopBannerState();
  const seen: string[] = [];
  const unsubscribe = subscribeToTopBanner(request => seen.push(request.message));

  const base = 1_000_000;
  assert.equal(showTopBanner({ id: 'voice-limit:daily', message: 'first' }, base), true);
  assert.equal(showTopBanner({ id: 'voice-limit:daily', message: 'again' }, base + 500), false);
  // A different notice is never suppressed by an unrelated one.
  assert.equal(showTopBanner({ id: 'voice-limit:monthly', message: 'other' }, base + 600), true);
  // The same notice is allowed again once the window has passed.
  assert.equal(
    showTopBanner({ id: 'voice-limit:daily', message: 'later' }, base + TOP_BANNER_DEDUPE_MS + 1),
    true,
  );

  unsubscribe();
  assert.deepEqual(seen, ['first', 'other', 'later']);
});

test('a banner requested with no listener mounted does not throw', () => {
  resetTopBannerState();
  assert.doesNotThrow(() => showTopBanner({ id: 'voice-limit:daily', message: 'x' }, 1));
});
