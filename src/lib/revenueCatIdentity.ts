import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Purchases from 'react-native-purchases';
import { Settings } from 'react-native';
import { ONBOARDING_KEY } from '../constants';
import {
  finishRevenueCatIdentityMigration,
  prepareRevenueCatIdentity,
  REVENUECAT_DEVICE_ID_KEY,
  type RevenueCatIdentityPlan,
} from '../features/purchases/revenueCatIdentity';
import { INSTALL_ID_KEY } from './installId';

const KEYCHAIN_OPTIONS = {
  // Available after the first unlock even while the phone is locked, and still
  // excluded from migrations to another device through an encrypted backup.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
} as const;

// RevenueCat iOS 5.x stores the identity it will recover when configure omits
// appUserID under this UserDefaults key. Reading it is migration-only: it lets
// an upgraded install be distinguished from a truly fresh install before the
// SDK is configured. The app-level markers below remain a fallback if the SDK
// changes this implementation detail in a later version.
const REVENUECAT_CACHED_APP_USER_ID_KEY = 'com.revenuecat.userdefaults.appUserID.new';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function logIdentityError(event: string, error?: unknown): void {
  console.error(
    `[RC identity] ${event}`,
    ...(error === undefined ? [] : [errorMessage(error)]),
  );
}

function createUuid(): string {
  const direct = globalThis.crypto?.randomUUID?.();
  if (direct) return direct;

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Hermes versions without Web Crypto still need an RFC 4122-shaped random
    // value. No device property or account data is used.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function hasLegacyInstall(): Promise<boolean> {
  const cachedRevenueCatId = Settings.get(REVENUECAT_CACHED_APP_USER_ID_KEY);
  if (typeof cachedRevenueCatId === 'string' && cachedRevenueCatId.length > 0) return true;
  const [installId, onboarding] = await Promise.all([
    SecureStore.getItemAsync(INSTALL_ID_KEY),
    AsyncStorage.getItem(ONBOARDING_KEY),
  ]);
  return installId !== null || onboarding !== null;
}

export function prepareStoredRevenueCatIdentity(): Promise<RevenueCatIdentityPlan> {
  return prepareRevenueCatIdentity({
    readValue: key => SecureStore.getItemAsync(key),
    writeValue: (key, value) => SecureStore.setItemAsync(key, value, KEYCHAIN_OPTIONS),
    hasLegacyInstall,
    createUuid,
    logError: logIdentityError,
  });
}

export function completeStoredRevenueCatIdentityMigration(
  plan: RevenueCatIdentityPlan,
): Promise<boolean> {
  return finishRevenueCatIdentityMigration(plan, {
    getAppUserID: () => Purchases.getAppUserID(),
    logIn: appUserID => Purchases.logIn(appUserID),
    deleteValue: key => SecureStore.deleteItemAsync(key),
    logError: logIdentityError,
  });
}

/** Reads the already-created identity; it never generates a replacement. */
export async function getStoredRevenueCatDeviceId(): Promise<string | null> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await SecureStore.getItemAsync(REVENUECAT_DEVICE_ID_KEY);
    } catch (error) {
      lastError = error;
    }
  }
  logIdentityError('keychain_read_failed_after_retry', lastError);
  return null;
}
