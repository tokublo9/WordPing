import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import {
  UNKNOWN_AI_ENTITLEMENT,
  hasEligibleAIEntitlement,
  isAIEntitlementEligible,
  isVerifiedFreePlan,
  planCanUseAI,
  requireAIEntitlement,
  resetAIEntitlementForTests,
  setAIEntitlementSnapshot,
  type AIEntitlementState,
} from '../../src/lib/aiEntitlement';
import {
  configureAIConsentStorage,
  getAIConsent,
  invalidateAIConsent,
  requireAIConsent,
  resetAIConsentForTests,
  setAIConsent,
} from '../../src/lib/aiConsent';
import {
  ensureAIConsentForUserAction,
  registerAIConsentPromptHost,
  resetAIConsentPromptForTests,
  resolveAIConsentPrompt,
  dismissAIConsentPrompt,
} from '../../src/lib/aiConsentPrompt';
import { isAIRequestError } from '../../src/lib/api/errors';
import { VOICE_MONTHLY_LIMITS } from '../../src/lib/planLimits';

/**
 * Entitlement and consent together.
 *
 * An AI request needs both, and the two interact over a subscription's life:
 * losing the plan ends the permission, and regaining it must ask again.
 */

class FakeStore {
  constructor(private value: string | null = null) {}
  getItem(): Promise<string | null> { return Promise.resolve(this.value); }
  setItem(_key: string, value: string): Promise<void> { this.value = value; return Promise.resolve(); }
}

/** Stands in for `post()` in api/client.ts: both guards, then the wire. */
function createTransport() {
  const sent: string[] = [];
  return {
    sent,
    async send(text: string): Promise<void> {
      requireAIEntitlement();
      await requireAIConsent();
      sent.push(text);
    },
  };
}

const LOADING: AIEntitlementState = UNKNOWN_AI_ENTITLEMENT;
const VERIFIED_FREE: AIEntitlementState = {
  plan: 'free', isSubscriptionLoaded: true, entitlementSource: 'customer-info-listener',
};
const BASIC: AIEntitlementState = {
  plan: 'basic', isSubscriptionLoaded: true, entitlementSource: 'after-purchase-refresh',
};
const PREMIUM: AIEntitlementState = {
  plan: 'premium', isSubscriptionLoaded: true, entitlementSource: 'customer-info-listener',
};
/** RevenueCat unreachable: the plan defaults to free with no verified source. */
const UNVERIFIED_FREE: AIEntitlementState = {
  plan: 'free', isSubscriptionLoaded: true, entitlementSource: null,
};

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  resetAIEntitlementForTests();
  resetAIConsentForTests();
  resetAIConsentPromptForTests();
});

// ── The rule comes from the existing entitlement configuration ───────────────

test('eligibility is derived from the configured AI allowance, not a tier list', () => {
  // Free's zero allowance is what makes it ineligible; anything else qualifies.
  assert.equal(VOICE_MONTHLY_LIMITS.free, 0);
  assert.equal(planCanUseAI('free'), false);
  assert.equal(planCanUseAI('basic'), true);
  assert.equal(planCanUseAI('premium'), true, 'null means included, not zero');
});

test('2. nothing is eligible while the subscription state is still loading', () => {
  assert.equal(hasEligibleAIEntitlement(LOADING), false);
  assert.equal(hasEligibleAIEntitlement({ ...BASIC, isSubscriptionLoaded: false }), false);
});

test('1 & 3. Free is ineligible; Basic and Premium are eligible', () => {
  assert.equal(hasEligibleAIEntitlement(VERIFIED_FREE), false);
  assert.equal(hasEligibleAIEntitlement(BASIC), true);
  assert.equal(hasEligibleAIEntitlement(PREMIUM), true);
});

// ── 5: an ineligible device sends nothing ────────────────────────────────────

test('5. a Free user cannot send an AI request even with consent stored', () => {
  configureAIConsentStorage(new FakeStore('granted'));
  setAIEntitlementSnapshot(VERIFIED_FREE);
  const transport = createTransport();

  return assert.rejects(
    transport.send('serendipity'),
    error => isAIRequestError(error) && error.kind === 'subscription_required',
  ).then(() => assert.deepEqual(transport.sent, []));
});

test('a request during loading is refused rather than raced', () => {
  setAIEntitlementSnapshot(LOADING);
  assert.throws(
    () => requireAIEntitlement(),
    error => isAIRequestError(error) && error.serverCode === 'entitlement_unresolved',
  );
});

test('an unreachable RevenueCat is refused too — unknown is not eligible', () => {
  setAIEntitlementSnapshot(UNVERIFIED_FREE);
  assert.equal(isAIEntitlementEligible(), false);
});

test('4. a Free user is never asked for consent, because nothing asks', () => {
  configureAIConsentStorage(new FakeStore(null));
  setAIEntitlementSnapshot(VERIFIED_FREE);
  let opened = 0;
  registerAIConsentPromptHost({ open: () => { opened += 1; }, close: () => {} });

  // The entitlement guard rejects before the consent guard is ever consulted,
  // and no AI surface is reachable to raise the dialog.
  assert.throws(() => requireAIEntitlement());
  assert.equal(opened, 0);
});

// ── 6–9: an eligible subscriber is asked at the point of use ─────────────────

test('6. becoming eligible does not grant or request consent by itself', async () => {
  const store = new FakeStore(null);
  configureAIConsentStorage(store);
  let opened = 0;
  registerAIConsentPromptHost({ open: () => { opened += 1; }, close: () => {} });

  // Subscribing only changes the entitlement. Nothing about it touches consent.
  setAIEntitlementSnapshot(BASIC);
  await flush();

  assert.equal(opened, 0, 'no dialog on the subscription-success screen');
  assert.equal(getAIConsent(), 'unknown');
  await assert.rejects(createTransport().send('anything'));
});

test('7 & 9. the first AI action asks, and Allow runs exactly one request', async () => {
  configureAIConsentStorage(new FakeStore(null));
  setAIEntitlementSnapshot(BASIC);
  const transport = createTransport();
  let opened = 0;
  registerAIConsentPromptHost({ open: () => { opened += 1; }, close: () => {} });

  const action = (async () => {
    if (!await ensureAIConsentForUserAction()) return;
    await transport.send('ephemeral');
  })();
  await flush();
  assert.equal(opened, 1);
  assert.deepEqual(transport.sent, [], 'nothing before the answer');

  await resolveAIConsentPrompt('granted');
  await action;
  assert.deepEqual(transport.sent, ['ephemeral']);
});

test('8. Not Now and dismissal both send nothing', async () => {
  configureAIConsentStorage(new FakeStore(null));
  setAIEntitlementSnapshot(BASIC);
  const transport = createTransport();
  registerAIConsentPromptHost({ open: () => {}, close: () => {} });

  const declined = (async () => {
    if (!await ensureAIConsentForUserAction()) return;
    await transport.send('declined');
  })();
  await flush();
  await resolveAIConsentPrompt('declined');
  await declined;

  const dismissed = (async () => {
    if (!await ensureAIConsentForUserAction()) return;
    await transport.send('dismissed');
  })();
  await flush();
  dismissAIConsentPrompt();
  await dismissed;

  assert.deepEqual(transport.sent, []);
});

test('10. revoking permission blocks the next request immediately', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  setAIEntitlementSnapshot(BASIC);
  const transport = createTransport();

  await transport.send('before');
  await setAIConsent('declined');
  await assert.rejects(transport.send('after'));
  assert.deepEqual(transport.sent, ['before']);
});

// ── 11–14: the subscription lifecycle ────────────────────────────────────────

test('11. a verified move to Free stops AI and invalidates the permission', async () => {
  const store = new FakeStore('granted');
  configureAIConsentStorage(store);
  setAIEntitlementSnapshot(BASIC);
  const transport = createTransport();
  await transport.send('while subscribed');

  // The plan is verified as Free, so the period the permission belonged to is over.
  setAIEntitlementSnapshot(VERIFIED_FREE);
  assert.equal(isVerifiedFreePlan(VERIFIED_FREE), true);
  await invalidateAIConsent();

  assert.equal(getAIConsent(), 'unknown');
  await assert.rejects(transport.send('after downgrade'));
  assert.deepEqual(transport.sent, ['while subscribed']);
});

test('12. a loading or unreachable state never invalidates consent', async () => {
  configureAIConsentStorage(new FakeStore('granted'));

  // Neither of these is a confirmed cancellation, so neither may revoke.
  assert.equal(isVerifiedFreePlan(LOADING), false, 'still loading');
  assert.equal(isVerifiedFreePlan(UNVERIFIED_FREE), false, 'RevenueCat unreachable');
  // A verified paid plan is obviously not a downgrade either.
  assert.equal(isVerifiedFreePlan(BASIC), false);
  assert.equal(isVerifiedFreePlan(PREMIUM), false);

  // The stored permission survives an outage untouched.
  setAIEntitlementSnapshot(UNVERIFIED_FREE);
  assert.equal(await (async () => { await requireAIConsent(); return getAIConsent(); })(), 'granted');
});

test('13 & 14. resubscribing requires fresh permission', async () => {
  const store = new FakeStore('granted');
  configureAIConsentStorage(store);

  // Subscribed, then verified Free: the old answer is cleared.
  setAIEntitlementSnapshot(BASIC);
  setAIEntitlementSnapshot(VERIFIED_FREE);
  await invalidateAIConsent();
  assert.equal(getAIConsent(), 'unknown');

  // Resubscribing restores eligibility but not the permission.
  setAIEntitlementSnapshot(BASIC);
  const transport = createTransport();
  await assert.rejects(transport.send('after resubscribe'), 'the old consent is not reused');

  // The next AI action asks again, and only then does anything go out.
  let opened = 0;
  registerAIConsentPromptHost({ open: () => { opened += 1; }, close: () => {} });
  const action = (async () => {
    if (!await ensureAIConsentForUserAction()) return;
    await transport.send('after resubscribe');
  })();
  await flush();
  assert.equal(opened, 1);
  await resolveAIConsentPrompt('granted');
  await action;
  assert.deepEqual(transport.sent, ['after resubscribe']);
});

test('invalidation is idempotent, so it cannot churn writes on every launch', async () => {
  let writes = 0;
  configureAIConsentStorage({
    getItem: () => Promise.resolve('granted'),
    setItem: () => { writes += 1; return Promise.resolve(); },
  });

  await invalidateAIConsent();
  assert.equal(writes, 1);
  await invalidateAIConsent();
  await invalidateAIConsent();
  assert.equal(writes, 1, 'nothing left to clear');
});

// ── 5 (existing users): migration never invents a permission ─────────────────

test('an existing subscriber keeps a stored permission through the update', async () => {
  configureAIConsentStorage(new FakeStore('granted'));
  setAIEntitlementSnapshot(BASIC);
  // No verified downgrade happened, so nothing clears it.
  assert.equal(isVerifiedFreePlan(BASIC), false);
  await createTransport().send('still allowed');
  assert.equal(getAIConsent(), 'granted');
});

test('an absent, declined or corrupted value is never upgraded to granted', async () => {
  for (const stored of [null, 'declined', 'GRANTED', 'yes', '']) {
    resetAIConsentForTests();
    resetAIEntitlementForTests();
    configureAIConsentStorage(new FakeStore(stored));
    setAIEntitlementSnapshot(BASIC);
    await assert.rejects(createTransport().send('x'), `${String(stored)} must not grant`);
  }
});
