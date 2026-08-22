const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

/**
 * Plan changes are purchases and must stay inside the app; only cancelling may
 * leave it. Wiring a plan button to Apple's management sheet would look like a
 * working "upgrade" while silently doing nothing to the entitlement, so the
 * boundary is pinned here rather than left to review.
 */

test('switching plan goes through purchasePackage, never Apple management', () => {
  const hook = fs.readFileSync('src/hooks/useSubscription.ts', 'utf8');

  // Both directions share one purchase path.
  assert.match(hook, /const subscribe = \(\): Promise<void> => purchasePlan\(PACKAGE_IDS\.BASIC\)/u);
  assert.match(hook, /const subscribePremium = \(\): Promise<void> => purchasePlan\(PACKAGE_IDS\.PREMIUM\)/u);
  assert.match(hook, /await Purchases\.purchasePackage\(pkg\)/u);

  // The purchase routine itself must never reach for the store's own UI.
  const purchaseRoutine = /const purchasePlan =([\s\S]*?)const subscribe =/u.exec(hook)?.[1];
  assert.ok(purchaseRoutine, 'purchasePlan not found');
  assert.doesNotMatch(purchaseRoutine, /showManageSubscriptions|itms-apps|Linking/u);
});

test('Apple management is reachable from exactly one place, and it is not a plan button', () => {
  const hook = fs.readFileSync('src/hooks/useSubscription.ts', 'utf8');
  assert.equal(
    (hook.match(/Purchases\.showManageSubscriptions\(\)/gu) ?? []).length,
    1,
    'showManageSubscriptions should be called from one wrapper only',
  );
  assert.match(hook, /const openManageSubscriptions = async \(\): Promise<void> =>/u);

  // The paywall's plan buttons must not be able to call it.
  const proSheet = fs.readFileSync('src/components/ProSheet.tsx', 'utf8');
  assert.doesNotMatch(proSheet, /showManageSubscriptions|itms-apps|onCancelSubscription/u);
});

test('the Cancel Subscription row is gated on having a subscription to cancel', () => {
  const settings = fs.readFileSync('src/components/SettingsModal.tsx', 'utf8');
  assert.match(settings, /\{isSubscribed && onCancelSubscription && \(/u);
  assert.match(settings, /onPress=\{\(\) => \{ void onCancelSubscription\(\); \}\}/u);
  assert.match(settings, /cancel_subscription/u);
});

/** Strips comments, so prose explaining why a URL is NOT used cannot fail a scan. */
function withoutComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^\s*\/\/.*$/gmu, '');
}

test('no subscription flow builds an App Store URL by hand', () => {
  // showManageSubscriptions is the supported entry point; a hand-built
  // itms-apps URL depends on canOpenURL succeeding for an undeclared scheme.
  for (const file of [
    'App.tsx',
    'src/hooks/useSubscription.ts',
    'src/components/ProSheet.tsx',
    'src/components/SettingsModal.tsx',
  ]) {
    assert.doesNotMatch(
      withoutComments(fs.readFileSync(file, 'utf8')),
      /itms-apps|apps\.apple\.com\/account/u,
      `${file} should not hand-build an App Store subscription URL`,
    );
  }
});
