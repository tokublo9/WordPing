import type { TranslationKey } from '../../i18n';
import type { PlanTier } from '../../lib/planLimits';

/**
 * What a purchase or a restore actually did, and what to say about it.
 *
 * One contract, resolved once by `useSubscription` and rendered once by App, so
 * no screen has to infer an outcome from a spinner stopping. Before this, both
 * operations recorded their failures in a `error` state that nothing read: a
 * failed purchase, a failed restore, and a restore that found nothing were all
 * indistinguishable from success — the spinner simply stopped. That is also the
 * shape App Review looks for when it taps Restore Purchases on a fresh account.
 *
 * `cancelled` is an outcome, not a failure. Backing out of the App Store sheet
 * is an ordinary choice and gets no message at all, which is why the message
 * helpers below return `null` for it rather than a "cancelled" string.
 *
 * Pure — `TranslationKey` is imported as a type only, so nothing here pulls in
 * React or react-native and every mapping can be asserted directly.
 */

/** The two plans that can be bought. `free` is never a purchase result. */
export type PaidPlan = Extract<PlanTier, 'basic' | 'premium'>;

export type PurchaseOutcome =
  | { kind: 'purchased'; plan: PaidPlan }
  /** The user dismissed the App Store sheet. Silent by design. */
  | { kind: 'cancelled' }
  /** The package is missing from the offering — a configuration problem. */
  | { kind: 'unavailable' }
  /** Another purchase or restore holds the exclusive slot. */
  | { kind: 'busy' }
  | { kind: 'failed' };

export type RestoreOutcome =
  | { kind: 'restored'; plan: PaidPlan }
  /**
   * No subscription, but at least one theme bought outright came back.
   *
   * Separate from `restored` because the plan copy names a subscription, and
   * this account has none — saying it would be a false statement. Separate from
   * `nothing_found` because something genuinely was restored.
   */
  | { kind: 'restored_themes' }
  /** The receipt is valid and carries no active paid entitlement at all. */
  | { kind: 'nothing_found' }
  | { kind: 'cancelled' }
  | { kind: 'busy' }
  | { kind: 'failed' };

export interface OutcomeMessage {
  titleKey: TranslationKey;
  /**
   * Optional, because one outcome has no sentence that is true of it.
   *
   * A theme-only restore cannot borrow `restore_done_body` ("Your subscription
   * is active on this device") and has no body string of its own — adding one
   * would mean an entry in all twenty locale dictionaries, which the English
   * and Japanese only rule defers. The title alone ("Purchases Restored") is
   * accurate, already translated everywhere, and far better than the
   * "no purchases found" this replaces.
   */
  bodyKey?: TranslationKey;
}

/**
 * A verified plan, turned into a restore result.
 *
 * WHAT COUNTS AS "RESTORED". Any active paid entitlement after the restore
 * completes, including one the device already had. Telling a Premium subscriber
 * "no purchases found" because nothing changed would be the exact confusion the
 * button exists to clear up — a user taps Restore because they believe they own
 * something and want the app to agree. So this reports what the receipt says is
 * active, not what changed.
 *
 * The caller must pass a plan derived from a freshly fetched `CustomerInfo`,
 * never from client state, or this would confirm a subscription from a stale
 * snapshot.
 */
export function restoreOutcomeForPlan(
  plan: PlanTier,
  restoredAnyTheme = false,
): RestoreOutcome {
  if (plan !== 'free') return { kind: 'restored', plan };
  return restoredAnyTheme ? { kind: 'restored_themes' } : { kind: 'nothing_found' };
}

/** `null` means say nothing: the user cancelled and knows they did. */
export function purchaseOutcomeMessage(outcome: PurchaseOutcome): OutcomeMessage | null {
  switch (outcome.kind) {
    case 'cancelled':
      return null;
    case 'purchased':
      return {
        titleKey: 'purchase_done_title',
        bodyKey: outcome.plan === 'premium' ? 'purchase_done_premium' : 'purchase_done_basic',
      };
    case 'unavailable':
      return { titleKey: 'purchase_error_title', bodyKey: 'purchase_unavailable_body' };
    case 'busy':
      return { titleKey: 'purchase_error_title', bodyKey: 'purchase_busy_body' };
    case 'failed':
      return { titleKey: 'purchase_error_title', bodyKey: 'purchase_failed_body' };
  }
}

export function restoreOutcomeMessage(outcome: RestoreOutcome): OutcomeMessage | null {
  switch (outcome.kind) {
    case 'cancelled':
      return null;
    case 'restored':
      return { titleKey: 'restore_done_title', bodyKey: 'restore_done_body' };
    case 'restored_themes':
      // Title only — see the note on OutcomeMessage.bodyKey.
      return { titleKey: 'restore_done_title' };
    case 'nothing_found':
      return { titleKey: 'restore_purchases', bodyKey: 'restore_none_body' };
    case 'busy':
      return { titleKey: 'restore_purchases', bodyKey: 'purchase_busy_body' };
    case 'failed':
      return { titleKey: 'restore_purchases', bodyKey: 'restore_failed_body' };
  }
}
