import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type PurchasesOfferings,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  THEME_OFFERING_ID,
  THEME_PRODUCTS,
  themeProductRefs,
  type ThemeStoreProduct,
} from '../features/themes/themeProducts';
import { describeRevenueCatKey } from '../lib/purchases';

/**
 * Prices and ownership for individually purchasable themes.
 *
 * Separate from `useSubscription` because the two answer different questions
 * and must not affect one another: nothing here reads or writes a plan
 * entitlement, and nothing here can change a plan. Its failures are silent by
 * design — a shop with no prices is a worse shop, but a shop showing a made-up
 * price is a broken one.
 *
 * iOS only, like the rest of purchasing in this app. Android and web resolve to
 * empty maps, so every theme shows no price, cannot be bought, and stays
 * subscription-gated exactly as before.
 *
 * ORDERING. RevenueCat must be configured before any lookup, and
 * `useSubscription` owns that. `subscriptionLoaded` is the signal that it has
 * finished, so this hook does nothing until then rather than duplicating the
 * configure logic or racing it.
 */

export interface ThemePurchasesState {
  /** Localized packages from the theme offering, keyed by package id. */
  products: ReadonlyMap<string, ThemeStoreProduct>;
  /** Entitlement ids currently active on this account. */
  ownedEntitlementIds: ReadonlySet<string>;
  /**
   * RevenueCat has answered about ownership at least once.
   *
   * Load-bearing: until this is true the app does not know what is owned, and
   * must not act on the empty set. The theme enforcement in App reads it before
   * resetting anything, so a purchased theme is never reset during launch.
   */
  ownershipLoaded: boolean;
  /** The theme currently being bought, or null. Blocks a second attempt. */
  purchasingThemeId: string | null;
  /**
   * Buy one theme.
   *
   * Resolves `'purchased'` once the receipt confirms it, `'cancelled'` when the
   * user backed out — which is not an error and must not be shown as one — and
   * `'unavailable'` when the theme has no package to sell or one is already in
   * flight. Rejects only on a genuine store failure, which the caller reports.
   */
  purchaseTheme(themeId: string): Promise<'purchased' | 'cancelled' | 'unavailable'>;
}

const EMPTY_PRODUCTS: ReadonlyMap<string, ThemeStoreProduct> = new Map();
const EMPTY_OWNED: ReadonlySet<string> = new Set();

function isCancelled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const purchaseError = error as Partial<PurchasesError>;
  return purchaseError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
    || purchaseError.userCancelled === true;
}

/**
 * Active entitlements, from the receipt RevenueCat validated.
 *
 * Includes `basic` and `premium` too, which is harmless: a plan entitlement id
 * can never match a theme's, so it cannot mark a theme owned. Themes are
 * Non-Consumable, so their entitlements do not expire and stay in `active`.
 */
function ownedFromCustomerInfo(info: CustomerInfo): ReadonlySet<string> {
  return new Set(Object.keys(info.entitlements.active ?? {}));
}

function toThemeProduct(pkg: PurchasesPackage): ThemeStoreProduct {
  // Keyed by package id, because that is what the shop resolves a theme to.
  return { identifier: pkg.identifier, priceString: pkg.product.priceString };
}


/**
 * Everything needed to explain a missing price, printed once per launch in dev.
 *
 * A theme with no price is silent by design — the shop simply draws nothing —
 * so without this there is no way to tell an unconfigured product from a Test
 * Store key from a propagation delay. Stripped from release builds by `__DEV__`.
 *
 * Identifiers only. No key, no receipt, no user data.
 */
/** The SDK error's own fields, without assuming it is a `PurchasesError`. */
function describeSdkError(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return { value: String(error) };
  const sdkError = error as Partial<PurchasesError> & Partial<Error>;
  return {
    name: sdkError.name,
    message: sdkError.message,
    code: sdkError.code,
    readableErrorCode: sdkError.readableErrorCode,
    underlyingErrorMessage: sdkError.underlyingErrorMessage,
    userInfo: sdkError.userInfo,
  };
}

function logOfferingDiagnostics(
  offerings: PurchasesOfferings | null,
  error: unknown,
): void {
  if (!__DEV__) return;

  const key = describeRevenueCatKey();
  const expected = Object.entries(THEME_PRODUCTS);

  if (error !== null || offerings === null) {
    console.warn('[themes] offering lookup FAILED', {
      ...key,
      // The SDK's own error, in full: `code` and `readableErrorCode` are what
      // separate a configuration fault from a network one, and RevenueCat puts
      // the useful detail in `underlyingErrorMessage`.
      error: describeSdkError(error),
    });
    return;
  }

  const offeringIds = Object.keys(offerings.all);
  const themeOffering = offerings.all[THEME_OFFERING_ID] ?? null;
  const packages = themeOffering?.availablePackages ?? [];

  const returnedPackageIds = packages.map(pkg => pkg.identifier);
  const returnedProductIds = packages.map(pkg => pkg.product.identifier);
  const duplicatePackageIds = returnedPackageIds
    .filter((id, index) => returnedPackageIds.indexOf(id) !== index);

  const missing = expected
    .filter(([, refs]) => !returnedPackageIds.includes(refs.packageId))
    .map(([themeId, refs]) => `${themeId} → ${refs.packageId} (${refs.productId})`);
  const unexpected = returnedPackageIds
    .filter(id => !expected.some(([, refs]) => refs.packageId === id));

  console.info('[themes] offering diagnostics', {
    revenueCat: key,
    // `test-store` here with App Store products configured is the answer on its
    // own: the Test Store has its own catalogue and cannot serve them.
    storeMismatchLikely: key.store === 'test-store',
    offeringIdsReturned: offeringIds,
    themeOfferingFound: themeOffering !== null,
    packageCount: packages.length,
    expectedPackageCount: expected.length,
    packages: packages.map(pkg => ({
      packageId: pkg.identifier,
      productId: pkg.product.identifier,
      priceString: pkg.product.priceString,
    })),
    returnedProductIds,
    expectedProductIds: expected.map(([, refs]) => refs.productId),
    productIdMismatches: returnedProductIds.filter(
      id => !expected.some(([, refs]) => refs.productId === id),
    ),
    missingPackages: missing,
    unexpectedPackages: unexpected,
    duplicatePackageIds,
    // A package that resolved but carries no price is an App Store metadata
    // problem — missing price tier, or not yet propagated — not a mapping one.
    packagesWithoutPrice: packages
      .filter(pkg => (pkg.product.priceString ?? '').trim() === '')
      .map(pkg => pkg.identifier),
  });
}

export function useThemePurchases(subscriptionLoaded: boolean): ThemePurchasesState {
  const [products, setProducts] = useState<ReadonlyMap<string, ThemeStoreProduct>>(EMPTY_PRODUCTS);
  const [ownedEntitlementIds, setOwned] = useState<ReadonlySet<string>>(EMPTY_OWNED);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const [purchasingThemeId, setPurchasingThemeId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  /** Live packages, kept so a purchase uses the object the store returned. */
  const packagesRef = useRef<Map<string, PurchasesPackage>>(new Map());
  /** Synchronous duplicate guard: state updates too late to block a fast retap. */
  const purchaseInFlight = useRef(false);

  useEffect(() => {
    if (!subscriptionLoaded) return;
    if (Platform.OS !== 'ios') {
      // Nothing is purchasable here, but ownership *is* known: it is empty.
      // Saying so lets the enforcement proceed instead of waiting forever.
      setOwnershipLoaded(true);
      return;
    }

    let active = true;
    let listener: ((info: CustomerInfo) => void) | null = null;

    (async () => {
      try {
        // By id, never `offerings.current`: the current offering is whichever
        // one the dashboard marks default, which is the subscription offering
        // here. Asking for the themes by name means a dashboard change to the
        // default cannot silently empty the shop.
        const offerings = await Purchases.getOfferings();
        const themeOffering = offerings.all[THEME_OFFERING_ID];
        if (!active) return;

        logOfferingDiagnostics(offerings, null);

        if (!themeOffering) {
          // Diagnostics above already named every offering that did come back.
        } else {
          packagesRef.current = new Map(
            themeOffering.availablePackages.map(pkg => [pkg.identifier, pkg]),
          );
          setProducts(new Map(
            themeOffering.availablePackages.map(pkg => [pkg.identifier, toThemeProduct(pkg)]),
          ));
        }
      } catch (error) {
        // Leave `products` empty: every theme then reads as `unavailable`, which
        // hides the price and disables buying — the correct answer to "unknown".
        logOfferingDiagnostics(null, error);
      }

      try {
        const info = await Purchases.getCustomerInfo();
        if (active) setOwned(ownedFromCustomerInfo(info));
      } catch {
        // Ownership unknown stays "not owned", so a paid theme remains locked
        // rather than being handed out on a failed lookup.
      }
      // Marked loaded either way: a failed lookup is still an answer, and
      // blocking the enforcement forever would be worse than a cautious reset.
      if (active) setOwnershipLoaded(true);

      if (!active) return;
      // Ownership follows a purchase made anywhere — a Restore, another device,
      // or a family share — so it tracks the same listener the subscription
      // uses rather than being read once at launch.
      listener = (info: CustomerInfo) => {
        if (active) setOwned(ownedFromCustomerInfo(info));
      };
      Purchases.addCustomerInfoUpdateListener(listener);
    })();

    return () => {
      active = false;
      if (listener) Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [subscriptionLoaded]);

  const purchaseTheme = useCallback(async (
    themeId: string,
  ): Promise<'purchased' | 'cancelled' | 'unavailable'> => {
    if (Platform.OS !== 'ios') return 'unavailable';
    // Checked against a ref rather than state: two taps in the same frame would
    // both see the old state and both open a purchase sheet.
    if (purchaseInFlight.current) return 'unavailable';

    const refs = themeProductRefs(themeId);
    const pkg = refs && packagesRef.current.get(refs.packageId);
    if (!refs || !pkg) return 'unavailable';

    purchaseInFlight.current = true;
    setPurchasingThemeId(themeId);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (mounted.current) setOwned(ownedFromCustomerInfo(customerInfo));
      // Ownership is taken from the returned receipt, not assumed from the call
      // returning: what unlocks the theme is what RevenueCat confirmed.
      return customerInfo.entitlements.active?.[refs.entitlementId] ? 'purchased' : 'unavailable';
    } catch (error) {
      // Backing out of the App Store sheet is an ordinary outcome, not a failure.
      if (isCancelled(error)) return 'cancelled';
      throw error;
    } finally {
      purchaseInFlight.current = false;
      if (mounted.current) setPurchasingThemeId(null);
    }
  }, []);

  return { products, ownedEntitlementIds, ownershipLoaded, purchasingThemeId, purchaseTheme };
}
