import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, {
  CustomerInfo,
  PURCHASES_ERROR_CODE,
  PurchasesError,
  PurchasesOfferings,
} from 'react-native-purchases';
import { resetApiIdentity } from '../lib/api/client';
import { parseRequestDate, shouldApplyCustomerInfo } from '../lib/entitlementOrdering';
import {
  activeExpirationDateFromCustomerInfo,
  configureRevenueCat,
  planFromCustomerInfo,
  PACKAGE_IDS,
} from '../lib/purchases';
import {
  LOCAL_AI_VOICE_SCENARIO,
  getLocalAiVoiceTestScenario,
} from '../dev/localAiVoiceScenario';
import {
  PLAN_PACKAGE_IDS,
  type PlanStoreProduct,
  type PlanStoreProducts,
  type SubscriptionPlanId,
} from '../lib/planPricing';
import {
  restoreOutcomeForPlan,
  type PaidPlan,
  type PurchaseOutcome,
  type RestoreOutcome,
} from '../features/purchases/purchaseOutcome';

export type Plan = 'free' | 'basic' | 'premium';
export type RevenueCatEntitlementSource =
  | 'customer-info-listener'
  | 'after-configure-refresh'
  | 'after-purchase-refresh'
  | 'after-restore-refresh'
  | 'manual-refresh'
  | 'after-logout-refresh'
  | 'local-development-scenario';

// Legacy AsyncStorage keys cleared after RC initializes.
const LEGACY_KEY      = 'wordping_pro';
const LEGACY_PLAN_KEY = 'wordping_plan';

/**
 * Returned by `runExclusive` when another store operation already holds the
 * slot. Module-level so the identity is stable across renders, and not exported
 * so the only thing that can observe it is the mapping to `{ kind: 'busy' }`.
 */
const BUSY = Symbol('purchase-operation-busy');

function isCancelled(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const purchaseError = err as Partial<PurchasesError>;
  return purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR || purchaseError.userCancelled === true;
}

function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message
    : typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : String(err);
}

function purchaseErrorDetails(err: unknown): {
  code: string;
  message: string;
  readableErrorCode?: string;
  underlyingErrorMessage?: string;
} {
  const purchaseError = typeof err === 'object' && err !== null ? err as Partial<PurchasesError> : null;
  return {
    code: purchaseError?.code != null ? String(purchaseError.code) : 'unknown',
    message: errorMessage(err),
    readableErrorCode: purchaseError?.userInfo?.readableErrorCode ?? purchaseError?.readableErrorCode,
    underlyingErrorMessage: purchaseError?.underlyingErrorMessage,
  };
}


/**
 * The Basic and Premium products, read from the offering that will be purchased.
 *
 * Resolved from `offerings.current` — the same offering and the same package
 * identifiers `purchasePlan` buys from — so the paywall can never quote a price
 * from one package while charging another.
 *
 * Nothing is computed here: the price string, currency and period are the
 * product's own, so a price changed in App Store Connect appears in the app once
 * Apple and RevenueCat caches refresh, with no app update.
 */
function readPlanProducts(offerings: PurchasesOfferings | null): PlanStoreProducts {
  const packages = offerings?.current?.availablePackages ?? [];
  const products: Partial<Record<SubscriptionPlanId, PlanStoreProduct>> = {};

  for (const plan of ['basic', 'premium'] as const) {
    const pkg = packages.find(candidate => candidate.identifier === PLAN_PACKAGE_IDS[plan]);
    if (!pkg) continue;
    products[plan] = {
      packageId: pkg.identifier,
      productId: pkg.product.identifier,
      priceString: pkg.product.priceString,
      currencyCode: pkg.product.currencyCode ?? null,
      // Field name differs across SDK majors; neither is invented by us.
      period: (pkg.product as { subscriptionPeriod?: string }).subscriptionPeriod ?? null,
    };
  }
  return products;
}

async function fetchOfferings(): Promise<PurchasesOfferings> {
  const offerings = await Purchases.getOfferings();
  // A real misconfiguration, and otherwise silent: every plan price disappears
  // with no error anywhere.
  if (!offerings.current) {
    console.warn('[RC] No current offering. Either none is marked current in the RevenueCat dashboard, or it has no products attached.');
  }
  return offerings;
}

async function fetchFreshCustomerInfo(): Promise<CustomerInfo> {
  await Purchases.invalidateCustomerInfoCache();
  return Purchases.getCustomerInfo();
}

export function useSubscription() {
  const [plan, setPlan]               = useState<Plan>('free');
  const [isLoaded, setIsLoaded]       = useState(false);
  // There is deliberately no `error`, `isPurchasing` or `isRestoring` state
  // here. All three existed and nothing rendered them, which is how a failed
  // purchase and a failed restore both became silent. The outcome is returned
  // to the caller instead, and the spinner belongs to the one screen that owns
  // the button — so there is a single owner per surface and nothing to leave
  // stuck behind an operation this hook refused to start.
  const [offerings, setOfferings]     = useState<PurchasesOfferings | null>(null);
  const [entitlementSource, setEntitlementSource] = useState<RevenueCatEntitlementSource | null>(null);
  const [entitlementRevision, setEntitlementRevision] = useState(0);
  // ISO-8601 expiry of the active entitlement, for the plan-switch notice. Set
  // only alongside `plan`, so it can never describe a different snapshot than
  // the plan currently on screen.
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const operationRef                  = useRef<Promise<unknown> | null>(null);
  // A ref, not state: this is read and written across the await in a purchase,
  // where a state value would still be the pre-purchase snapshot, and it must
  // not cause a render of its own.
  const lastAppliedRequestDateRef     = useRef<number | null>(null);

  /**
   * The single writer for `plan`, and the only place snapshot ordering is
   * enforced. Both the post-purchase read and the customerInfoUpdateListener
   * come through here, so a listener callback carrying a pre-upgrade snapshot
   * can no longer land last and downgrade the plan.
   */
  const applyVerifiedCustomerInfo = (
    source: RevenueCatEntitlementSource,
    info: CustomerInfo,
  ): void => {
    if (!shouldApplyCustomerInfo(info.requestDate, lastAppliedRequestDateRef.current)) return;
    // Only advance on a usable timestamp, so one undated snapshot cannot pin the
    // guard to a value that rejects everything after it.
    const applied = parseRequestDate(info.requestDate);
    if (applied !== null) lastAppliedRequestDateRef.current = applied;
    setPlan(planFromCustomerInfo(info));
    // Written here and nowhere else, so a snapshot rejected as stale above also
    // leaves the expiry untouched rather than pairing a new date with an old plan.
    setExpirationDate(activeExpirationDateFromCustomerInfo(info));
    setEntitlementSource(source);
    setEntitlementRevision(revision => revision + 1);
  };

  /**
   * Clears the ordering guard so the next snapshot is accepted unconditionally.
   *
   * Required whenever the App User ID changes: a different customer's snapshots
   * are on their own timeline, and a genuinely current one can easily carry an
   * older `requestDate` than the previous user's last applied value. Without
   * this, the new user's plan would be rejected as stale.
   */
  const resetEntitlementOrdering = (): void => {
    lastAppliedRequestDateRef.current = null;
  };

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoaded(true);
      return;
    }

    let active = true;
    let listener: ((info: CustomerInfo) => void) | null = null;

    (async () => {
      try {
        const localScenario = await getLocalAiVoiceTestScenario();
        if (localScenario === LOCAL_AI_VOICE_SCENARIO) {
          if (active) {
            // Premium, matching the tier the local Worker mocks: High-Quality
            // AI Voice is Premium, so a mocked Basic would leave the app on
            // device TTS and never reach the harness.
            setPlan('premium');
            setEntitlementSource('local-development-scenario');
            setEntitlementRevision(revision => revision + 1);
          }
          return;
        }

        const configured = await configureRevenueCat();
        if (!configured) throw new Error('revenuecat_not_configured');

        listener = (info: CustomerInfo) => {
          if (active) applyVerifiedCustomerInfo('customer-info-listener', info);
        };
        if (active) Purchases.addCustomerInfoUpdateListener(listener);

        // WordPing has no accounts, so there is nothing to log in as.
        //
        // `logIn` is deliberately NOT called. The SDK persists whichever App
        // User ID it is already using and restores it on every launch, so a
        // fresh install gets a RevenueCat anonymous id and an upgrading user
        // keeps the id their purchases are already attached to. Calling
        // `logOut` here would mint a new anonymous user and strand existing
        // subscribers until they found "Restore Purchases".
        const customerInfo = await fetchFreshCustomerInfo();
        const nextOfferings = await fetchOfferings();
        if (active) {
          applyVerifiedCustomerInfo('after-configure-refresh', customerInfo);
          setOfferings(nextOfferings);
        }

        // These keys are migration cleanup only and never grant subscription access.
        AsyncStorage.multiRemove([LEGACY_KEY, LEGACY_PLAN_KEY]).catch(() => {});
      } catch (e) {
        // This is where a bad key, a missing offering or an unreachable RevenueCat
        // ends up. It was `__DEV__`-only, so in TestFlight the app silently stayed on
        // 'free' with no trace of why.
        console.error('[RC init error]', purchaseErrorDetails(e));
        // Network or RC failure: stay on 'free', app still usable.
      } finally {
        if (active) setIsLoaded(true);
      }
    })();

    return () => {
      active = false;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  /**
   * One store operation at a time, and the caller is told when it was refused.
   *
   * This used to return the *in-flight* promise to a second caller, so tapping
   * Premium while Basic was still going resolved with Basic's result and bought
   * nothing — silently. `BUSY` makes that refusal an outcome the UI can report,
   * which is what stops a second tap looking like a no-op.
   */
  const runExclusive = <T,>(operation: () => Promise<T>): Promise<T | typeof BUSY> => {
    if (operationRef.current) return Promise.resolve(BUSY);
    const req = operation().finally(() => {
      if (operationRef.current === req) operationRef.current = null;
    });
    operationRef.current = req;
    return req;
  };

  const purchasePlan = async (
    packageIdentifier: string,
    plan: PaidPlan,
  ): Promise<PurchaseOutcome> => {
    const result = await runExclusive(async (): Promise<PurchaseOutcome> => {
      try {
        // Resolve immediately before purchase so a fresh Simulator cannot race
        // the initial offerings request or use a stale package object.
        const latestOfferings = await fetchOfferings();
        setOfferings(latestOfferings);
        const pkg = latestOfferings.current?.availablePackages.find(
          candidate => candidate.identifier === packageIdentifier,
        );
        if (!pkg) {
          // The lookup is by exact package identifier, so a dashboard using the built-in
          // `$rc_monthly` / `$rc_annual` names never matches 'basic' / 'premium' and both
          // plans fail identically, before StoreKit is ever reached. Print what was
          // actually on offer so the mismatch is visible rather than inferred.
          console.error('[RC package lookup failed]', {
            wanted: packageIdentifier,
            currentOfferingIdentifier: latestOfferings.current?.identifier ?? null,
            availablePackageIdentifiers:
              latestOfferings.current?.availablePackages.map(candidate => candidate.identifier) ?? [],
            availableProductIdentifiers:
              latestOfferings.current?.availablePackages.map(candidate => candidate.product.identifier) ?? [],
            allOfferingIdentifiers: Object.keys(latestOfferings.all),
          });
          return { kind: 'unavailable' };
        }

        await Purchases.purchasePackage(pkg);
        // Verified, and applied through the single writer so the ordering guard
        // still rejects a snapshot older than one already applied.
        const refreshedInfo = await fetchFreshCustomerInfo();
        applyVerifiedCustomerInfo('after-purchase-refresh', refreshedInfo);
        // The plan that was bought, not the one the refreshed receipt happens to
        // show. `purchasePackage` resolving means StoreKit completed and
        // RevenueCat validated it; reading the tier back here instead would turn
        // RevenueCat's own propagation lag into a false "purchase failed" for a
        // charge the user has already been billed for.
        return { kind: 'purchased', plan };
      } catch (e) {
        if (isCancelled(e)) return { kind: 'cancelled' };
        console.error('[RC purchase error]', purchaseErrorDetails(e));
        return { kind: 'failed' };
      }
    });
    return result === BUSY ? { kind: 'busy' } : result;
  };

  const subscribe = (): Promise<PurchaseOutcome> =>
    purchasePlan(PACKAGE_IDS.BASIC, 'basic');

  const subscribePremium = (): Promise<PurchaseOutcome> =>
    purchasePlan(PACKAGE_IDS.PREMIUM, 'premium');

  const restore = async (): Promise<RestoreOutcome> => {
    const result = await runExclusive(async (): Promise<RestoreOutcome> => {
      try {
        await Purchases.restorePurchases();
        // Freshly fetched, never the `plan` state: that is the snapshot this
        // operation exists to correct, so reading it would confirm a
        // subscription from exactly the data the user distrusts.
        const refreshedInfo = await fetchFreshCustomerInfo();
        applyVerifiedCustomerInfo('after-restore-refresh', refreshedInfo);
        return restoreOutcomeForPlan(planFromCustomerInfo(refreshedInfo));
      } catch (e) {
        // Backing out of the App Store sheet is an ordinary outcome, not a
        // failure: it is neither logged nor reported, exactly as in purchasePlan.
        if (isCancelled(e)) return { kind: 'cancelled' };
        console.error('[RC restore error]', purchaseErrorDetails(e));
        return { kind: 'failed' };
      }
    });
    return result === BUSY ? { kind: 'busy' } : result;
  };

  const refreshCustomerInfo = async (): Promise<void> => {
    try {
      const info = await fetchFreshCustomerInfo();
      applyVerifiedCustomerInfo('manual-refresh', info);
    } catch (e) {
      console.error('[RC refresh error]', purchaseErrorDetails(e));
    }
  };

  // DEV ONLY: switch to a RevenueCat anonymous user for identity testing.
  const unsubscribe = async (): Promise<void> => {
    if (!__DEV__) return;
    try {
      await Purchases.logOut();
      // logOut mints a new anonymous App User ID, so the cached identity the
      // API client sends must be discarded or it would keep quoting the old one.
      resetApiIdentity();
      // The new user's snapshots are on their own timeline and can legitimately
      // carry an older requestDate than the previous user's last applied one.
      // Clearing the guard here is what stops them being rejected as stale.
      // This is the only place the App User ID changes: production never calls
      // logIn or logOut, so there is no other switch point to cover.
      resetEntitlementOrdering();
      const refreshedInfo = await fetchFreshCustomerInfo();
      applyVerifiedCustomerInfo('after-logout-refresh', refreshedInfo);
    } catch (e) {
      if (__DEV__) console.warn('[useSubscription] logOut error:', errorMessage(e));
    }
  };

  // Derived, not stored: the products follow whatever offerings state holds,
  // so a refresh after a purchase or a restore updates the paywall too.
  const planProducts = readPlanProducts(offerings);

  return {
    plan,
    planProducts,
    isSubscribed: plan !== 'free',
    isPremium: plan === 'premium',
    isLoaded,
    offerings,
    expirationDate,
    entitlementSource,
    entitlementRevision,
    subscribe,
    subscribePremium,
    restore,
    refreshCustomerInfo,
    unsubscribe,
  };
}
