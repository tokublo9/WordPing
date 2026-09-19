import type { PlanStoreProducts } from './planPricing';

/**
 * The disclosure follows the user's Japanese commerce context, not the app's
 * display language. Device region covers a Japanese device before offerings
 * load; JPY covers a Japanese App Store storefront even when the UI is English.
 */
export function shouldShowJapanCommerceDisclosure(
  deviceRegionCode: string | null | undefined,
  products: PlanStoreProducts,
): boolean {
  if (deviceRegionCode?.toUpperCase() === 'JP') return true;
  return Object.values(products).some(
    product => product?.currencyCode?.toUpperCase() === 'JPY',
  );
}
