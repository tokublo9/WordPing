/**
 * Ordering guard for CustomerInfo snapshots.
 *
 * Two independent sources write the plan: the fresh read taken after a purchase
 * or restore, and RevenueCat's customerInfoUpdateListener, which fires whenever
 * the SDK decides. Neither is guaranteed to arrive in the order it was produced,
 * and the plan write was previously unconditional — so a listener callback
 * carrying a pre-upgrade snapshot could land after the post-purchase read and
 * silently downgrade a Premium customer back to Basic.
 *
 * `CustomerInfo.requestDate` is the server timestamp of the snapshot, which
 * makes it the right thing to order by: it reflects when RevenueCat computed the
 * entitlements, not when the device happened to receive them.
 *
 * Pure — no react-native import — so the race is unit-tested rather than
 * reproduced by hand against a sandbox account.
 */

/** Milliseconds for a `requestDate`, or null when it is missing or unparsable. */
export function parseRequestDate(requestDate: unknown): number | null {
  if (typeof requestDate !== 'string') return null;
  const parsed = Date.parse(requestDate);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Whether an incoming snapshot is new enough to apply.
 *
 * Fails open in both unknown cases. A snapshot with no usable timestamp is
 * applied rather than dropped, because refusing it would leave the plan stuck at
 * whatever was last applied with no way to recover — a far worse failure than
 * briefly applying an out-of-order update.
 *
 * Equal timestamps apply: re-delivering the same snapshot is harmless, and it
 * avoids discarding a legitimate second update issued in the same second.
 */
export function shouldApplyCustomerInfo(
  incomingRequestDate: unknown,
  lastAppliedMs: number | null,
): boolean {
  if (lastAppliedMs === null) return true;
  const incoming = parseRequestDate(incomingRequestDate);
  if (incoming === null) return true;
  return incoming >= lastAppliedMs;
}
