import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wordping_pro';

export function useSubscription() {
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if (__DEV__) AsyncStorage.removeItem(KEY); // TEMP: remove after reset
    AsyncStorage.getItem(KEY).then(v => setIsSubscribed(v === '1'));
  }, []);

  // ⚠️  Real IAP (StoreKit / Google Play) requires react-native-purchases
  // (RevenueCat) and a native build — it does NOT work in Expo Go.
  // Replace the two AsyncStorage calls below with Purchases.purchasePackage /
  // Purchases.restorePurchases once you set up a development build.
  const subscribe = async () => {
    await AsyncStorage.setItem(KEY, '1');
    setIsSubscribed(true);
  };

  const restore = async () => {
    const v = await AsyncStorage.getItem(KEY);
    setIsSubscribed(v === '1');
  };

  return { isSubscribed, subscribe, restore };
}
