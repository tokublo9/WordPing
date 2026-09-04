/**
 * Who may use which theme.
 *
 * A paid theme is unlocked two ways, and they are not the same thing. An
 * active Basic or Premium subscription unlocks every paid theme for as long as
 * it lasts. Buying a theme outright unlocks that one theme permanently, and
 * survives the subscription ending.
 *
 * Both flags originate from RevenueCat. The subscription comes from
 * `useSubscription`; ownership comes from the receipt-backed product list in
 * `useThemePurchases`, which reads the RevenueCat entitlement — never from
 * AsyncStorage or SQLite, which would be a claim the device makes about
 * itself.
 *
 * Until RevenueCat has answered, `isSubscriptionLoaded` is false and a paid
 * theme stays locked unless it is owned: failing closed means a slow or failed
 * entitlement lookup can never hand out a subscription-only theme. Ownership
 * needs no such gate, because an unloaded `ownedIndividually` is simply false.
 *
 * Pure module, so every access rule is unit-tested rather than inferred.
 */

export type ThemeAccessState =
  /** Usable now: free for everyone, bought outright, or in the active plan. */
  | { state: 'unlocked'; reason: 'free' | 'purchased' | 'subscription' }
  /** Paid, and the caller has no active subscription. Opens the Upgrade sheet. */
  | { state: 'locked' };

export interface ThemeAccessInput {
  /** Price in the shop data. Zero means the theme is free for everyone. */
  price: number;
  /** Whether an active Basic or Premium subscription is in effect. */
  isSubscribed: boolean;
  /** False until RevenueCat has answered. Treated as not subscribed. */
  isSubscriptionLoaded: boolean;
  /**
   * This exact theme was bought outright, per the RevenueCat receipt.
   *
   * Optional so every existing caller keeps its previous behaviour unchanged:
   * absent means "not owned", which is what the rule assumed before themes
   * could be bought at all.
   */
  ownedIndividually?: boolean;
}

export function resolveThemeAccess({
  price,
  isSubscribed,
  isSubscriptionLoaded,
  ownedIndividually = false,
}: ThemeAccessInput): ThemeAccessState {
  if (price <= 0) return { state: 'unlocked', reason: 'free' };
  // Ownership is permanent, so it is answered before the subscription and
  // without waiting for one: a theme someone paid for outright must not lock
  // itself while an entitlement lookup is in flight, or when it later fails.
  if (ownedIndividually) return { state: 'unlocked', reason: 'purchased' };
  if (isSubscriptionLoaded && isSubscribed) return { state: 'unlocked', reason: 'subscription' };
  return { state: 'locked' };
}

export function isThemeUnlocked(input: ThemeAccessInput): boolean {
  return resolveThemeAccess(input).state === 'unlocked';
}
