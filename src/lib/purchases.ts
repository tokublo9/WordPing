import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Purchases, { LOG_LEVEL, CustomerInfo } from 'react-native-purchases';
import { REVENUECAT_DIAGNOSTICS_ENABLED } from '../features/flags';

/**
 * Gate for every RevenueCat diagnostic. Using this instead of `__DEV__` is the
 * whole point: a TestFlight build is not a dev build, so `__DEV__` logging is
 * exactly the logging that is missing when a purchase fails in the field.
 */
export const RC_DIAGNOSTICS = __DEV__ || REVENUECAT_DIAGNOSTICS_ENABLED;

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

export function logActiveRevenueCatEntitlements(source: string, info: CustomerInfo): void {
  if (!RC_DIAGNOSTICS) return;
  console.info('[RC diagnostic]', {
    source,
    activeEntitlementIdentifiers: Object.keys(info.entitlements.active),
    // The raw active map, so a Basic->Premium upgrade can be read directly:
    // whether RevenueCat reports premium active at all, and which snapshot this
    // is. `requestDate` is the server timestamp of the snapshot — two updates
    // arriving out of order are only visible by comparing it.
    requestDate: info.requestDate,
    activeEntitlements: Object.fromEntries(
      Object.entries(info.entitlements.active).map(([id, entitlement]) => [id, {
        isActive: entitlement.isActive,
        willRenew: entitlement.willRenew,
        periodType: entitlement.periodType,
        productIdentifier: entitlement.productIdentifier,
        latestPurchaseDate: entitlement.latestPurchaseDate,
        expirationDate: entitlement.expirationDate,
      }]),
    ),
    resolvedPlan: planFromCustomerInfo(info),
  });
}

/**
 * Which RevenueCat store the running build is talking to.
 *
 * The prefix is the whole answer: a `test_` key configures the SDK against
 * RevenueCat's Test Store, which serves its own catalogue and cannot return
 * App Store products. An offering whose packages are attached to App Store
 * products therefore comes back empty — or missing — with no error, which is
 * indistinguishable from a misconfigured offering unless you look here.
 *
 * Only a short prefix is exposed. The key is public, but there is no reason to
 * put the whole thing in a log line.
 */
export function describeRevenueCatKey(): {
  store: 'app-store' | 'test-store' | 'unset' | 'unrecognised';
  keyPrefix: string;
} {
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';
  if (!apiKey) return { store: 'unset', keyPrefix: '' };
  const keyPrefix = `${apiKey.slice(0, 6)}…`;
  if (apiKey.startsWith('appl_')) return { store: 'app-store', keyPrefix };
  if (apiKey.startsWith('test_')) return { store: 'test-store', keyPrefix };
  return { store: 'unrecognised', keyPrefix };
}

export function configureRevenueCat(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  if (configurationRequest) return configurationRequest;

  configurationRequest = (async () => {
    if (await Purchases.isConfigured()) {
      if (RC_DIAGNOSTICS) {
        console.info('[RC diagnostic]', {
          source: 'configuration',
          platform: Platform.OS,
          device: Device.isDevice ? 'physical-device' : 'simulator',
          status: 'already-configured',
        });
      }
      return true;
    }

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

    if (RC_DIAGNOSTICS) {
      console.info('[RC diagnostic]', {
        source: 'configuration',
        platform: Platform.OS,
        device: Device.isDevice ? 'physical-device' : 'simulator',
        store: usesTestStore ? 'revenuecat-test-store' : 'apple-app-store',
        // Which key this build actually shipped with. The prefix is enough to tell a
        // real key from the placeholder without reproducing it in full; the `appl_`
        // SDK key is public either way.
        apiKeyPrefix: apiKey.slice(0, 9),
        apiKeyLength: apiKey.length,
      });
      if (usesTestStore) {
        console.warn('[RC] Using RevenueCat test key. Do not use in production builds.');
      }
      if (!Device.isDevice && !usesTestStore) {
        console.error('[RC diagnostic] Simulator is not configured with the RevenueCat Test Store key.');
      }
    }

    // setLogLevel should be called before configure. The native SDK logs to the iOS
    // system log, so VERBOSE is readable in Console.app on a TestFlight build — which
    // JS `console` output on a release build is not.
    await Purchases.setLogLevel(RC_DIAGNOSTICS ? LOG_LEVEL.VERBOSE : LOG_LEVEL.ERROR);
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
