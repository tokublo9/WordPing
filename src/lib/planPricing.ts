/**
 * Subscription prices, as the App Store returns them.
 *
 * WHAT THIS REPLACED. `lib/pricing.ts` held a hand-written table mapping a JPY
 * "tier" to roughly thirty currencies, and the paywall rendered
 * `formatPrice(320)` / `formatPrice(600)`. That table was a guess at Apple's
 * price matrix maintained by hand, it could not follow a price change in App
 * Store Connect, and it had already drifted: the paywall said ¥320 while the
 * `subscribe_price` translation said ¥450. Its own header said to replace it
 * with the store's localized string.
 *
 * Every price shown now comes from `StoreProduct.priceString`, which StoreKit
 * has already formatted for the account's storefront — correct symbol,
 * separators and placement in every region, and correct the moment Apple and
 * RevenueCat caches refresh, with no app update.
 *
 * WHEN THE PRODUCT IS MISSING, no price is shown. There is deliberately no
 * fallback: a wrong price on a purchase button is worse than no price, and an
 * unconfigured product is indistinguishable from a temporarily unreachable one.
 *
 * Pure module — no react-native, no RevenueCat import — so the rules are tested
 * directly.
 */

/** The plans sold as subscriptions. Themes are separate; see themeProducts.ts. */
export type SubscriptionPlanId = 'basic' | 'premium';

/**
 * Package identifiers as configured in the RevenueCat dashboard.
 *
 * The same identifiers `useSubscription` purchases by, deliberately: displaying
 * a price resolved from one package while buying another is exactly how a
 * paywall ends up quoting a price it does not charge.
 */
export const PLAN_PACKAGE_IDS: Readonly<Record<SubscriptionPlanId, string>> = {
  basic: 'basic',
  premium: 'premium',
};

/** The App Store products those packages must be attached to. */
export const PLAN_PRODUCT_IDS: Readonly<Record<SubscriptionPlanId, string>> = {
  basic: 'com.wordping.basic.monthly',
  premium: 'com.wordping.premium.monthly',
};

/** What the store returned for one plan. Nothing here is computed by the app. */
export interface PlanStoreProduct {
  packageId: string;
  productId: string;
  /** e.g. "¥320", "$2.99" — already formatted for the account's storefront. */
  priceString: string;
  /** ISO 4217, straight from the product. Never inferred from the device. */
  currencyCode: string | null;
  /** e.g. "P1M". The subscription period as the store describes it. */
  period: string | null;
}

export type PlanPriceDisplay =
  /** A real, localized price from the store. */
  | { state: 'priced'; priceString: string }
  /** Not configured, not loaded, or the lookup failed. Show no price. */
  | { state: 'unavailable' };

export type PlanStoreProducts = Readonly<Partial<Record<SubscriptionPlanId, PlanStoreProduct>>>;

/**
 * The price to show for a plan.
 *
 * A product with a blank `priceString` is treated as absent rather than
 * rendered as an empty gap in a button.
 */
export function resolvePlanPrice(
  products: PlanStoreProducts,
  plan: SubscriptionPlanId,
): PlanPriceDisplay {
  const product = products[plan];
  if (!product || product.priceString.trim() === '') return { state: 'unavailable' };
  return { state: 'priced', priceString: product.priceString };
}

/**
 * Why a plan's price is missing, in terms of what to go and check.
 *
 * Returns null when the product resolved. Diagnostic only — never user-facing.
 */
export function describePlanPriceProblem(
  products: PlanStoreProducts,
  plan: SubscriptionPlanId,
  returnedPackageIds: readonly string[],
): string | null {
  const product = products[plan];
  if (product && product.priceString.trim() !== '') return null;

  const expectedPackage = PLAN_PACKAGE_IDS[plan];
  const expectedProduct = PLAN_PRODUCT_IDS[plan];

  if (returnedPackageIds.length === 0) {
    return 'the current offering returned no packages at all — check that an '
      + 'offering is marked current in RevenueCat and has products attached';
  }
  if (!returnedPackageIds.includes(expectedPackage)) {
    return `no package "${expectedPackage}" in the current offering (returned: `
      + `${returnedPackageIds.join(', ')}) — check the package identifier in `
      + 'RevenueCat, including the built-in $rc_monthly naming';
  }
  if (product && product.productId !== expectedProduct) {
    return `package "${expectedPackage}" is attached to "${product.productId}", `
      + `expected "${expectedProduct}" — check the product attached to that package`;
  }
  return `package "${expectedPackage}" resolved but carries no price — check that `
    + `"${expectedProduct}" has a price and is Ready to Submit in App Store `
    + 'Connect, and that the Paid Apps Agreement is active';
}
