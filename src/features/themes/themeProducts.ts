/**
 * Individual theme purchases: which App Store product a theme is sold as, and
 * what the shop should show for it.
 *
 * WHY THE PRICE IS NEVER A NUMBER IN THIS APP. `ShopItem.price` is an integer
 * used as a flag — zero means free, anything above zero means paid — and it
 * carries no currency. Showing it would print the same digits to a shopper in
 * Tokyo and one in Toronto. Every price a user sees comes from
 * `StoreProduct.priceString`, which StoreKit has already formatted in that
 * account's currency and locale.
 *
 * WHAT HAPPENS WHEN A PRODUCT IS MISSING. Nothing is displayed. A theme with no
 * configured identifier, a product StoreKit has not returned yet, and a failed
 * lookup all resolve to `unavailable`, and the shop draws no price line at all.
 * There is deliberately no fallback: a wrong price is worse than no price, and
 * an unconfigured product is indistinguishable from a temporarily unreachable
 * one from here.
 *
 * Pure module — no react-native, no expo, no RevenueCat import — so every rule
 * below is unit-tested directly.
 */

import { resolveThemeAccess, type ThemeAccessState } from './themeAccess';

/** The three identifiers one theme is sold under, all set in the dashboard. */
export interface ThemeProductRefs {
  /** App Store Connect product. Non-Consumable. */
  productId: string;
  /** Package inside the `theme_store` offering. */
  packageId: string;
  /** Entitlement granted by that product. Ownership is read from this. */
  entitlementId: string;
}

/** The offering the theme packages live in. Fetched by id, never as "current". */
export const THEME_OFFERING_ID = 'theme_store';

/**
 * Theme id → its App Store product, RevenueCat package, and entitlement.
 *
 * Keyed by the theme ids this app already uses, which do not all match the
 * product names: `skin_paw` is the theme called "Animal" and is sold as
 * `…theme.animals`, `skin_leaf_blur` is "Nature", `shop_woods` is "Beautiful
 * Woods", `skin_snow` is "Snow Mountain", and `solid_sky` is "Sky Blue".
 *
 * WRITTEN OUT IN FULL, NEVER DERIVED. A rule that stripped prefixes and
 * underscores would produce `skinpaw` for the theme sold as `animals`, and
 * would break silently the next time a theme is added whose name does not
 * transform cleanly. The three identifiers are also not derived from each other
 * here, even though they share a suffix today: they are three separate strings
 * in the dashboard, and any of them could be corrected there without the other
 * two moving.
 *
 * Every paid theme has an entry; the two free themes (`solid_blue`,
 * `solid_gray`) have none and never show a price.
 */
export const THEME_PRODUCTS: Readonly<Record<string, ThemeProductRefs>> = {
  skin_paw:        { productId: 'com.wordping.theme.animals', packageId: 'theme_animals', entitlementId: 'theme_animals' },  // "Animal"
  skin_aurora:     { productId: 'com.wordping.theme.aurora', packageId: 'theme_aurora', entitlementId: 'theme_aurora' },
  shop_woods:      { productId: 'com.wordping.theme.beautifulwoods', packageId: 'theme_beautifulwoods', entitlementId: 'theme_beautifulwoods' },  // "Beautiful Woods"
  solid_beige:     { productId: 'com.wordping.theme.beige', packageId: 'theme_beige', entitlementId: 'theme_beige' },
  skin_cyber:      { productId: 'com.wordping.theme.cyberneon', packageId: 'theme_cyberneon', entitlementId: 'theme_cyberneon' },  // "Cyber Neon"
  skin_deep_sea:   { productId: 'com.wordping.theme.deepsea', packageId: 'theme_deepsea', entitlementId: 'theme_deepsea' },  // "Deep Sea"
  skin_galaxy:     { productId: 'com.wordping.theme.galaxy', packageId: 'theme_galaxy', entitlementId: 'theme_galaxy' },
  solid_green:     { productId: 'com.wordping.theme.green', packageId: 'theme_green', entitlementId: 'theme_green' },
  solid_mint:      { productId: 'com.wordping.theme.mint', packageId: 'theme_mint', entitlementId: 'theme_mint' },
  skin_leaf_blur:  { productId: 'com.wordping.theme.nature', packageId: 'theme_nature', entitlementId: 'theme_nature' },  // "Nature"
  skin_night_city: { productId: 'com.wordping.theme.nightcity', packageId: 'theme_nightcity', entitlementId: 'theme_nightcity' },  // "Night City"
  solid_orange:    { productId: 'com.wordping.theme.orange', packageId: 'theme_orange', entitlementId: 'theme_orange' },
  solid_pink:      { productId: 'com.wordping.theme.pink', packageId: 'theme_pink', entitlementId: 'theme_pink' },
  solid_purple:    { productId: 'com.wordping.theme.purple', packageId: 'theme_purple', entitlementId: 'theme_purple' },
  skin_rain:       { productId: 'com.wordping.theme.rain', packageId: 'theme_rain', entitlementId: 'theme_rain' },
  solid_red:       { productId: 'com.wordping.theme.red', packageId: 'theme_red', entitlementId: 'theme_red' },
  shop_roses:      { productId: 'com.wordping.theme.roses', packageId: 'theme_roses', entitlementId: 'theme_roses' },
  skin_sakura:     { productId: 'com.wordping.theme.sakura', packageId: 'theme_sakura', entitlementId: 'theme_sakura' },
  solid_sky:       { productId: 'com.wordping.theme.skyblue', packageId: 'theme_skyblue', entitlementId: 'theme_skyblue' },  // "Sky Blue"
  skin_snow:       { productId: 'com.wordping.theme.snowmountain', packageId: 'theme_snowmountain', entitlementId: 'theme_snowmountain' },  // "Snow Mountain"
  skin_sunset:     { productId: 'com.wordping.theme.sunset', packageId: 'theme_sunset', entitlementId: 'theme_sunset' },
  solid_teal:      { productId: 'com.wordping.theme.teal', packageId: 'theme_teal', entitlementId: 'theme_teal' },
  solid_yellow:    { productId: 'com.wordping.theme.yellow', packageId: 'theme_yellow', entitlementId: 'theme_yellow' },
};

/** Theme id → App Store product identifier, for lookups keyed by product. */
export const THEME_PRODUCT_IDS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(THEME_PRODUCTS).map(([themeId, refs]) => [themeId, refs.productId]),
);

/** The identifiers a theme is sold under, or undefined when it is not sold. */
export function themeProductRefs(themeId: string): ThemeProductRefs | undefined {
  return THEME_PRODUCTS[themeId];
}

/** Every package id the app should look for inside the theme offering. */
export function allThemePackageIds(): string[] {
  return [...new Set(Object.values(THEME_PRODUCTS).map(refs => refs.packageId))];
}

/** The localized price StoreKit returned. Never assembled by this app. */
export interface ThemeStoreProduct {
  identifier: string;
  /** e.g. "¥480", "$3.99" — already formatted for the account's storefront. */
  priceString: string;
}

export type ThemePriceDisplay =
  /** Free for everyone; no price line. */
  | { state: 'free' }
  /** Bought outright. Shown instead of the price, on every plan. */
  | { state: 'owned' }
  /**
   * Covered by an active Basic or Premium subscription.
   *
   * Distinct from `owned` on purpose: this access lasts as long as the
   * subscription does, so nothing here may be recorded as a purchase. What it
   * means for the UI is that there is nothing to sell — and therefore no price
   * to print and no Buy button to offer.
   */
  | { state: 'included' }
  /** A real, localized price from StoreKit. */
  | { state: 'priced'; priceString: string }
  /** Not sold, not loaded, or the lookup failed. Draw nothing, sell nothing. */
  | { state: 'unavailable' };

export interface ThemePriceInput {
  themeId: string;
  /** The shop's flag value. Zero means free for everyone. */
  price: number;
  /** Packages resolved from the theme offering, keyed by package id. */
  products: ReadonlyMap<string, ThemeStoreProduct>;
  /** Entitlement ids currently active on this account. */
  ownedEntitlementIds: ReadonlySet<string>;
  /** An active Basic or Premium subscription is in effect. */
  isSubscribed: boolean;
  /** False until RevenueCat has answered. */
  isSubscriptionLoaded: boolean;
  /**
   * The temporary Simulator recording override, already resolved against
   * `__DEV__`. Absent means off — see `src/dev/themeAccessOverride.ts`.
   */
  devUnlockOverride?: boolean;
}

/**
 * What to draw under a theme's name.
 *
 * Ownership is checked before everything else so a bought theme never shows a
 * price it would be wrong to charge again, and keeps saying "owned" on every
 * plan. A subscriber is deliberately not "owned": their access comes from the
 * subscription and ends with it, so it resolves to `included` — same silence
 * about price, different fact, and nothing that could be mistaken for a
 * permanent purchase.
 *
 * The subscription half of this is not decided here. It is delegated to
 * `resolveThemeAccess`, the module that owns "who may use which theme", so the
 * shop cannot draw a price for a theme the very same data says is unlocked.
 * That disagreement is exactly the bug this replaced: the access lookup knew
 * about the plan and the price lookup did not.
 */
export function resolveThemePrice({
  themeId,
  price,
  products,
  ownedEntitlementIds,
  isSubscribed,
  isSubscriptionLoaded,
  devUnlockOverride = false,
}: ThemePriceInput): ThemePriceDisplay {
  return resolveThemePriceForProduct({
    price,
    refs: themeProductRefs(themeId),
    products,
    ownedEntitlementIds,
    isSubscribed,
    isSubscriptionLoaded,
    devUnlockOverride,
  });
}

/**
 * The display rule itself, given identifiers rather than a theme.
 *
 * Split out so the rule can be exercised for any configured theme without
 * depending on which ids happen to be in the registry.
 */
export function resolveThemePriceForProduct({
  price,
  refs,
  products,
  ownedEntitlementIds,
  isSubscribed,
  isSubscriptionLoaded,
  devUnlockOverride = false,
}: {
  price: number;
  refs: ThemeProductRefs | undefined;
  products: ReadonlyMap<string, ThemeStoreProduct>;
  ownedEntitlementIds: ReadonlySet<string>;
  isSubscribed: boolean;
  isSubscriptionLoaded: boolean;
  devUnlockOverride?: boolean;
}): ThemePriceDisplay {
  if (price <= 0) return { state: 'free' };
  if (refs === undefined) return { state: 'unavailable' };

  const ownedIndividually = ownedEntitlementIds.has(refs.entitlementId);
  // Permanent and plan-independent, so it is answered first and without waiting
  // for an entitlement lookup — the same order `resolveThemeAccess` uses.
  if (ownedIndividually) return { state: 'owned' };

  const access = resolveThemeAccess({
    price, isSubscribed, isSubscriptionLoaded, ownedIndividually, devUnlockOverride,
  });
  // Both non-purchase unlocks print the same line and offer no Buy button: in
  // each case there is nothing to sell right now. They stay separate reasons so
  // the override cannot be read anywhere as a subscription the user holds.
  if (access.state === 'unlocked' && (access.reason === 'subscription' || access.reason === 'dev-override')) {
    return { state: 'included' };
  }

  // RevenueCat has not answered yet. Saying nothing costs a Free user a price
  // for a moment; saying a price costs a subscriber the sight of one that is
  // about to vanish, which is the flicker this avoids. Fail closed, the same
  // way access does.
  if (!isSubscriptionLoaded) return { state: 'unavailable' };

  const product = products.get(refs.packageId);
  // A package with no usable priceString is treated as absent rather than
  // rendered as an empty line under the name — and cannot be purchased.
  if (!product || product.priceString.trim() === '') return { state: 'unavailable' };

  return { state: 'priced', priceString: product.priceString };
}

/** Access and price for one theme, decided together from one set of facts. */
export interface ThemeStatus {
  access: ThemeAccessState;
  price: ThemePriceDisplay;
}

/**
 * The shop's single entry point: both answers, from one set of inputs.
 *
 * Every surface that draws a theme needs to know two things — may this person
 * use it, and what should be printed under its name — and the two must agree.
 * Resolving them in one call is what makes "unlocked by the subscription" and
 * "priced" impossible to render at the same time, however many labels the shop
 * grows. Callers pass facts, not conclusions.
 */
export function resolveThemeStatus({
  themeId,
  price,
  products,
  ownedEntitlementIds,
  isSubscribed,
  isSubscriptionLoaded,
  devUnlockOverride = false,
}: ThemePriceInput): ThemeStatus {
  return {
    access: resolveThemeAccess({
      price,
      isSubscribed,
      isSubscriptionLoaded,
      ownedIndividually: isThemeOwnedIndividually(themeId, ownedEntitlementIds),
      devUnlockOverride,
    }),
    price: resolveThemePrice({
      themeId, price, products, ownedEntitlementIds, isSubscribed, isSubscriptionLoaded,
      devUnlockOverride,
    }),
  };
}

/**
 * Whether this theme is owned outright, for the access rule.
 *
 * Read from the RevenueCat entitlement rather than the purchased-product list:
 * the entitlement is what the dashboard grants, so a product replaced or
 * re-pointed there keeps working without a new app build.
 */
export function isThemeOwnedIndividually(
  themeId: string,
  ownedEntitlementIds: ReadonlySet<string>,
): boolean {
  const refs = themeProductRefs(themeId);
  return refs !== undefined && ownedEntitlementIds.has(refs.entitlementId);
}
