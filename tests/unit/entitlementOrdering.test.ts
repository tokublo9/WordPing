import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRequestDate, shouldApplyCustomerInfo } from '../../src/lib/entitlementOrdering';

/**
 * The bug these pin: purchasing Premium over an active Basic produced a fresh
 * snapshot saying premium, and then RevenueCat's update listener delivered an
 * older snapshot still saying basic. The plan write was unconditional, so the
 * older one landed last and the customer kept seeing Basic.
 */

const PRE_UPGRADE = '2026-08-22T04:00:00.000Z';
const POST_UPGRADE = '2026-08-22T04:00:05.000Z';

/** Applies a snapshot the way the hook does, so ordering is exercised end to end. */
function applySequence(
  snapshots: readonly { requestDate: unknown; plan: string }[],
): { plan: string | null; lastAppliedMs: number | null } {
  let plan: string | null = null;
  let lastAppliedMs: number | null = null;
  for (const snapshot of snapshots) {
    if (!shouldApplyCustomerInfo(snapshot.requestDate, lastAppliedMs)) continue;
    const applied = parseRequestDate(snapshot.requestDate);
    if (applied !== null) lastAppliedMs = applied;
    plan = snapshot.plan;
  }
  return { plan, lastAppliedMs };
}

test('the reported race: a stale listener snapshot cannot undo a completed upgrade', () => {
  const result = applySequence([
    // The post-purchase read lands first and is correct.
    { requestDate: POST_UPGRADE, plan: 'premium' },
    // The listener then delivers a snapshot produced before the upgrade.
    { requestDate: PRE_UPGRADE, plan: 'basic' },
  ]);
  assert.equal(result.plan, 'premium', 'an older snapshot must not downgrade the plan');
});

test('a genuinely newer snapshot is still applied, including a downgrade', () => {
  // Expiry and cancellation have to get through; this is an ordering guard, not
  // a ratchet that only ever moves the plan upwards.
  const result = applySequence([
    { requestDate: PRE_UPGRADE, plan: 'premium' },
    { requestDate: POST_UPGRADE, plan: 'free' },
  ]);
  assert.equal(result.plan, 'free');
});

test('a snapshot with the same timestamp is applied rather than dropped', () => {
  const result = applySequence([
    { requestDate: POST_UPGRADE, plan: 'basic' },
    { requestDate: POST_UPGRADE, plan: 'premium' },
  ]);
  assert.equal(result.plan, 'premium');
});

test('the first snapshot is always applied, whatever its timestamp', () => {
  assert.equal(shouldApplyCustomerInfo(PRE_UPGRADE, null), true);
  assert.equal(shouldApplyCustomerInfo(undefined, null), true);
});

test('an unusable timestamp fails open instead of freezing the plan', () => {
  // Refusing these would leave the plan stuck at the last applied value with no
  // route back, which is worse than applying one update out of order.
  for (const requestDate of [undefined, null, '', 'not-a-date', 42, {}]) {
    assert.equal(
      shouldApplyCustomerInfo(requestDate, Date.parse(POST_UPGRADE)),
      true,
      `${String(requestDate)} should be applied, not dropped`,
    );
  }
});

test('an undated snapshot does not pin the guard and block later updates', () => {
  const result = applySequence([
    { requestDate: POST_UPGRADE, plan: 'premium' },
    { requestDate: 'not-a-date', plan: 'basic' },
    // Still newer than the last *usable* timestamp, so it must get through.
    { requestDate: '2026-08-22T04:00:09.000Z', plan: 'premium' },
  ]);
  assert.equal(result.plan, 'premium');
  assert.equal(result.lastAppliedMs, Date.parse('2026-08-22T04:00:09.000Z'));
});

test('clearing the guard lets a new user with an older timestamp through', () => {
  // What resetEntitlementOrdering() does on logout. The next customer's snapshots
  // are on their own timeline and can predate the previous customer's.
  const lastAppliedMs = Date.parse(POST_UPGRADE);
  assert.equal(shouldApplyCustomerInfo(PRE_UPGRADE, lastAppliedMs), false);
  assert.equal(shouldApplyCustomerInfo(PRE_UPGRADE, null), true);
});

test('requestDate parsing accepts ISO-8601 and rejects everything else', () => {
  assert.equal(parseRequestDate(POST_UPGRADE), Date.parse(POST_UPGRADE));
  for (const value of [undefined, null, '', 'not-a-date', 42, {}, []]) {
    assert.equal(parseRequestDate(value), null, `${String(value)} should not parse`);
  }
});
