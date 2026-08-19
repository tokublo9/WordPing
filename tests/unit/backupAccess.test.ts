import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BACKUP_MIN_PLAN,
  BACKUP_PAYWALL_SOURCE,
  canUseBackup,
  planUnlocksBackup,
  resolveBackupAccess,
  type Plan,
} from '../../src/features/backup/backupAccess';

/**
 * Backup is a paid feature. These cover every entitlement state the app can be
 * in, including the ones that are easy to get wrong: still loading, expired,
 * and mid-restore.
 */

/** How useSubscription derives isSubscribed. */
function subscribedFor(plan: Plan): boolean {
  return plan !== 'free';
}

test('Free cannot use backup', () => {
  const access = resolveBackupAccess({ isSubscribed: subscribedFor('free'), isSubscriptionLoaded: true });
  assert.equal(access, 'locked');
  assert.equal(planUnlocksBackup('free'), false);
});

test('Basic can export and import', () => {
  assert.equal(planUnlocksBackup('basic'), true);
  assert.equal(canUseBackup({ isSubscribed: subscribedFor('basic'), isSubscriptionLoaded: true }), true);
});

test('Premium can export and import', () => {
  assert.equal(planUnlocksBackup('premium'), true);
  assert.equal(canUseBackup({ isSubscribed: subscribedFor('premium'), isSubscriptionLoaded: true }), true);
});

test('backup stays locked while the entitlement is still loading', () => {
  // True at launch, and again while a restore or an offline cache refresh is in
  // flight. Opening a paid feature on an unknown plan is a revenue bug.
  for (const plan of ['free', 'basic', 'premium'] as const) {
    assert.equal(
      canUseBackup({ isSubscribed: subscribedFor(plan), isSubscriptionLoaded: false }),
      false,
      `${plan} must stay locked until RevenueCat answers`,
    );
  }
});

test('backup locks again when a subscription expires', () => {
  // useSubscription drops plan to 'free' once the entitlement lapses.
  const active = canUseBackup({ isSubscribed: true, isSubscriptionLoaded: true });
  const expired = canUseBackup({ isSubscribed: false, isSubscriptionLoaded: true });
  assert.equal(active, true);
  assert.equal(expired, false);
});

test('a restored purchase unlocks backup once the entitlement resolves', () => {
  const duringRestore = canUseBackup({ isSubscribed: false, isSubscriptionLoaded: false });
  const afterRestore = canUseBackup({ isSubscribed: true, isSubscriptionLoaded: true });
  assert.equal(duringRestore, false);
  assert.equal(afterRestore, true);
});

test('entitlement failure leaves backup inaccessible', () => {
  // useSubscription catches an init failure, stays on 'free' and sets isLoaded,
  // so a RevenueCat outage must resolve to locked rather than open.
  assert.equal(canUseBackup({ isSubscribed: false, isSubscriptionLoaded: true }), false);
});

test('access defaults closed across every input combination', () => {
  for (const isSubscribed of [true, false]) {
    for (const isSubscriptionLoaded of [true, false]) {
      const allowed = canUseBackup({ isSubscribed, isSubscriptionLoaded });
      assert.equal(allowed, isSubscribed && isSubscriptionLoaded);
    }
  }
});

test('the minimum plan and paywall source are the documented values', () => {
  assert.equal(BACKUP_MIN_PLAN, 'basic');
  assert.equal(BACKUP_PAYWALL_SOURCE, 'backup');
});
