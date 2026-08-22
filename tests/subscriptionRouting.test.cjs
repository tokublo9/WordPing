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

test('nothing routes a subscription action out to Apple', () => {
  // The in-app Cancel Subscription row was removed, so the app no longer opens
  // Apple's management sheet at all. Everything subscription-related is a
  // purchase and stays in the app; if a cancel entry point is reintroduced, it
  // belongs in Settings and never on a plan button.
  for (const file of [
    'src/hooks/useSubscription.ts',
    'src/components/ProSheet.tsx',
    'src/components/SettingsModal.tsx',
  ]) {
    assert.doesNotMatch(
      withoutComments(fs.readFileSync(file, 'utf8')),
      /showManageSubscriptions/u,
      `${file} should not open Apple's management sheet`,
    );
  }
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
