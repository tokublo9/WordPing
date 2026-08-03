import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, {
  CustomerInfo,
  PURCHASES_ERROR_CODE,
  PurchasesError,
  PurchasesOfferings,
} from 'react-native-purchases';
import { requireSupabaseSession } from '../lib/supabase';
import {
  configureRevenueCat,
  logActiveRevenueCatEntitlements,
  planFromCustomerInfo,
  PACKAGE_IDS,
} from '../lib/purchases';

export type Plan = 'free' | 'basic' | 'premium';
export type RevenueCatEntitlementSource =
  | 'customer-info-listener'
  | 'after-login-refresh'
  | 'after-purchase-refresh'
  | 'after-restore-refresh'
  | 'manual-refresh'
  | 'after-logout-refresh';

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
  if (!__DEV__) return;
  console.info('[RC diagnostic]', {
    source,
    currentOfferingIdentifier: offerings.current?.identifier ?? null,
    availablePackageIdentifiers: offerings.current?.availablePackages.map(pkg => pkg.identifier) ?? [],
  });
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
  const operationRef                  = useRef<Promise<void> | null>(null);

  const applyVerifiedCustomerInfo = (
    source: RevenueCatEntitlementSource,
    info: CustomerInfo,
  ): void => {
    setPlan(planFromCustomerInfo(info));
    setEntitlementSource(source);
    setEntitlementRevision(revision => revision + 1);
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
        const configured = await configureRevenueCat();
        if (!configured) throw new Error('revenuecat_not_configured');

        listener = (info: CustomerInfo) => {
          logActiveRevenueCatEntitlements('customer-info-listener', info);
          if (active) applyVerifiedCustomerInfo('customer-info-listener', info);
        };
        if (active) Purchases.addCustomerInfoUpdateListener(listener);

        const session = await requireSupabaseSession();
        const previousAppUserId = await Purchases.getAppUserID();
        const { customerInfo: loginCustomerInfo } = await Purchases.logIn(session.user.id);
        const appUserId = await Purchases.getAppUserID();
        if (__DEV__) {
          console.info('[RC diagnostic]', {
            source: 'identity',
            appUserId,
            switchedFromAnonymousUser: previousAppUserId.startsWith('$RCAnonymousID:'),
            matchesAuthenticatedUser: appUserId === session.user.id,
          });
        }
        logActiveRevenueCatEntitlements('login-response', loginCustomerInfo);

        const customerInfo = await fetchFreshCustomerInfo('after-login-refresh');
        const nextOfferings = await fetchOfferings('after-login');
        if (active) {
          applyVerifiedCustomerInfo('after-login-refresh', customerInfo);
          setOfferings(nextOfferings);
        }

        // These keys are migration cleanup only and never grant subscription access.
        AsyncStorage.multiRemove([LEGACY_KEY, LEGACY_PLAN_KEY]).catch(() => {});
      } catch (e) {
        if (__DEV__) console.warn('[useSubscription] init error:', errorMessage(e));
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
        if (!pkg) throw new Error(`revenuecat_package_unavailable:${packageIdentifier}`);

        if (__DEV__) {
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
        applyVerifiedCustomerInfo('after-purchase-refresh', refreshedInfo);
      } catch (e) {
        const details = purchaseErrorDetails(e);
        if (isCancelled(e)) {
          if (__DEV__) console.info('[RC diagnostic] Purchase cancelled.', details);
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
        if (__DEV__) console.warn('[useSubscription] restore error:', errorMessage(e));
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
      if (__DEV__) console.warn('[useSubscription] refresh error:', errorMessage(e));
    }
  };

  // DEV ONLY: switch to a RevenueCat anonymous user for identity testing.
  const unsubscribe = async (): Promise<void> => {
    if (!__DEV__) return;
    try {
      const anonymousInfo = await Purchases.logOut();
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
    entitlementSource,
    entitlementRevision,
    subscribe,
    subscribePremium,
    restore,
    refreshCustomerInfo,
    unsubscribe,
  };
}
