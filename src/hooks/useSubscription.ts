import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Plan = 'free' | 'basic' | 'premium';

const KEY      = 'wordping_pro';   // legacy: '1' meant a paid (Basic) plan
const PLAN_KEY = 'wordping_plan';  // 'basic' | 'premium'

export function useSubscription() {
  const [plan, setPlan]         = useState<Plan>('free');
  const [isLoaded, setIsLoaded] = useState(false);
  const operationRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const p = await AsyncStorage.getItem(PLAN_KEY);
        if (p === 'basic' || p === 'premium') {
          setPlan(p);
        } else {
          // Migrate legacy paid users (pre-Premium) to Basic.
          const legacy = await AsyncStorage.getItem(KEY);
          setPlan(legacy === '1' ? 'basic' : 'free');
        }
      } finally {
        setIsLoaded(true);
      }
    })().catch(() => setPlan('free'));
  }, []);

  const runExclusive = (operation: () => Promise<void>): Promise<void> => {
    if (operationRef.current) return operationRef.current;
    const request = operation().finally(() => {
      if (operationRef.current === request) operationRef.current = null;
    });
    operationRef.current = request;
    return request;
  };

  // Real IAP (StoreKit / Google Play) requires react-native-purchases
  // (RevenueCat) and a native build — it does NOT work in Expo Go.
  // Replace the AsyncStorage writes below with Purchases.purchasePackage /
  // Purchases.restorePurchases once you set up a development build.
  const subscribe = async () => {
    await runExclusive(async () => {
      await AsyncStorage.multiSet([[PLAN_KEY, 'basic'], [KEY, '1']]);
      setPlan('basic');
    });
  };

  const subscribePremium = async () => {
    await runExclusive(async () => {
      await AsyncStorage.multiSet([[PLAN_KEY, 'premium'], [KEY, '1']]);
      setPlan('premium');
    });
  };

  const restore = async () => {
    await runExclusive(async () => {
      const p = await AsyncStorage.getItem(PLAN_KEY);
      if (p === 'basic' || p === 'premium') { setPlan(p); return; }
      const legacy = await AsyncStorage.getItem(KEY);
      setPlan(legacy === '1' ? 'basic' : 'free');
    });
  };

  // DEV ONLY: Cycles premium → basic → free for testing all states.
  const unsubscribe = async () => {
    if (!__DEV__) return;
    await runExclusive(async () => {
      if (plan === 'premium') {
        await AsyncStorage.multiSet([[PLAN_KEY, 'basic'], [KEY, '1']]);
        setPlan('basic');
      } else {
        await AsyncStorage.multiRemove([PLAN_KEY, KEY]);
        setPlan('free');
      }
    });
  };

  return {
    plan,
    isSubscribed: plan !== 'free',
    isPremium: plan === 'premium',
    isLoaded,
    subscribe,
    subscribePremium,
    restore,
    unsubscribe,
  };
}
