import assert from 'node:assert/strict';
import test from 'node:test';
import {
  finishRevenueCatIdentityMigration,
  prepareRevenueCatIdentity,
  REVENUECAT_DEVICE_ID_KEY,
  REVENUECAT_IDENTITY_MIGRATION_KEY,
} from '../../src/features/purchases/revenueCatIdentity';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

function preparationHarness(initial: Record<string, string> = {}, legacy = false) {
  const values = new Map(Object.entries(initial));
  const events: string[] = [];
  const writes: Array<{ key: string; value: string }> = [];
  let generated = 0;
  let legacyChecks = 0;
  return {
    values,
    events,
    writes,
    generated: () => generated,
    legacyChecks: () => legacyChecks,
    dependencies: {
      readValue: async (key: string) => values.get(key) ?? null,
      writeValue: async (key: string, value: string) => {
        writes.push({ key, value });
        values.set(key, value);
      },
      hasLegacyInstall: async () => { legacyChecks += 1; return legacy; },
      createUuid: () => { generated += 1; return UUID; },
      logError: (event: string) => { events.push(event); },
    },
  };
}

test('fresh install stores a UUID and configures RevenueCat with it', async () => {
  const harness = preparationHarness();
  const plan = await prepareRevenueCatIdentity(harness.dependencies);

  assert.deepEqual(plan, { kind: 'custom', appUserID: UUID });
  assert.equal(harness.values.get(REVENUECAT_DEVICE_ID_KEY), UUID);
  assert.equal(harness.values.has(REVENUECAT_IDENTITY_MIGRATION_KEY), false);
  assert.equal(harness.generated(), 1);
  assert.deepEqual(harness.writes, [{ key: REVENUECAT_DEVICE_ID_KEY, value: UUID }]);
});

test('an existing Keychain UUID is rewritten unchanged and reused', async () => {
  const harness = preparationHarness({ [REVENUECAT_DEVICE_ID_KEY]: UUID });
  const plan = await prepareRevenueCatIdentity(harness.dependencies);

  assert.deepEqual(plan, { kind: 'custom', appUserID: UUID });
  assert.equal(harness.generated(), 0);
  assert.deepEqual(harness.writes, [{ key: REVENUECAT_DEVICE_ID_KEY, value: UUID }]);
});

test('a failed Keychain read is retried and never silently creates an ID', async () => {
  const harness = preparationHarness();
  let reads = 0;
  harness.dependencies.readValue = async () => {
    reads += 1;
    throw new Error('keychain_locked');
  };

  const plan = await prepareRevenueCatIdentity(harness.dependencies);

  assert.deepEqual(plan, { kind: 'anonymous-fallback' });
  assert.equal(reads, 2);
  assert.equal(harness.generated(), 0);
  assert.equal(harness.legacyChecks(), 0);
  assert.deepEqual(harness.writes, []);
  assert.equal(harness.values.size, 0);
  assert.deepEqual(harness.events, ['keychain_read_failed_after_retry']);

  let logins = 0;
  await finishRevenueCatIdentityMigration(plan, {
    getAppUserID: async () => '$RCAnonymousID:existing',
    logIn: async () => { logins += 1; },
    deleteValue: async () => {},
    logError: event => { harness.events.push(event); },
  });
  assert.equal(logins, 0, 'a read error must not enter anonymous migration');
});

test('a rewrite failure keeps using the UUID that was read', async () => {
  const harness = preparationHarness({ [REVENUECAT_DEVICE_ID_KEY]: UUID });
  harness.dependencies.writeValue = async () => { throw new Error('interaction_not_allowed'); };

  const plan = await prepareRevenueCatIdentity(harness.dependencies);

  assert.deepEqual(plan, { kind: 'custom', appUserID: UUID });
  assert.equal(harness.generated(), 0);
  assert.deepEqual(harness.events, ['keychain_accessibility_upgrade_failed']);
});

test('an existing anonymous install is stored then aliased to the UUID', async () => {
  const harness = preparationHarness({}, true);
  const plan = await prepareRevenueCatIdentity(harness.dependencies);
  const logins: string[] = [];

  assert.deepEqual(plan, { kind: 'migrate-anonymous', appUserID: UUID });
  assert.equal(harness.values.get(REVENUECAT_IDENTITY_MIGRATION_KEY), '1');
  const migrated = await finishRevenueCatIdentityMigration(plan, {
    getAppUserID: async () => '$RCAnonymousID:existing',
    logIn: async appUserID => { logins.push(appUserID); },
    deleteValue: async key => { harness.values.delete(key); },
    logError: event => { harness.events.push(event); },
  });

  assert.equal(migrated, true);
  assert.deepEqual(logins, [UUID]);
  assert.equal(harness.values.has(REVENUECAT_IDENTITY_MIGRATION_KEY), false);
});

test('migration logIn failure preserves the UUID and retries next launch', async () => {
  const harness = preparationHarness({}, true);
  const firstPlan = await prepareRevenueCatIdentity(harness.dependencies);
  let attempts = 0;
  const firstResult = await finishRevenueCatIdentityMigration(firstPlan, {
    getAppUserID: async () => '$RCAnonymousID:existing',
    logIn: async () => { attempts += 1; throw new Error('offline'); },
    deleteValue: async key => { harness.values.delete(key); },
    logError: event => { harness.events.push(event); },
  });

  assert.equal(firstResult, false);
  assert.equal(harness.values.get(REVENUECAT_DEVICE_ID_KEY), UUID);
  assert.equal(harness.values.get(REVENUECAT_IDENTITY_MIGRATION_KEY), '1');

  const secondPlan = await prepareRevenueCatIdentity(harness.dependencies);
  const secondResult = await finishRevenueCatIdentityMigration(secondPlan, {
    getAppUserID: async () => '$RCAnonymousID:existing',
    logIn: async () => { attempts += 1; },
    deleteValue: async key => { harness.values.delete(key); },
    logError: event => { harness.events.push(event); },
  });

  assert.equal(harness.generated(), 1);
  assert.equal(attempts, 2);
  assert.equal(secondResult, true);
  assert.equal(harness.values.has(REVENUECAT_IDENTITY_MIGRATION_KEY), false);
});
