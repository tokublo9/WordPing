import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases, {
  CustomerInfo,
  PURCHASES_ERROR_CODE,
  PurchasesOfferings,
} from 'react-native-purchases';
import { requireSupabaseSession } from '../lib/supabase';
import { configureRevenueCat, planFromCustomerInfo, PACKAGE_IDS } from '../lib/purchases';

export type Plan = 'free' | 'basic' | 'premium';

// Legacy AsyncStorage keys cleared after RC initializes.
const LEGACY_KEY      = 'wordping_pro';
const LEGACY_PLAN_KEY = 'wordping_plan';

function isCancelled(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  return (err as { code?: string }).code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

export function useSubscription() {
  const [plan, setPlan]               = useState<Plan>('free');
  const [isLoaded, setIsLoaded]       = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [offerings, setOfferings]     = useState<PurchasesOfferings | null>(null);
  const operationRef                  = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') {
      setIsLoaded(true);
      return;
    }

    configureRevenueCat();

    let active = true;

    (async () => {
      try {
        const session = await requireSupabaseSession();
        const { customerInfo } = await Purchases.logIn(session.user.id);
        if (active) setPlan(planFromCustomerInfo(customerInfo));

        // Fire-and-forget: fetch offerings and clear stale AsyncStorage keys.
        Purchases.getOfferings().then(o => { if (active) setOfferings(o); }).catch(() => {});
        AsyncStorage.multiRemove([LEGACY_KEY, LEGACY_PLAN_KEY]).catch(() => {});
      } catch (e) {
        if (__DEV__) console.warn('[useSubscription] init error:', e);
        // Network or RC failure: stay on 'free', app still usable.
      } finally {
        if (active) setIsLoaded(true);
      }
    })();

    const listener = (info: CustomerInfo) => {
      if (active) setPlan(planFromCustomerInfo(info));
    };
    Purchases.addCustomerInfoUpdateListener(listener);

    return () => {
      active = false;
      Purchases.removeCustomerInfoUpdateListener(listener);
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

  const subscribe = (): Promise<void> =>
    runExclusive(async () => {
      const pkg = offerings?.current?.availablePackages.find(
        p => p.identifier === PACKAGE_IDS.BASIC,
      );
      if (!pkg) return;
      setIsPurchasing(true);
      setError(null);
      try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        setPlan(planFromCustomerInfo(customerInfo));
      } catch (e) {
        if (!isCancelled(e)) setError('Purchase failed. Please try again.');
      } finally {
        setIsPurchasing(false);
      }
    });

  const subscribePremium = (): Promise<void> =>
    runExclusive(async () => {
      const pkg = offerings?.current?.availablePackages.find(
        p => p.identifier === PACKAGE_IDS.PREMIUM,
      );
      if (!pkg) return;
      setIsPurchasing(true);
      setError(null);
      try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        setPlan(planFromCustomerInfo(customerInfo));
      } catch (e) {
        if (!isCancelled(e)) setError('Purchase failed. Please try again.');
      } finally {
        setIsPurchasing(false);
      }
    });

  const restore = (): Promise<void> =>
    runExclusive(async () => {
      setIsRestoring(true);
      setError(null);
      try {
        const customerInfo = await Purchases.restorePurchases();
        setPlan(planFromCustomerInfo(customerInfo));
      } catch (e) {
        if (__DEV__) console.warn('[useSubscription] restore error:', e);
        setError('Restore failed. Please try again.');
      } finally {
        setIsRestoring(false);
      }
    });

  const refreshCustomerInfo = async (): Promise<void> => {
    try {
      const info = await Purchases.getCustomerInfo();
      setPlan(planFromCustomerInfo(info));
    } catch (e) {
      if (__DEV__) console.warn('[useSubscription] refresh error:', e);
    }
  };

  // DEV ONLY: Log out of RevenueCat to reset entitlements for testing.
  const unsubscribe = async (): Promise<void> => {
    if (!__DEV__) return;
    try {
      await Purchases.logOut();
      setPlan('free');
    } catch (e) {
      if (__DEV__) console.warn('[useSubscription] logOut error:', e);
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
    subscribe,
    subscribePremium,
    restore,
    refreshCustomerInfo,
    unsubscribe,
  };
}
