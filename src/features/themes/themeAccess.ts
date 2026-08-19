/**
 * Who may use which theme.
 *
 * Themes are not sold individually. A paid theme is unlocked by an active
 * Basic or Premium subscription and by nothing else — there is no per-theme
 * product, no ownership record, and nothing read from AsyncStorage or SQLite.
 *
 * The subscription flag always originates from RevenueCat via
 * `useSubscription`. Until it has answered, `isSubscriptionLoaded` is false and
 * every paid theme stays locked: failing closed here means a slow or failed
 * entitlement lookup can never hand out a paid theme.
 *
 * Pure module, so every access rule is unit-tested rather than inferred.
 */

export type ThemeAccessState =
  /** Usable now: free for everyone, or included in the active plan. */
  | { state: 'unlocked'; reason: 'free' | 'subscription' }
  /** Paid, and the caller has no active subscription. Opens the Upgrade sheet. */
  | { state: 'locked' };

export interface ThemeAccessInput {
  /** Price in the shop data. Zero means the theme is free for everyone. */
  price: number;
  /** Whether an active Basic or Premium subscription is in effect. */
  isSubscribed: boolean;
  /** False until RevenueCat has answered. Treated as not subscribed. */
  isSubscriptionLoaded: boolean;
}

export function resolveThemeAccess({
  price,
  isSubscribed,
  isSubscriptionLoaded,
}: ThemeAccessInput): ThemeAccessState {
  if (price <= 0) return { state: 'unlocked', reason: 'free' };
  if (isSubscriptionLoaded && isSubscribed) return { state: 'unlocked', reason: 'subscription' };
  return { state: 'locked' };
}

export function isThemeUnlocked(input: ThemeAccessInput): boolean {
  return resolveThemeAccess(input).state === 'unlocked';
}
