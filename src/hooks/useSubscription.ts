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
  logActiveRevenueCatEntitlements,
  planFromCustomerInfo,
  PACKAGE_IDS,
  RC_DIAGNOSTICS,
} from '../lib/purchases';
import {
  BASIC_MONTHLY_LIMIT_SCENARIO,
  getLocalAiVoiceTestScenario,
} from '../dev/localAiVoiceScenario';

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

function logOfferings(source: string, offerings: PurchasesOfferings): void {
  if (!RC_DIAGNOSTICS) return;
  console.info('[RC diagnostic]', {
    source,
    currentOfferingIdentifier: offerings.current?.identifier ?? null,
    availablePackageIdentifiers: offerings.current?.availablePackages.map(pkg => pkg.identifier) ?? [],
    // Every offering, not just `current`: a dashboard with offerings defined but none
    // marked current is indistinguishable from an empty account without this.
    allOfferingIdentifiers: Object.keys(offerings.all),
  });
  if (!offerings.current) {
    console.warn('[RC] No current offering. Either none is marked current in the RevenueCat dashboard, or it has no products attached.');
  }
}

async function fetchOfferings(source: string): Promise<PurchasesOfferings> {
  const offerings = await Purchases.getOfferings();
  logOfferings(source, offerings);
  return offerings;
}

async function fetchFreshCustomerInfo(source: string): Promise<CustomerInfo> {
  await Purchases.invalidateCustomerInfoCache();
  const info = await Purchases.getCustomerInfo();
  logActiveRevenueCatEntitlements(source, info);
  return info;
}

export function useSubscription() {
  const [plan, setPlan]               = useState<Plan>('free');
  const [isLoaded, setIsLoaded]       = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [offerings, setOfferings]     = useState<PurchasesOfferings | null>(null);
  const [entitlementSource, setEntitlementSource] = useState<RevenueCatEntitlementSource | null>(null);
  const [entitlementRevision, setEntitlementRevision] = useState(0);
  // ISO-8601 expiry of the active entitlement, for the plan-switch notice. Set
  // only alongside `plan`, so it can never describe a different snapshot than
  // the plan currently on screen.
  const [expirationDate, setExpirationDate] = useState<string | null>(null);
  const operationRef                  = useRef<Promise<void> | null>(null);
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
    if (!shouldApplyCustomerInfo(info.requestDate, lastAppliedRequestDateRef.current)) {
      if (RC_DIAGNOSTICS) {
        console.info('[RC diagnostic]', {
          source: 'stale-snapshot-ignored',
          from: source,
          incomingRequestDate: info.requestDate,
          lastAppliedRequestDate: new Date(lastAppliedRequestDateRef.current ?? 0).toISOString(),
          wouldHaveResolvedTo: planFromCustomerInfo(info),
        });
      }
      return;
    }
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
        if (localScenario === BASIC_MONTHLY_LIMIT_SCENARIO) {
          if (active) {
            setPlan('basic');
            setEntitlementSource('local-development-scenario');
            setEntitlementRevision(revision => revision + 1);
          }
          return;
        }

        const configured = await configureRevenueCat();
        if (!configured) throw new Error('revenuecat_not_configured');

        listener = (info: CustomerInfo) => {
          logActiveRevenueCatEntitlements('customer-info-listener', info);
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
        const appUserId = await Purchases.getAppUserID();
        if (RC_DIAGNOSTICS) {
          console.info('[RC diagnostic]', {
            source: 'identity',
            isAnonymous: appUserId.startsWith('$RCAnonymousID:'),
          });
        }

        const customerInfo = await fetchFreshCustomerInfo('after-configure-refresh');
        const nextOfferings = await fetchOfferings('after-configure');
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

  const runExclusive = (operation: () => Promise<void>): Promise<void> => {
    if (operationRef.current) return operationRef.current;
    const req = operation().finally(() => {
      if (operationRef.current === req) operationRef.current = null;
    });
    operationRef.current = req;
    return req;
  };

  const purchasePlan = (packageIdentifier: string): Promise<void> =>
    runExclusive(async () => {
      setIsPurchasing(true);
      setError(null);
      try {
        // Resolve immediately before purchase so a fresh Simulator cannot race
        // the initial offerings request or use a stale package object.
        const latestOfferings = await fetchOfferings(`before-purchase:${packageIdentifier}`);
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
          throw new Error(`revenuecat_package_unavailable:${packageIdentifier}`);
        }

        if (RC_DIAGNOSTICS) {
          console.info('[RC diagnostic]', {
            source: 'purchase-package',
            currentOfferingIdentifier: latestOfferings.current?.identifier ?? null,
            packageIdentifier: pkg.identifier,
            productIdentifier: pkg.product.identifier,
          });
        }
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        logActiveRevenueCatEntitlements('purchase-response', customerInfo);
        const refreshedInfo = await fetchFreshCustomerInfo('after-purchase-refresh');
        if (RC_DIAGNOSTICS) {
          // Reading the two snapshots side by side is what separates the two
          // possible causes of an upgrade that still shows the old plan: either
          // RevenueCat had not yet promoted the entitlement (both say basic), or
          // it had and something later overwrote it (both say premium, yet the UI
          // does not). `purchased` is what the user just paid for.
          console.info('[RC diagnostic]', {
            source: 'purchase-plan-resolution',
            purchased: packageIdentifier,
            fromPurchaseResponse: planFromCustomerInfo(customerInfo),
            fromRefreshedRead: planFromCustomerInfo(refreshedInfo),
            purchaseRequestDate: customerInfo.requestDate,
            refreshedRequestDate: refreshedInfo.requestDate,
          });
        }
        applyVerifiedCustomerInfo('after-purchase-refresh', refreshedInfo);
      } catch (e) {
        const details = purchaseErrorDetails(e);
        if (isCancelled(e)) {
          // Worth seeing in TestFlight: StoreKit reports some sandbox failures as a
          // cancellation, so a purchase that "cancels" without the user tapping Cancel
          // is a real signal rather than noise.
          if (RC_DIAGNOSTICS) console.info('[RC diagnostic] Purchase cancelled.', details);
        } else {
          console.error('[RC purchase error]', details);
          setError('Purchase failed. Please try again.');
        }
      } finally {
        setIsPurchasing(false);
      }
    });

  const subscribe = (): Promise<void> => purchasePlan(PACKAGE_IDS.BASIC);

  const subscribePremium = (): Promise<void> => purchasePlan(PACKAGE_IDS.PREMIUM);

  const restore = (): Promise<void> =>
    runExclusive(async () => {
      setIsRestoring(true);
      setError(null);
      try {
        const restoredInfo = await Purchases.restorePurchases();
        logActiveRevenueCatEntitlements('restore-response', restoredInfo);
        const refreshedInfo = await fetchFreshCustomerInfo('after-restore-refresh');
        applyVerifiedCustomerInfo('after-restore-refresh', refreshedInfo);
      } catch (e) {
        if (RC_DIAGNOSTICS) console.error('[RC restore error]', purchaseErrorDetails(e));
        setError('Restore failed. Please try again.');
      } finally {
        setIsRestoring(false);
      }
    });

  const refreshCustomerInfo = async (): Promise<void> => {
    try {
      const info = await fetchFreshCustomerInfo('manual-refresh');
      applyVerifiedCustomerInfo('manual-refresh', info);
    } catch (e) {
      if (RC_DIAGNOSTICS) console.error('[RC refresh error]', purchaseErrorDetails(e));
    }
  };

  /**
   * Opens Apple's subscription management sheet.
   *
   * The ONLY route out of the app for anything subscription-related, and it
   * exists for cancellation alone. Changing plan never comes here: Basic and
   * Premium both go through `purchasePackage` above, so an upgrade or downgrade
   * stays inside the app and gets StoreKit's own purchase sheet.
   *
   * `showManageSubscriptions` rather than a `Linking.openURL('itms-apps://…')`:
   * it is the SDK's supported entry point and avoids `canOpenURL` returning
   * false for an undeclared URL scheme.
   */
  const openManageSubscriptions = async (): Promise<void> => {
    if (Platform.OS !== 'ios') return;
    try {
      await Purchases.showManageSubscriptions();
    } catch (e) {
      if (RC_DIAGNOSTICS) console.error('[RC manage subscriptions error]', purchaseErrorDetails(e));
      setError('Could not open subscription settings. Please try again.');
    }
  };

  // DEV ONLY: switch to a RevenueCat anonymous user for identity testing.
  const unsubscribe = async (): Promise<void> => {
    if (!__DEV__) return;
    try {
      const anonymousInfo = await Purchases.logOut();
      // logOut mints a new anonymous App User ID, so the cached identity the
      // API client sends must be discarded or it would keep quoting the old one.
      resetApiIdentity();
      // The new user's snapshots are on their own timeline and can legitimately
      // carry an older requestDate than the previous user's last applied one.
      // Clearing the guard here is what stops them being rejected as stale.
      // This is the only place the App User ID changes: production never calls
      // logIn or logOut, so there is no other switch point to cover.
      resetEntitlementOrdering();
      logActiveRevenueCatEntitlements('logout-response', anonymousInfo);
      const refreshedInfo = await fetchFreshCustomerInfo('after-logout-refresh');
      applyVerifiedCustomerInfo('after-logout-refresh', refreshedInfo);
    } catch (e) {
      if (__DEV__) console.warn('[useSubscription] logOut error:', errorMessage(e));
    }
  };

  return {
    plan,
    isSubscribed: plan !== 'free',
    isPremium: plan === 'premium',
    isLoaded,
    isPurchasing,
    isRestoring,
    error,
    offerings,
    expirationDate,
    entitlementSource,
    entitlementRevision,
    subscribe,
    subscribePremium,
    restore,
    refreshCustomerInfo,
    openManageSubscriptions,
    unsubscribe,
  };
}
