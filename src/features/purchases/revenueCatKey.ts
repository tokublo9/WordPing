/**
 * Which RevenueCat API key this launch configures with.
 *
 * TEMPORARY. This exists so subscriptions can be bought in the iOS Simulator
 * against RevenueCat's Test Store, for screen-recording the post-purchase UI.
 * The App Store sandbox cannot do that on a Simulator, and the alternative —
 * pasting a `test_` key over `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` — puts a test
 * key in the one variable a release build reads. Removal instructions are at the
 * bottom of this file.
 *
 * THE WHOLE RULE IS ONE PREDICATE, AND IT IS `AND`, NOT `OR`. The Test Store key
 * is selected only when the build is a development build, the switch is set to
 * exactly `'1'`, and a non-empty Test Store key was supplied. Anything else —
 * including a release build with the switch left on, which is the case that
 * matters — falls through to the existing App Store key, unchanged.
 *
 * `__DEV__` is passed in rather than read here. It is a bundler-time constant
 * with no meaning under `node --test`, so taking it as an argument is what lets
 * the release guard be *proved* by a test rather than asserted in a comment.
 *
 * Pure — no react-native, no expo, no RevenueCat import — so every branch below
 * is unit-tested directly against a fake environment. It reads nothing from
 * `process.env` itself; the caller passes the values in.
 */

/** The environment variables this decision reads. Nothing else is consulted. */
export interface RevenueCatKeyEnv {
  /** The production Apple key. Always the fallback, never overwritten. */
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?: string;
  /** Exactly `'1'` opts in. Absent, empty, `'0'`, `'true'` — all off. */
  EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE?: string;
  /** The Test Store public SDK key. Only ever read in a development build. */
  EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY?: string;
}

export type RevenueCatKeySource = 'app-store' | 'test-store';

export type RevenueCatKeyResolution =
  | { ok: true; apiKey: string; source: RevenueCatKeySource }
  | {
      ok: false;
      /** Nothing is configured. The caller logs this and returns false. */
      reason:
        /** No App Store key at all — the pre-existing failure, unchanged. */
        | 'missing_app_store_key'
        /** Test Store asked for in dev with no key. Never silently falls back. */
        | 'test_store_requested_without_key'
        /** A `test_` key in the production variable, in a non-dev build. */
        | 'test_store_key_in_release';
    };

/** The opt-in value. One exact string, so no truthy accident can enable it. */
export const TEST_STORE_SWITCH_ON = '1';

/** RevenueCat issues Test Store keys under this prefix. */
export const TEST_STORE_KEY_PREFIX = 'test_';

/**
 * Whether this launch may use the Test Store key.
 *
 * Exported so the predicate itself can be asserted, rather than only its
 * consequences. Every term is required; `isDev` is first because it is the one
 * that a shipped build can never satisfy.
 */
export function shouldUseRevenueCatTestStore(isDev: boolean, env: RevenueCatKeyEnv): boolean {
  return isDev === true
    && env.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE === TEST_STORE_SWITCH_ON
    && (env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ?? '').trim() !== '';
}

/**
 * Whether Test Store mode was asked for but cannot be honoured.
 *
 * Only true in a development build: a release build does not "request" the Test
 * Store however the switch is set, it simply ignores it.
 */
export function isTestStoreRequestedWithoutKey(isDev: boolean, env: RevenueCatKeyEnv): boolean {
  return isDev === true
    && env.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE === TEST_STORE_SWITCH_ON
    && (env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ?? '').trim() === '';
}

export function resolveRevenueCatApiKey(isDev: boolean, env: RevenueCatKeyEnv): RevenueCatKeyResolution {
  if (shouldUseRevenueCatTestStore(isDev, env)) {
    return {
      ok: true,
      apiKey: (env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY ?? '').trim(),
      source: 'test-store',
    };
  }

  // Asked for, in dev, with nothing to use. Refusing here is the point: falling
  // through to the App Store key would quietly charge a real sandbox account in
  // the middle of a recording session, and would make the switch look broken
  // rather than unconfigured.
  if (isTestStoreRequestedWithoutKey(isDev, env)) {
    return { ok: false, reason: 'test_store_requested_without_key' };
  }

  const appStoreKey = (env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '').trim();
  if (appStoreKey === '') return { ok: false, reason: 'missing_app_store_key' };

  // The pre-existing guard, unchanged in meaning: a `test_` key sitting in the
  // production variable is refused outright in a non-dev build rather than used.
  // It is still reachable — someone can still paste one there — and this fix
  // does not make it safe, it only makes it unnecessary.
  if (!isDev && appStoreKey.startsWith(TEST_STORE_KEY_PREFIX)) {
    return { ok: false, reason: 'test_store_key_in_release' };
  }

  return { ok: true, apiKey: appStoreKey, source: 'app-store' };
}

/**
 * The DEV-only line printed when Test Store mode cannot be honoured.
 *
 * A string rather than a `console` call so the message is testable and the
 * caller decides whether to print it — and so no key value can ever reach it.
 */
export const TEST_STORE_MISSING_KEY_MESSAGE =
  '[RC] EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE=1 but EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY is empty. '
  + 'Purchases are not configured. Set the Test Store key in .env.local or unset the switch.';

/*
 * REMOVING THIS, when the recordings are done:
 *
 *   1. Delete `EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE` and
 *      `EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY` from `.env.local`.
 *   2. Delete this file and `tests/unit/revenueCatKey.test.ts`.
 *   3. In `src/lib/purchases.ts`, restore the two original lines:
 *        const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
 *        const usesTestStore = apiKey.startsWith('test_');
 *      and drop the `resolveRevenueCatApiKey` import.
 *   4. Remove the two Test Store entries from `tsconfig.test.json` and
 *      `src/lib/releasePreflight.ts`, and their cases in
 *      `tests/unit/releasePreflight.test.ts`.
 *
 * Nothing else references it. No production value, EAS profile, product id or
 * entitlement id was changed to add it.
 */
