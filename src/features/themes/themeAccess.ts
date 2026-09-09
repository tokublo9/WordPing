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
  /**
   * Usable now.
   *
   * `dev-override` is the temporary Simulator recording switch and is reachable
   * only from a development build — see `src/dev/themeAccessOverride.ts`. It is
   * a distinct reason rather than a fourth way to say `subscription`, so that
   * nothing downstream can mistake it for a plan the user actually holds.
   */
  | { state: 'unlocked'; reason: 'free' | 'purchased' | 'subscription' | 'dev-override' }
  /** Paid, and the caller has no active subscription. Opens the Upgrade sheet. */
  | { state: 'locked' };

/**
 * Whether the temporary theme-unlock override applies to this launch.
 *
 * TEMPORARY. Both terms are required, and `isDev` is passed in rather than read
 * from `__DEV__` here: this module is compiled by the test project, where that
 * bundler constant does not exist, and taking it as an argument is what lets a
 * test *prove* that a release build cannot unlock anything. The same shape as
 * `resolveRevenueCatApiKey`, for the same reason.
 */
export function isThemeUnlockOverrideEnabled(isDev: boolean, forceUnlockAllThemes: boolean): boolean {
  return isDev === true && forceUnlockAllThemes === true;
}

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
  /**
   * The already-resolved temporary override — `__DEV__ && FORCE_UNLOCK_ALL_THEMES`.
   *
   * A resolved boolean rather than the raw flag, so this module never has to
   * know what `__DEV__` is. Absent means off, which is what every existing
   * caller gets and what a release build always gets.
   */
  devUnlockOverride?: boolean;
}

export function resolveThemeAccess({
  price,
  isSubscribed,
  isSubscriptionLoaded,
  ownedIndividually = false,
  devUnlockOverride = false,
}: ThemeAccessInput): ThemeAccessState {
  if (price <= 0) return { state: 'unlocked', reason: 'free' };
  // Ownership is permanent, so it is answered before the subscription and
  // without waiting for one: a theme someone paid for outright must not lock
  // itself while an entitlement lookup is in flight, or when it later fails.
  if (ownedIndividually) return { state: 'unlocked', reason: 'purchased' };
  if (isSubscriptionLoaded && isSubscribed) return { state: 'unlocked', reason: 'subscription' };
  // Last, so it can only ever turn `locked` into unlocked. A real purchase and
  // a real subscription keep reporting themselves, which is what stops the
  // override from disguising either one while it is on.
  if (devUnlockOverride) return { state: 'unlocked', reason: 'dev-override' };
  return { state: 'locked' };
}

export function isThemeUnlocked(input: ThemeAccessInput): boolean {
  return resolveThemeAccess(input).state === 'unlocked';
}
