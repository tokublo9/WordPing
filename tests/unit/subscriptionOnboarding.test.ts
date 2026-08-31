import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseConsentPromptShown,
  serializeConsentPromptShown,
  shouldPromptConsentAfterSubscription,
  type SubscriptionConsentPromptInput,
} from '../../src/features/onboarding/subscriptionOnboarding';

/**
 * Offering AI permission once, after a subscription starts.
 *
 * The offer follows a verified purchase, waits for the Upgrade sheet to close,
 * and is recorded so it cannot repeat.
 */

/** A first Basic purchase that has just completed, sheet closed. */
const AFTER_PURCHASE: SubscriptionConsentPromptInput = {
  plan: 'basic',
  isSubscriptionLoaded: true,
  entitlementSource: 'after-purchase-refresh',
  consent: 'unknown',
  alreadyPrompted: false,
  isUpgradeSheetClosed: true,
  isScreenBusy: false,
};

test('1. a first Basic purchase offers consent once the sheet has closed', () => {
  assert.equal(shouldPromptConsentAfterSubscription(AFTER_PURCHASE), true);
});

test('2. a first Premium purchase behaves identically', () => {
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, plan: 'premium' }),
    true,
  );
});

test('5. nothing is offered until the Upgrade sheet is fully closed', () => {
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, isUpgradeSheetClosed: false }),
    false,
  );
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, isScreenBusy: true }),
    false,
  );
});

test('3 & 4. opening the sheet, cancelling or failing offers nothing', () => {
  // Every one of these leaves the entitlement resolved by something other than
  // a completed purchase — which is the whole test.
  for (const entitlementSource of [
    'customer-info-listener',   // a plain launch or a background refresh
    'after-configure-refresh',  // app start
    'manual-refresh',
    'after-restore-refresh',
    null,                       // RevenueCat unreachable
  ]) {
    assert.equal(
      shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, entitlementSource }),
      false,
      `${String(entitlementSource)} must not trigger the offer`,
    );
  }
});

test('a loading or unknown subscription state offers nothing', () => {
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, isSubscriptionLoaded: false }),
    false,
  );
  // Fell back to free: not a plan that can use AI, so there is nothing to permit.
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, plan: 'free' }),
    false,
  );
});

test('6. an existing granted permission is not asked for again', () => {
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, consent: 'granted' }),
    false,
  );
  // Including on a Basic → Premium upgrade, which is still a real purchase.
  assert.equal(
    shouldPromptConsentAfterSubscription({
      ...AFTER_PURCHASE, plan: 'premium', consent: 'granted',
    }),
    false,
  );
});

test('the offer is made once, not on every launch or sheet close', () => {
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, alreadyPrompted: true }),
    false,
  );
});

test('a previous decline does not block the offer after a new subscription', () => {
  // `alreadyPrompted` is cleared on a verified downgrade, so a resubscription
  // arrives here with a declined answer and an unmade offer — and asks again.
  assert.equal(
    shouldPromptConsentAfterSubscription({
      ...AFTER_PURCHASE, consent: 'declined', alreadyPrompted: false,
    }),
    true,
  );
});

test('the stored flag is versioned and round-trips', () => {
  assert.equal(parseConsentPromptShown(serializeConsentPromptShown(true)), true);
  assert.equal(parseConsentPromptShown(serializeConsentPromptShown(false)), false);
  for (const raw of [null, undefined, '', 'yes', 'TRUE', '1']) {
    assert.equal(parseConsentPromptShown(raw), false);
  }
});
