export const REVENUECAT_DEVICE_ID_KEY = 'wordping.revenuecat_device_id.v1';
export const REVENUECAT_IDENTITY_MIGRATION_KEY = 'wordping.revenuecat_identity_migration.v1';

export type RevenueCatIdentityPlan =
  | { kind: 'custom'; appUserID: string }
  | { kind: 'migrate-anonymous'; appUserID: string }
  | { kind: 'anonymous-fallback' };

interface IdentityPreparationDependencies {
  readValue(key: string): Promise<string | null>;
  writeValue(key: string, value: string): Promise<void>;
  hasLegacyInstall(): Promise<boolean>;
  createUuid(): string;
  logError(event: string, error?: unknown): void;
}

interface IdentityMigrationDependencies {
  getAppUserID(): Promise<string>;
  logIn(appUserID: string): Promise<unknown>;
  deleteValue(key: string): Promise<void>;
  logError(event: string, error?: unknown): void;
}

type ReadResult =
  | { ok: true; value: string | null }
  | { ok: false };

async function readWithRetry(
  dependencies: IdentityPreparationDependencies,
  key: string,
): Promise<ReadResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return { ok: true, value: await dependencies.readValue(key) };
    } catch (error) {
      lastError = error;
    }
  }
  dependencies.logError('keychain_read_failed_after_retry', lastError);
  return { ok: false };
}

function validStoredId(value: string | null): value is string {
  return value !== null
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function persistIdentity(
  dependencies: IdentityPreparationDependencies,
  appUserID: string,
  migration: boolean,
): Promise<boolean> {
  try {
    // The marker is written first. If the process stops between these writes,
    // the next launch still knows it must recover the old anonymous identity
    // before identifying the SDK with a newly generated UUID.
    if (migration) {
      await dependencies.writeValue(REVENUECAT_IDENTITY_MIGRATION_KEY, '1');
    }
    await dependencies.writeValue(REVENUECAT_DEVICE_ID_KEY, appUserID);
    return true;
  } catch (error) {
    dependencies.logError('keychain_write_failed', error);
    return false;
  }
}

/**
 * Chooses how RevenueCat must be configured without importing a native module.
 *
 * A legacy install is configured anonymously for one launch so the SDK can
 * recover its cached `$RCAnonymousID` before `logIn` aliases it to the new UUID.
 * Every other successful path configures directly with the stable UUID.
 */
export async function prepareRevenueCatIdentity(
  dependencies: IdentityPreparationDependencies,
): Promise<RevenueCatIdentityPlan> {
  const stored = await readWithRetry(dependencies, REVENUECAT_DEVICE_ID_KEY);
  if (!stored.ok) return { kind: 'anonymous-fallback' };

  if (stored.value !== null && !validStoredId(stored.value)) {
    dependencies.logError('stored_device_id_invalid');
    return { kind: 'anonymous-fallback' };
  }

  if (validStoredId(stored.value)) {
    // Rewriting the same item upgrades UUIDs created by older builds from
    // WHEN_UNLOCKED_THIS_DEVICE_ONLY. It is safe to repeat, never deletes the
    // old value first, and a failed rewrite must not discard the identity that
    // was just read successfully.
    try {
      await dependencies.writeValue(REVENUECAT_DEVICE_ID_KEY, stored.value);
    } catch (error) {
      dependencies.logError('keychain_accessibility_upgrade_failed', error);
    }
  }

  const pending = await readWithRetry(dependencies, REVENUECAT_IDENTITY_MIGRATION_KEY);
  if (!pending.ok) return { kind: 'anonymous-fallback' };

  if (validStoredId(stored.value)) {
    return pending.value === '1'
      ? { kind: 'migrate-anonymous', appUserID: stored.value }
      : { kind: 'custom', appUserID: stored.value };
  }

  let legacyInstall: boolean;
  try {
    legacyInstall = pending.value === '1' || await dependencies.hasLegacyInstall();
  } catch (error) {
    // If legacy detection itself is unavailable, preserving the SDK's current
    // identity is safer than minting a second ledger.
    dependencies.logError('legacy_install_check_failed', error);
    return { kind: 'anonymous-fallback' };
  }

  const appUserID = dependencies.createUuid();
  if (!await persistIdentity(dependencies, appUserID, legacyInstall)) {
    return { kind: 'anonymous-fallback' };
  }
  return legacyInstall
    ? { kind: 'migrate-anonymous', appUserID }
    : { kind: 'custom', appUserID };
}

export function isRevenueCatAnonymousId(appUserID: string): boolean {
  return appUserID.startsWith('$RCAnonymousID:');
}

/** Completes a legacy anonymous-to-custom alias without changing identity on failure. */
export async function finishRevenueCatIdentityMigration(
  plan: RevenueCatIdentityPlan,
  dependencies: IdentityMigrationDependencies,
): Promise<boolean> {
  if (plan.kind !== 'migrate-anonymous') return true;

  let currentAppUserID: string;
  try {
    currentAppUserID = await dependencies.getAppUserID();
  } catch (error) {
    dependencies.logError('migration_current_identity_read_failed', error);
    return false;
  }

  if (currentAppUserID !== plan.appUserID) {
    if (!isRevenueCatAnonymousId(currentAppUserID)) {
      // Logging in from one identified user to another does not merge them.
      // Keep the current subscriber rather than risking purchases or its ledger.
      dependencies.logError('migration_found_unexpected_identified_user');
      return false;
    }
    try {
      await dependencies.logIn(plan.appUserID);
    } catch (error) {
      // The UUID and pending marker remain. The next app launch configures the
      // cached anonymous user again and retries this alias operation.
      dependencies.logError('migration_login_failed', error);
      return false;
    }
  }

  try {
    await dependencies.deleteValue(REVENUECAT_IDENTITY_MIGRATION_KEY);
  } catch (error) {
    // Identity is already correct. Keeping the marker merely repeats this safe
    // check on the next launch; it never generates a replacement UUID.
    dependencies.logError('migration_marker_clear_failed', error);
  }
  return true;
}
