import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Purchases, { LOG_LEVEL, CustomerInfo } from 'react-native-purchases';
import {
  resolveRevenueCatApiKey,
  TEST_STORE_KEY_PREFIX,
  TEST_STORE_MISSING_KEY_MESSAGE,
} from '../features/purchases/revenueCatKey';
import {
  completeStoredRevenueCatIdentityMigration,
  prepareStoredRevenueCatIdentity,
} from './revenueCatIdentity';
import {
  themeProductRefs,
  themeIdsForEntitlements,
} from '../features/themes/themeProducts';

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

export interface RestoredPurchaseDetails {
  /** Individually purchased themes, never themes merely included in a plan. */
  themeIds: string[];
  /** The active subscription tier restored from this receipt. */
  plan: 'free' | 'basic' | 'premium';
  /** Start of the restored subscription, or first theme purchase for theme-only restores. */
  startedAt: string | null;
  /** Subscription expiry, or null for a permanent theme-only restore. */
  endsAt: string | null;
  /** Distinguishes permanent access from an unavailable expiry date. */
  hasLifetimeAccess: boolean;
}

function validTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Builds the receipt-backed summary shown after Restore Purchases succeeds.
 *
 * Only active plan and theme entitlements participate: this mirrors what the
 * restore actually made usable on this device and avoids presenting an expired
 * subscription as though it had been restored. When a subscription is active,
 * its own start and expiry define the displayed range; individually purchased
 * themes must not make that subscription look permanent. For a theme-only
 * restore, the range runs from the first purchase through lifetime access.
 */
export function restoredPurchaseDetailsFromCustomerInfo(
  info: CustomerInfo,
): RestoredPurchaseDetails {
  const active = info.entitlements.active ?? {};
  const plan = planFromCustomerInfo(info);
  const themeIds = themeIdsForEntitlements(Object.keys(active));
  const subscriptionEntitlement = plan === 'premium'
    ? active[ENTITLEMENT_IDS.PREMIUM]
    : plan === 'basic'
      ? active[ENTITLEMENT_IDS.BASIC]
      : undefined;
  const themeEntitlements = themeIds.flatMap(themeId => {
    const entitlementId = themeProductRefs(themeId)?.entitlementId;
    return entitlementId && active[entitlementId] ? [active[entitlementId]] : [];
  });
  const relevantEntitlements = subscriptionEntitlement
    ? [subscriptionEntitlement]
    : themeEntitlements;

  const starts = relevantEntitlements
    .map(entitlement => validTimestamp(
      entitlement.originalPurchaseDate ?? entitlement.latestPurchaseDate,
    ))
    .filter((timestamp): timestamp is number => timestamp !== null);
  const expirations = relevantEntitlements
    .map(entitlement => validTimestamp(entitlement.expirationDate))
    .filter((timestamp): timestamp is number => timestamp !== null);
  const hasLifetimeAccess = relevantEntitlements.some(
    entitlement => entitlement.expirationDate === null,
  );

  return {
    themeIds,
    plan,
    startedAt: starts.length > 0 ? new Date(Math.min(...starts)).toISOString() : null,
    endsAt: !hasLifetimeAccess && expirations.length > 0
      ? new Date(Math.max(...expirations)).toISOString()
      : null,
    hasLifetimeAccess,
  };
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
    const identity = await prepareStoredRevenueCatIdentity();
    Purchases.configure(identity.kind === 'custom'
      ? { apiKey, appUserID: identity.appUserID }
      : { apiKey });

    if (!(await Purchases.isConfigured())) {
      console.error('[RC] RevenueCat did not finish configuration.');
      return false;
    }

    // Keep this after the SDK confirms configuration and before any identity
    // migration. This is intentionally a warning so it remains visible while
    // RevenueCat's normal INFO and DEBUG logging is disabled above. A logging
    // failure must never disable purchases or alter the identity flow.
    try {
      const appUserId = await Purchases.getAppUserID();
      console.warn('[RevenueCat] Current App User ID:', appUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('[RevenueCat] Could not read current App User ID:', message);
    }

    // A legacy install must first recover the SDK's cached anonymous user, then
    // alias that subscriber to the stored UUID. Failure leaves both the old
    // identity and the pending marker intact, so the next launch retries.
    await completeStoredRevenueCatIdentityMigration(identity);
    return true;
  })().catch(error => {
    configurationRequest = null;
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RC] RevenueCat configuration failed:', message);
    return false;
  });

  return configurationRequest;
}
