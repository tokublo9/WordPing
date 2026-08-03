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

let configurationRequest: Promise<boolean> | null = null;

export function logActiveRevenueCatEntitlements(source: string, info: CustomerInfo): void {
  if (!__DEV__) return;
  console.info('[RC diagnostic]', {
    source,
    activeEntitlementIdentifiers: Object.keys(info.entitlements.active),
  });
}

export function configureRevenueCat(): Promise<boolean> {
  if (Platform.OS !== 'ios') return Promise.resolve(false);
  if (configurationRequest) return configurationRequest;

  configurationRequest = (async () => {
    if (await Purchases.isConfigured()) {
      if (__DEV__) {
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

    if (__DEV__) {
      console.info('[RC diagnostic]', {
        source: 'configuration',
        platform: Platform.OS,
        device: Device.isDevice ? 'physical-device' : 'simulator',
        store: usesTestStore ? 'revenuecat-test-store' : 'apple-app-store',
      });
      if (usesTestStore) {
        console.warn('[RC] Using RevenueCat test key. Do not use in production builds.');
      }
      if (!Device.isDevice && !usesTestStore) {
        console.error('[RC diagnostic] Simulator is not configured with the RevenueCat Test Store key.');
      }
    }

    // setLogLevel should be called before configure.
    await Purchases.setLogLevel(LOG_LEVEL.ERROR);
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
