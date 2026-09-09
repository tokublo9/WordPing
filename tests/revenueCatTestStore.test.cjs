const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

const resolver = read('src/features/purchases/revenueCatKey.ts');
const purchases = read('src/lib/purchases.ts');

/**
 * A TEMPORARY, DEV-only switch that lets the iOS Simulator buy against
 * RevenueCat's Test Store, so the post-purchase UI can be recorded.
 *
 * The behaviour is proved in tests/unit/revenueCatKey.test.ts, which exercises
 * `isDev: false` directly. What is pinned here is the structure that keeps it
 * provable: one predicate, `__DEV__` passed in rather than read, no key value in
 * any committed file, and no production configuration touched to add it.
 */

test('the key-selection predicate requires all three conditions, joined by AND', () => {
  const predicate = resolver.slice(
    resolver.indexOf('export function shouldUseRevenueCatTestStore('),
    resolver.indexOf('export function isTestStoreRequestedWithoutKey('),
  );
  assert.match(
    predicate,
    /return isDev === true\s*&& env\.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE === TEST_STORE_SWITCH_ON\s*&& \(env\.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY \?\? ''\)\.trim\(\) !== '';/u,
  );
  // No `||` anywhere in it: a single disjunction would be the whole bug.
  assert.doesNotMatch(predicate, /\|\|(?![\s\S]*\?\?)/u);
  assert.match(resolver, /export const TEST_STORE_SWITCH_ON = '1';/u);
});

test('__DEV__ is handed to the resolver, never read inside it', () => {
  // This is what makes the release guard testable rather than merely asserted:
  // under `node --test` there is no `__DEV__`, so a module that read it could
  // not be exercised for a release build at all.
  // Comments stripped first: the module explains *why* `__DEV__` is a parameter,
  // and that prose must not be mistaken for a reference to it.
  const code = resolver.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');
  assert.doesNotMatch(code, /__DEV__/u, 'the resolver must take isDev as an argument, never read it');
  assert.match(code, /export function shouldUseRevenueCatTestStore\(isDev: boolean, env: RevenueCatKeyEnv\): boolean/u);
  assert.match(code, /export function resolveRevenueCatApiKey\(isDev: boolean, env: RevenueCatKeyEnv\)/u);
  // It reads no environment of its own either — every value is passed in.
  assert.doesNotMatch(code, /process\.env/u, 'the resolver must not read process.env directly');
  assert.match(purchases, /const resolution = resolveRevenueCatApiKey\(__DEV__, \{/u);
  assert.match(
    purchases,
    /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process\.env\.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,\s*EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: process\.env\.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE,\s*EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: process\.env\.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,/u,
  );
});

test('a failed resolution configures nothing at all', () => {
  const configure = purchases.slice(purchases.indexOf('export function configureRevenueCat('));
  const refusalAt = configure.indexOf('if (!resolution.ok) {');
  const configureAt = configure.indexOf('Purchases.configure({ apiKey });');
  assert.ok(refusalAt > -1 && configureAt > -1);
  assert.ok(refusalAt < configureAt, 'the refusal must come before the SDK is configured');
  // Each reason returns false rather than falling through to a key.
  for (const reason of ['missing_app_store_key', 'test_store_requested_without_key', 'test_store_key_in_release']) {
    assert.match(configure, new RegExp(`case '${reason}':`, 'u'));
  }
  assert.match(configure, /\}\s*return false;\s*\}\s*\n\s*const \{ apiKey \} = resolution;/u);
});

test('no key value is committed anywhere, and the switch is not in any build config', () => {
  // The variables are named in source; their values live only in .env.local,
  // which is gitignored.
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^\.env\.local$/mu);

  for (const path of ['app.json', 'eas.json']) {
    const source = read(path);
    assert.doesNotMatch(source, /EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE/u, `${path} must not carry the switch`);
    assert.doesNotMatch(source, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY/u, `${path} must not carry the test key`);
  }

  // A literal RevenueCat key of either kind, hardcoded, in the modules that
  // decide which one to use.
  for (const [path, source] of [['revenueCatKey.ts', resolver], ['purchases.ts', purchases]]) {
    assert.doesNotMatch(source, /['"](?:appl|test)_[A-Za-z0-9]{8,}['"]/u, `${path} must not embed a key`);
  }
});

test('preflight refuses a production profile that carries either variable', () => {
  const preflight = read('src/lib/releasePreflight.ts');
  assert.match(preflight, /if \(env\.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE !== undefined\) \{\s*issues\.push\(\{ severity: 'error'/u);
  assert.match(preflight, /if \(env\.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY !== undefined\) \{\s*issues\.push\(\{ severity: 'error'/u);
  // The message must not echo the value it found.
  const block = preflight.slice(preflight.indexOf('EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE !== undefined'));
  assert.doesNotMatch(block.slice(0, 900), /\$\{env\.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY/u);
});

test('nothing about products, entitlements or the purchase flows moved', () => {
  // A key-selection change must not reach any of these.
  assert.match(purchases, /export const ENTITLEMENT_IDS = \{\s*BASIC: 'basic',\s*PREMIUM: 'premium',\s*\} as const;/u);
  assert.match(purchases, /export const PACKAGE_IDS = \{\s*BASIC: 'basic',\s*PREMIUM: 'premium',\s*\} as const;/u);
  assert.match(purchases, /if \(active\[ENTITLEMENT_IDS\.PREMIUM\]\?\.isActive\) return 'premium';/u);
  assert.match(purchases, /if \(active\[ENTITLEMENT_IDS\.BASIC\]\?\.isActive\) return 'basic';/u);
  // The SDK is still configured exactly once, with the same call.
  assert.equal((purchases.match(/Purchases\.configure\(/gu) ?? []).length, 1);
  assert.match(purchases, /await Purchases\.setLogLevel\(LOG_LEVEL\.WARN\);/u);

  // The hook that owns purchase, restore and refresh is untouched by this.
  const subscription = read('src/hooks/useSubscription.ts');
  assert.doesNotMatch(subscription, /TEST_STORE|USE_REVENUECAT_TEST_STORE|resolveRevenueCatApiKey/u);
  // And the plan rules it feeds still come from where they always did.
  assert.match(subscription, /isSubscribed: plan !== 'free',/u);
  assert.match(subscription, /isPremium: plan === 'premium',/u);
});

test('the temporary feature documents its own removal', () => {
  // A switch with no exit is a switch that ships. The steps name every file it
  // touched, so removing it is a checklist rather than an archaeology exercise.
  const removal = resolver.slice(resolver.indexOf('REMOVING THIS'));
  assert.match(removal, /\.env\.local/u);
  assert.match(removal, /tests\/unit\/revenueCatKey\.test\.ts/u);
  assert.match(removal, /src\/lib\/purchases\.ts/u);
  assert.match(removal, /tsconfig\.test\.json/u);
  assert.match(removal, /releasePreflight\.ts/u);
});
