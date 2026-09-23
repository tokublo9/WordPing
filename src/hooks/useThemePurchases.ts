import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesError,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  THEME_OFFERING_ID,
  THEME_PRODUCTS,
  allThemePackageIds,
  themeProductRefs,
  type ThemeStoreProduct,
} from '../features/themes/themeProducts';

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
   * The store answered and returned nothing sellable.
   *
   * Distinct from "still loading": until the lookup finishes this is false and
   * the shop shows nothing, exactly as before. Once it is true the shop can say
   * so and offer a retry, instead of silently becoming a subscription upsell —
   * which is what an unconfigured offering used to look like, to users and to
   * App Review alike.
   */
  productsUnavailable: boolean;
  /** Re-runs the lookup. The shop calls this when it opens and on Retry. */
  reloadProducts(): void;
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

export function useThemePurchases(subscriptionLoaded: boolean): ThemePurchasesState {
  const [products, setProducts] = useState<ReadonlyMap<string, ThemeStoreProduct>>(EMPTY_PRODUCTS);
  const [ownedEntitlementIds, setOwned] = useState<ReadonlySet<string>>(EMPTY_OWNED);
  const [ownershipLoaded, setOwnershipLoaded] = useState(false);
  const [purchasingThemeId, setPurchasingThemeId] = useState<string | null>(null);
  const [productsUnavailable, setProductsUnavailable] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /** Re-runs the effect below. Cheap: it is one getOfferings call. */
  const reloadProducts = useCallback(() => setReloadToken(token => token + 1), []);

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
      let resolved: Map<string, ThemeStoreProduct> = new Map();
      try {
        // By id, never `offerings.current`: the current offering is whichever
        // one the dashboard marks default, which is the subscription offering
        // here. Asking for the themes by name means a dashboard change to the
        // default cannot silently empty the shop.
        const offerings = await Purchases.getOfferings();
        const themeOffering = offerings.all[THEME_OFFERING_ID];
        if (!active) return;

        if (themeOffering && themeOffering.availablePackages.length > 0) {
          packagesRef.current = new Map(
            themeOffering.availablePackages.map(pkg => [pkg.identifier, pkg]),
          );
          resolved = new Map(
            themeOffering.availablePackages.map(pkg => [pkg.identifier, toThemeProduct(pkg)]),
          );
        } else {
          // The loudest failure this hook has, and the one that actually
          // shipped: an absent offering used to fall through the `if` with no
          // log at all, so a shop with no prices was indistinguishable from a
          // shop nobody had configured. App Review read it as "the products are
          // not in the binary". Names only — no key, no receipt, no user data.
          console.error(
            `[themes] offering "${THEME_OFFERING_ID}" is missing or empty.`,
            {
              offeringsSeen: Object.keys(offerings.all),
              packagesExpected: allThemePackageIds(),
              packagesReceived: themeOffering?.availablePackages.map(p => p.identifier) ?? [],
            },
          );
        }
      } catch (error) {
        // A thrown lookup is a different fault from an empty one: `code` and
        // `readableErrorCode` separate a configuration problem from a network one.
        console.error('[themes] offering lookup failed', describeSdkError(error));
      }

      // Fallback: ask for the products directly.
      //
      // The offering is a dashboard construct that App Store Connect knows
      // nothing about, so it is the one part of this chain that can be wrong
      // while every product is correctly configured and approved. Asking
      // StoreKit for the identifiers we already hold routes around it — the
      // shop can then price and sell a theme even if its package was never
      // attached to an offering.
      //
      // Buying still needs a PurchasesPackage, which only the offering supplies,
      // so this path prices the shop and reports honestly rather than pretending
      // a purchase is possible. That is why the flag below is `.size === 0` on
      // the *packages*, not on the prices.
      if (active && resolved.size === 0) {
        try {
          const wanted = Object.values(THEME_PRODUCTS);
          const storeProducts = await Purchases.getProducts(wanted.map(refs => refs.productId));
          if (!active) return;
          const byProductId = new Map(storeProducts.map(product => [product.identifier, product]));
          for (const refs of wanted) {
            const product = byProductId.get(refs.productId);
            if (product) {
              resolved.set(refs.packageId, {
                identifier: refs.packageId,
                priceString: product.priceString,
              });
            }
          }
          if (resolved.size > 0) {
            console.error(
              `[themes] recovered ${resolved.size} price(s) via getProducts. `
              + `The "${THEME_OFFERING_ID}" offering needs fixing in RevenueCat: `
              + 'prices show, but buying needs a package and cannot work until it is.',
            );
          } else {
            console.error(
              '[themes] getProducts returned nothing either. The products are not '
              + 'reachable from StoreKit — check App Store Connect status, pricing, '
              + 'and the Paid Applications agreement.',
            );
          }
        } catch (error) {
          console.error('[themes] getProducts fallback failed', describeSdkError(error));
        }
      }

      if (!active) return;
      setProducts(resolved);
      // Reported on the packages, not the prices: without a package there is
      // nothing to hand to purchasePackage, so the shop must not offer a Buy.
      setProductsUnavailable(packagesRef.current.size === 0);

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
  }, [subscriptionLoaded, reloadToken]);

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

  return {
    products, ownedEntitlementIds, ownershipLoaded, purchasingThemeId,
    productsUnavailable, reloadProducts, purchaseTheme,
  };
}
