import * as SecureStore from 'expo-secure-store';
import { createId } from '../utils/createId';

/**
 * A random identifier for this installation.
 *
 * Generated once, on first use, and kept in the system keychain. It is not an
 * advertising identifier and is not derived from any device property — it is a
 * random UUID with no meaning outside this app, and reinstalling produces a new
 * one.
 *
 * IT IS NOT AUTHENTICATION. It travels in a request header that anyone can set,
 * so the server treats it purely as a rate-limit bucket key and never as proof
 * of anything. Entitlement decisions are made from RevenueCat, verified
 * server-side. See cloudflare/wordping-api/src/identity.ts.
 */

const INSTALL_ID_KEY = 'wordping.install_id';

let cached: Promise<string> | null = null;

async function readOrCreate(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
    if (existing !== null && existing.length >= 8) return existing;
  } catch {
    // Keychain unavailable (rare, but possible on a locked device during
    // background work). Fall through and generate a value for this session so
    // an AI request still works; the next successful read will persist one.
  }

  const created = createId('inst');
  try {
    await SecureStore.setItemAsync(INSTALL_ID_KEY, created, {
      // Only needed while the app is in use, and deliberately not synced to
      // other devices — each install gets its own rate-limit bucket.
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  } catch {
    // Non-fatal: an unpersisted id still spreads load, it just resets on relaunch.
  }
  return created;
}

/** Resolves the installation id, creating and storing it exactly once. */
export function getInstallId(): Promise<string> {
  cached ??= readOrCreate().catch(error => {
    cached = null;
    throw error;
  });
  return cached;
}

/** Test hook. */
export function resetInstallIdCache(): void {
  cached = null;
}
