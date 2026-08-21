/**
 * Who may back up and restore.
 *
 * Backup is a Premium feature: Free and Basic stay locked. The
 * decision lives here rather than inline in the component so it can be unit
 * tested against every entitlement state, and so the UI and the action handlers
 * are provably asking the same question.
 *
 * The single source of truth is the RevenueCat entitlement state surfaced by
 * useSubscription. There is deliberately no separate local flag: a second
 * source could drift, and a stale local "yes" would hand out a paid feature.
 */

export type Plan = 'free' | 'basic' | 'premium';

/** The lowest plan that unlocks backup. */
export const BACKUP_MIN_PLAN: Plan = 'premium';

/** Where a locked tap came from, for the subscription screen's context. */
export const BACKUP_PAYWALL_SOURCE = 'backup';

export function planUnlocksBackup(plan: Plan): boolean {
  return plan === 'premium';
}

export interface BackupAccessInput {
  /** `plan === 'premium'` from useSubscription. */
  isPremium: boolean;
  /**
   * False until RevenueCat has answered — at launch, during a restore, and
   * while an offline cached entitlement is being refreshed.
   */
  isSubscriptionLoaded: boolean;
}

export type BackupAccess = 'allowed' | 'locked';

/**
 * Resolves access, defaulting closed.
 *
 * An unresolved entitlement counts as locked. That is the deliberate direction:
 * a brief lock during launch or a restore is a small annoyance, whereas opening
 * a paid feature on an unknown plan is a revenue bug, and an expired
 * subscription must lock again the moment RevenueCat says so.
 */
export function resolveBackupAccess({
  isPremium,
  isSubscriptionLoaded,
}: BackupAccessInput): BackupAccess {
  return isSubscriptionLoaded && isPremium ? 'allowed' : 'locked';
}

export function canUseBackup(input: BackupAccessInput): boolean {
  return resolveBackupAccess(input) === 'allowed';
}
