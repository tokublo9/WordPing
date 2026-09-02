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

/**
 * A first Premium purchase that has just completed, sheet closed.
 *
 * Premium because that is the plan the permission is *for*: it is the only one
 * with AI Voice, and therefore the only purchase that shares anything.
 */
const AFTER_PURCHASE: SubscriptionConsentPromptInput = {
  plan: 'premium',
  isSubscriptionLoaded: true,
  entitlementSource: 'after-purchase-refresh',
  consent: 'unknown',
  alreadyPrompted: false,
  isUpgradeSheetClosed: true,
  isScreenBusy: false,
};

test('1. a first Premium purchase offers consent once the sheet has closed', () => {
  assert.equal(shouldPromptConsentAfterSubscription(AFTER_PURCHASE), true);
});

test('2. a Basic purchase offers nothing, because Basic shares nothing', () => {
  // Basic buys Custom Voice for Words — a local audio file that reaches no
  // network — so a completed Basic purchase has no data sharing to permit and
  // must not raise the dialog. Upgrading to Premium is what asks.
  assert.equal(
    shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, plan: 'basic' }),
    false,
  );
  // Not even with everything else lined up: sheet closed, nothing else on
  // screen, never prompted, no stored answer.
  assert.equal(
    shouldPromptConsentAfterSubscription({
      ...AFTER_PURCHASE,
      plan: 'basic',
      consent: 'unknown',
      alreadyPrompted: false,
      isUpgradeSheetClosed: true,
      isScreenBusy: false,
    }),
    false,
  );
});

test('2b. upgrading Basic to Premium is when the offer arrives', () => {
  // The plan that gained AI Voice is the plan that is asked.
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
  // Not a plan that can use AI, so there is nothing to permit. The rule is the
  // AI one rather than a plan name, which is what puts Basic here with Free.
  for (const plan of ['free', 'basic'] as const) {
    assert.equal(
      shouldPromptConsentAfterSubscription({ ...AFTER_PURCHASE, plan }),
      false,
      plan,
    );
  }
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
