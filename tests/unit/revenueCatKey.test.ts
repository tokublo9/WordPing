import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TEST_STORE_KEY_PREFIX,
  TEST_STORE_MISSING_KEY_MESSAGE,
  TEST_STORE_SWITCH_ON,
  isTestStoreRequestedWithoutKey,
  resolveRevenueCatApiKey,
  shouldUseRevenueCatTestStore,
  type RevenueCatKeyEnv,
} from '../../src/features/purchases/revenueCatKey';

/**
 * The temporary Simulator Test Store switch.
 *
 * The thing worth proving is not that it works — it is that it cannot work in a
 * shipped build. `__DEV__` is an argument here precisely so `isDev: false` can
 * be exercised directly, which no amount of reading the source can establish.
 *
 * No real key appears in this file. `test_sim` and `appl_prod` are shapes, not
 * credentials.
 */

const APP_STORE = 'appl_prod';
const TEST_STORE = 'test_sim';

const PRODUCTION: RevenueCatKeyEnv = { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: APP_STORE };
const RECORDING: RevenueCatKeyEnv = {
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: APP_STORE,
  EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: '1',
  EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: TEST_STORE,
};

// ── The release guard ────────────────────────────────────────────────────────

test('a release build can never select the Test Store key, however the env is set', () => {
  // Every shape a leaked or copied local setup could take, all with `__DEV__`
  // false. Not one of them may return the Test Store key.
  const leaked: RevenueCatKeyEnv[] = [
    RECORDING,
    { ...RECORDING, EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: '1' },
    { ...RECORDING, EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: `${TEST_STORE}_other` },
    // The switch on with no App Store key at all: still not a reason to reach
    // for the test key. Purchases stay off instead.
    {
      EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: '1',
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: TEST_STORE,
    },
  ];

  for (const env of leaked) {
    assert.equal(shouldUseRevenueCatTestStore(false, env), false, JSON.stringify(env));
    const resolved = resolveRevenueCatApiKey(false, env);
    if (resolved.ok) {
      assert.equal(resolved.source, 'app-store', 'a release build may only use the App Store key');
      assert.equal(
        resolved.apiKey.startsWith(TEST_STORE_KEY_PREFIX),
        false,
        'a release build must never configure with a test_ key',
      );
    }
  }

  // And with a normal production env it is simply the App Store key.
  assert.deepEqual(
    resolveRevenueCatApiKey(false, PRODUCTION),
    { ok: true, apiKey: APP_STORE, source: 'app-store' },
  );
});

test('a test_ key sitting in the production variable is still refused in release', () => {
  // The pre-existing guard. Unchanged: refused rather than used.
  assert.deepEqual(
    resolveRevenueCatApiKey(false, { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: TEST_STORE }),
    { ok: false, reason: 'test_store_key_in_release' },
  );
  // In development that same key is allowed through, exactly as before.
  assert.deepEqual(
    resolveRevenueCatApiKey(true, { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: TEST_STORE }),
    { ok: true, apiKey: TEST_STORE, source: 'app-store' },
  );
});

// ── The default is off ───────────────────────────────────────────────────────

test('with the variable absent the switch is off, in development too', () => {
  assert.equal(shouldUseRevenueCatTestStore(true, PRODUCTION), false);
  assert.deepEqual(
    resolveRevenueCatApiKey(true, PRODUCTION),
    { ok: true, apiKey: APP_STORE, source: 'app-store' },
    'the default development build is unchanged by this feature',
  );
  // A Test Store key present but unswitched changes nothing either.
  assert.deepEqual(
    resolveRevenueCatApiKey(true, {
      ...PRODUCTION,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: TEST_STORE,
    }),
    { ok: true, apiKey: APP_STORE, source: 'app-store' },
  );
});

test('only the exact string "1" opts in — nothing truthy-adjacent does', () => {
  assert.equal(TEST_STORE_SWITCH_ON, '1');
  for (const value of ['', '0', 'true', 'TRUE', 'yes', 'on', ' 1', '1 ', '01', '2']) {
    const env: RevenueCatKeyEnv = {
      ...PRODUCTION,
      EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: value,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: TEST_STORE,
    };
    assert.equal(shouldUseRevenueCatTestStore(true, env), false, `"${value}" must not enable the switch`);
    assert.deepEqual(resolveRevenueCatApiKey(true, env), { ok: true, apiKey: APP_STORE, source: 'app-store' });
  }
});

// ── The development path it exists for ───────────────────────────────────────

test('all three conditions together select the Test Store key', () => {
  assert.equal(shouldUseRevenueCatTestStore(true, RECORDING), true);
  assert.deepEqual(
    resolveRevenueCatApiKey(true, RECORDING),
    { ok: true, apiKey: TEST_STORE, source: 'test-store' },
  );
  // Surrounding whitespace from a hand-edited .env.local is trimmed, not treated
  // as a key.
  assert.deepEqual(
    resolveRevenueCatApiKey(true, {
      ...RECORDING,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: `  ${TEST_STORE}  `,
    }),
    { ok: true, apiKey: TEST_STORE, source: 'test-store' },
  );
});

test('requested without a key configures nothing rather than the wrong key', () => {
  for (const value of [undefined, '', '   ']) {
    const env: RevenueCatKeyEnv = {
      ...PRODUCTION,
      EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: '1',
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: value,
    };
    assert.equal(isTestStoreRequestedWithoutKey(true, env), true);
    assert.deepEqual(
      resolveRevenueCatApiKey(true, env),
      { ok: false, reason: 'test_store_requested_without_key' },
      'it must not silently fall back to the real App Store key mid-recording',
    );
  }

  // A release build does not "request" anything, so it never reports this.
  assert.equal(isTestStoreRequestedWithoutKey(false, { ...PRODUCTION, EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: '1' }), false);

  // The DEV-only message names both variables and carries no key value.
  assert.match(TEST_STORE_MISSING_KEY_MESSAGE, /EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE=1/u);
  assert.match(TEST_STORE_MISSING_KEY_MESSAGE, /EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY/u);
  assert.match(TEST_STORE_MISSING_KEY_MESSAGE, /\.env\.local/u);
  assert.equal(TEST_STORE_MISSING_KEY_MESSAGE.includes(TEST_STORE), false, 'never log a key value');
});

test('a missing App Store key is still its own distinct failure', () => {
  assert.deepEqual(resolveRevenueCatApiKey(true, {}), { ok: false, reason: 'missing_app_store_key' });
  assert.deepEqual(resolveRevenueCatApiKey(false, {}), { ok: false, reason: 'missing_app_store_key' });
  assert.deepEqual(
    resolveRevenueCatApiKey(false, { EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: '   ' }),
    { ok: false, reason: 'missing_app_store_key' },
  );
});

test('the production key is never mutated, only ever read as the fallback', () => {
  // Whatever the switch does, the App Store variable is what a non-test launch
  // configures with — the feature adds a branch, it does not redirect the old one.
  const env: RevenueCatKeyEnv = { ...RECORDING };
  const before = env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  resolveRevenueCatApiKey(true, env);
  resolveRevenueCatApiKey(false, env);
  assert.equal(env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, before);
  assert.deepEqual(env, RECORDING, 'the resolver must not write to the environment it is given');
});
