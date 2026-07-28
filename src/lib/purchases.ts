import { Platform } from 'react-native';
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

let configured = false;

export function configureRevenueCat(): void {
  if (configured) return;
  if (Platform.OS !== 'ios') return;

  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? '';

  if (!apiKey) {
    if (__DEV__) console.warn('[RC] EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is not set');
    return;
  }

  if (apiKey.startsWith('test_') && !__DEV__) {
    console.error('[RC] CRITICAL: RevenueCat test key detected in non-dev build. Purchases disabled.');
    return;
  }

  if (__DEV__ && apiKey.startsWith('test_')) {
    console.warn('[RC] Using RevenueCat test key. Do not use in production builds.');
  }

  // setLogLevel should be called before configure.
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG).catch(() => {});
  }

  Purchases.configure({ apiKey });
  configured = true;
}
