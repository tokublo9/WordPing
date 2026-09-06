import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Purchases, { LOG_LEVEL, CustomerInfo } from 'react-native-purchases';

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

    const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';

    if (!apiKey) {
      console.error('[RC] EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not set');
      return false;
    }

    const usesTestStore = apiKey.startsWith('test_');
    if (usesTestStore && !__DEV__) {
      console.error('[RC] CRITICAL: RevenueCat test key detected in non-dev build. Purchases disabled.');
      return false;
    }

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
