import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Purchases, { LOG_LEVEL, CustomerInfo } from 'react-native-purchases';
import {
  resolveRevenueCatApiKey,
  TEST_STORE_KEY_PREFIX,
  TEST_STORE_MISSING_KEY_MESSAGE,
} from '../features/purchases/revenueCatKey';

export const ENTITLEMENT_IDS = {
  BASIC: 'basic',
  PREMIUM: 'premium',
} as const;

// Package identifiers as configured in the RevenueCat Dashboard.
export const PACKAGE_IDS = {
  BASIC: 'basic',
  PREMIUM: 'premium',
} as const;

export function planFromCustomerInfo(info: CustomerInfo): 'free' | 'basic' | 'premium' {
  const active = info.entitlements.active;
  if (active[ENTITLEMENT_IDS.PREMIUM]?.isActive) return 'premium';
  if (active[ENTITLEMENT_IDS.BASIC]?.isActive) return 'basic';
  return 'free';
}

/**
 * When the currently active entitlement lapses, as an ISO-8601 string.
 *
 * Follows the same premium-before-basic precedence as `planFromCustomerInfo`, so
 * the date always belongs to the entitlement the rest of the app calls the
 * current plan. Null for a lifetime entitlement (RevenueCat reports no expiry)
 * and for free, neither of which has a renewal to describe.
 *
 * Kept here rather than in the hook because `entitlements.active` is read in
 * exactly one module, and a second reader could apply different precedence.
 */
export function activeExpirationDateFromCustomerInfo(info: CustomerInfo): string | null {
  const active = info.entitlements.active;
  const entitlement = active[ENTITLEMENT_IDS.PREMIUM]?.isActive
    ? active[ENTITLEMENT_IDS.PREMIUM]
    : active[ENTITLEMENT_IDS.BASIC]?.isActive
      ? active[ENTITLEMENT_IDS.BASIC]
      : undefined;
  return entitlement?.expirationDate ?? null;
}

let configurationRequest: Promise<boolean> | null = null;

export function configureRevenueCat(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  if (configurationRequest) return configurationRequest;

  configurationRequest = (async () => {
    if (await Purchases.isConfigured()) return true;

    // TEMPORARY (Simulator recordings): the key may come from the Test Store
    // variable instead, but only in a development build with the switch
    // explicitly on — see `revenueCatKey.ts`. `__DEV__` is handed in rather
    // than read there, which is what lets a test prove a release build cannot
    // reach the Test Store branch.
    const resolution = resolveRevenueCatApiKey(__DEV__, {
      EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
      EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE: process.env.EXPO_PUBLIC_USE_REVENUECAT_TEST_STORE,
      EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY: process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_API_KEY,
    });

    if (!resolution.ok) {
      // Each reason is a configuration fault that leaves purchases off rather
      // than configured with the wrong key.
      switch (resolution.reason) {
        case 'missing_app_store_key':
          console.error('[RC] EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not set');
          break;
        case 'test_store_requested_without_key':
          // Only reachable in a development build, so the message is too.
          console.error(TEST_STORE_MISSING_KEY_MESSAGE);
          break;
        case 'test_store_key_in_release':
          console.error('[RC] CRITICAL: RevenueCat test key detected in non-dev build. Purchases disabled.');
          break;
      }
      return false;
    }

    const { apiKey } = resolution;
    // Either route to a test key counts: the new switch, or a `test_` key still
    // pasted into the production variable. Both warnings below are about what
    // the key *is*, so neither may depend on which variable carried it.
    const usesTestStore = resolution.source === 'test-store'
      || apiKey.startsWith(TEST_STORE_KEY_PREFIX);

    // Both are real configuration faults, not narration of a healthy launch.
    if (usesTestStore) {
      console.warn('[RC] Using RevenueCat test key. Do not use in production builds.');
    }
    if (!Device.isDevice && !usesTestStore) {
      console.error('[RC] Simulator is not configured with the RevenueCat Test Store key.');
    }

    // setLogLevel must be called before configure, and this is the only place the
    // SDK's log level is set. WARN in every build, development included: DEBUG
    // and INFO are the SDK narrating its own network calls, cache reads and
    // successful lookups, which drowns everything else in the terminal. Warnings
    // and errors — the lines that mean something is actually wrong — still print,
    // to the iOS system log, so they remain readable in Console.app on TestFlight.
    await Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey });

    if (!(await Purchases.isConfigured())) {
      console.error('[RC] RevenueCat did not finish configuration.');
      return false;
    }
    return true;
  })().catch(error => {
    configurationRequest = null;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RC] RevenueCat configuration failed:', message);
    return false;
  });

  return configurationRequest;
}
