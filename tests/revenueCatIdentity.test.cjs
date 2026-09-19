const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');

const read = path => readFileSync(path, 'utf8');

test('RevenueCat uses the after-first-unlock, this-device-only Keychain UUID', () => {
  const storage = read('src/lib/revenueCatIdentity.ts');
  const purchases = read('src/lib/purchases.ts');

  assert.match(storage, /SecureStore\.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY/u);
  assert.doesNotMatch(storage, /keychainAccessible: SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/u);
  assert.match(storage, /SecureStore\.setItemAsync\(key, value, KEYCHAIN_OPTIONS\)/u);
  assert.match(purchases, /\{ apiKey, appUserID: identity\.appUserID \}/u);
  assert.match(purchases, /identity\.kind === 'custom'[\s\S]{0,120}: \{ apiKey \}/u);
  assert.match(purchases, /completeStoredRevenueCatIdentityMigration\(identity\)/u);
});

test('no client path logs RevenueCat out to a fresh anonymous identity', () => {
  const purchases = read('src/lib/purchases.ts');
  const subscription = read('src/hooks/useSubscription.ts');
  const identity = read('src/lib/revenueCatIdentity.ts');
  const production = `${purchases}\n${subscription}\n${identity}`;

  assert.doesNotMatch(production, /Purchases\.logOut\s*\(/u);
  assert.match(subscription, /await Purchases\.logIn\(appUserID\)/u);
  assert.match(subscription, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/u);
  assert.match(subscription, /stable RevenueCat logIn failed after retry/u);
});
