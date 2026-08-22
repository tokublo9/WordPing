import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatSubscriptionDate,
  isDowngrade,
  PLAN_RANK,
  shouldShowDeferredSwitchNotice,
} from '../../src/lib/planSwitch';
import { fillTemplate } from '../../src/lib/fillTemplate';

/**
 * Only a downgrade defers to the next renewal. Showing the notice on an upgrade
 * would tell a user their Premium starts next month when it starts immediately,
 * so the direction has to be exact rather than "is subscribed".
 */

const EXPIRES = '2026-09-22T00:00:00.000Z';

test('the client ranking matches the Worker tier order', () => {
  // Mirrors TIER_RANK in cloudflare/wordping-api/src/entitlements.ts, which is
  // itself the ordering configured in App Store Connect.
  assert.deepEqual(PLAN_RANK, { free: 0, basic: 1, premium: 2 });
});

test('moving down a tier is a downgrade', () => {
  assert.equal(isDowngrade('premium', 'basic'), true);
  assert.equal(isDowngrade('premium', 'free'), true);
  assert.equal(isDowngrade('basic', 'free'), true);
});

test('upgrades and same-plan taps are not downgrades', () => {
  assert.equal(isDowngrade('free', 'basic'), false);
  assert.equal(isDowngrade('free', 'premium'), false);
  assert.equal(isDowngrade('basic', 'premium'), false);
  for (const tier of ['free', 'basic', 'premium'] as const) {
    assert.equal(isDowngrade(tier, tier), false, `${tier} -> ${tier} is not a switch`);
  }
});

test('the notice is shown only for a downgrade that has a date to name', () => {
  const date = '2026年9月22日';
  assert.equal(shouldShowDeferredSwitchNotice('premium', 'basic', date), true);
  // An upgrade must never claim a deferred start.
  assert.equal(shouldShowDeferredSwitchNotice('basic', 'premium', date), false);
  // Free users are not switching away from anything.
  assert.equal(shouldShowDeferredSwitchNotice('free', 'basic', date), false);
  // A lifetime entitlement has no expiry, so there is no sentence to complete.
  assert.equal(shouldShowDeferredSwitchNotice('premium', 'basic', null), false);
});

test('the renewal date renders in natural Japanese', () => {
  assert.equal(formatSubscriptionDate(EXPIRES, 'ja'), '2026年9月22日');
});

test('an unusable expiry yields null so the notice is dropped entirely', () => {
  // Rendering the sentence with a blank or an ISO string where the date belongs
  // is worse than not showing it.
  for (const value of [null, undefined, '', 'not-a-date']) {
    assert.equal(formatSubscriptionDate(value, 'ja'), null, `${String(value)} should be null`);
  }
});

test('an unsupported locale falls back to the plain date instead of throwing', () => {
  assert.doesNotThrow(() => formatSubscriptionDate(EXPIRES, 'zz-ZZ'));
  const rendered = formatSubscriptionDate(EXPIRES, 'zz-ZZ');
  assert.ok(rendered !== null && rendered.length > 0);
});

test('the Japanese notice fills its date placeholder completely', () => {
  const template = 'Basic planに変更する場合：新しいプランは現在のプランの有効期限（{date}）が終了した時点で開始されます。';
  const filled = fillTemplate(template, { date: '2026年9月22日' });
  assert.match(filled, /（2026年9月22日）/u);
  assert.doesNotMatch(filled, /\{date\}/u);
});
