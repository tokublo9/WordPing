import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isThemeUnlocked,
  resolveThemeAccess,
  type ThemeAccessInput,
} from '../../src/features/themes/themeAccess';

/** A paid theme, with the caller's plan state supplied per test. */
function access(overrides: Partial<ThemeAccessInput> = {}) {
  return resolveThemeAccess({
    price: 320,
    isSubscribed: false,
    isSubscriptionLoaded: true,
    ...overrides,
  });
}

test('a free theme is unlocked for everyone, on every plan state', () => {
  for (const plan of [
    { isSubscribed: false, isSubscriptionLoaded: true },
    { isSubscribed: true, isSubscriptionLoaded: true },
    // Even before RevenueCat answers: nothing is being unlocked that costs money.
    { isSubscribed: false, isSubscriptionLoaded: false },
  ]) {
    assert.deepEqual(access({ price: 0, ...plan }), { state: 'unlocked', reason: 'free' });
  }
});

test('a paid theme is locked for a free user', () => {
  assert.deepEqual(access({ isSubscribed: false }), { state: 'locked' });
  assert.equal(isThemeUnlocked({ price: 320, isSubscribed: false, isSubscriptionLoaded: true }), false);
});

test('a subscription unlocks a paid theme', () => {
  // Basic and Premium are both `isSubscribed` — the shop draws no distinction
  // between them, so one branch covers both plans.
  assert.deepEqual(access({ isSubscribed: true }), { state: 'unlocked', reason: 'subscription' });
});

test('a paid theme stays locked until RevenueCat has answered', () => {
  // Fail closed: an unresolved entitlement must never hand out a paid theme,
  // however briefly.
  assert.deepEqual(
    access({ isSubscribed: true, isSubscriptionLoaded: false }),
    { state: 'locked' },
  );
});

test('an expired subscription re-locks every paid theme', () => {
  // The only input that changes on expiry is isSubscribed, so the same theme
  // that was unlocked a moment ago is locked now — no ownership record survives
  // to keep it open, because none is ever recorded.
  assert.equal(access({ isSubscribed: true }).state, 'unlocked');
  assert.deepEqual(access({ isSubscribed: false }), { state: 'locked' });
});

test('there is no purchasable or unavailable state left', () => {
  // Individual theme purchasing is gone: every outcome is unlocked or locked,
  // so no caller can be asked to render a price, a Buy button or a store error.
  for (const price of [0, 320, 480]) {
    for (const isSubscribed of [true, false]) {
      for (const isSubscriptionLoaded of [true, false]) {
        const state = resolveThemeAccess({ price, isSubscribed, isSubscriptionLoaded }).state;
        assert.ok(state === 'unlocked' || state === 'locked', `unexpected state: ${state}`);
      }
    }
  }
});

test('nothing about access depends on a product identifier', () => {
  // The input carries no theme id and no owned-product set, so there is no way
  // to express "unlocked because it was bought on its own".
  const input: ThemeAccessInput = { price: 480, isSubscribed: true, isSubscriptionLoaded: true };
  assert.deepEqual(Object.keys(input).sort(), ['isSubscribed', 'isSubscriptionLoaded', 'price']);
  const result = resolveThemeAccess(input);
  assert.ok(result.state === 'unlocked' && result.reason === 'subscription');
});
