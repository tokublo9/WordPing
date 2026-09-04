import assert from 'node:assert/strict';
import test from 'node:test';

import {
  THEME_OFFERING_ID,
  THEME_PRODUCTS,
  allThemePackageIds,
  isThemeOwnedIndividually,
  resolveThemePrice,
  resolveThemePriceForProduct,
  themeProductRefs,
  type ThemeProductRefs,
  type ThemeStoreProduct,
} from '../../src/features/themes/themeProducts';

/**
 * The rules these exist for: every price a user sees is one StoreKit formatted,
 * ownership is an entitlement rather than a guess, and anything unresolved
 * shows nothing and sells nothing.
 */

const REFS: ThemeProductRefs = {
  productId: 'com.wordping.theme.aurora',
  packageId: 'theme_aurora',
  entitlementId: 'theme_aurora',
};
const NO_PRODUCTS: ReadonlyMap<string, ThemeStoreProduct> = new Map();
const NOBODY: ReadonlySet<string> = new Set();

/** Keyed by package id, which is what the shop resolves a theme through. */
function withPackage(priceString: string): ReadonlyMap<string, ThemeStoreProduct> {
  return new Map([[REFS.packageId, { identifier: REFS.packageId, priceString }]]);
}

test('a free theme never shows a price', () => {
  assert.deepEqual(
    resolveThemePriceForProduct({
      price: 0, refs: undefined, products: NO_PRODUCTS, ownedEntitlementIds: NOBODY,
    }),
    { state: 'free' },
  );
});

test('the localized string is passed through exactly, in any currency', () => {
  for (const priceString of ['¥480', '$3.99', '3,99 €', 'R$ 19,90', '₩5,500']) {
    assert.deepEqual(
      resolveThemePriceForProduct({
        price: 480, refs: REFS, products: withPackage(priceString), ownedEntitlementIds: NOBODY,
      }),
      { state: 'priced', priceString },
      'the app must not reformat or re-symbol what StoreKit returned',
    );
  }
});

test('an owned theme shows ownership instead of a price', () => {
  assert.deepEqual(
    resolveThemePriceForProduct({
      price: 480,
      refs: REFS,
      products: withPackage('¥480'),
      ownedEntitlementIds: new Set([REFS.entitlementId]),
    }),
    { state: 'owned' },
    'never re-price something already bought',
  );
});

test('nothing is shown, and nothing is sellable, when the package is unresolved', () => {
  const cases: {
    label: string;
    refs: ThemeProductRefs | undefined;
    products: ReadonlyMap<string, ThemeStoreProduct>;
  }[] = [
    { label: 'not sold at all', refs: undefined, products: NO_PRODUCTS },
    { label: 'offering returned nothing', refs: REFS, products: NO_PRODUCTS },
    { label: 'blank price string', refs: REFS, products: withPackage('') },
    { label: 'whitespace price string', refs: REFS, products: withPackage('   ') },
  ];
  for (const { label, refs, products } of cases) {
    assert.deepEqual(
      resolveThemePriceForProduct({ price: 480, refs, products, ownedEntitlementIds: NOBODY }),
      { state: 'unavailable' },
      label,
    );
  }
});

test('the shop integer never reaches the screen', () => {
  // 480 is a paid/free flag with no currency attached. `unavailable` carries no
  // value at all, which is what guarantees it cannot be rendered as a price.
  const display = resolveThemePriceForProduct({
    price: 480, refs: REFS, products: NO_PRODUCTS, ownedEntitlementIds: NOBODY,
  });
  assert.equal(JSON.stringify(display).includes('480'), false);
});

test('a real theme resolves through the registry', () => {
  const refs = themeProductRefs('skin_aurora');
  assert.deepEqual(refs, {
    productId: 'com.wordping.theme.aurora',
    packageId: 'theme_aurora',
    entitlementId: 'theme_aurora',
  });
  assert.deepEqual(
    resolveThemePrice({
      themeId: 'skin_aurora',
      price: 480,
      products: new Map([[refs!.packageId, { identifier: refs!.packageId, priceString: '¥480' }]]),
      ownedEntitlementIds: NOBODY,
    }),
    { state: 'priced', priceString: '¥480' },
  );
});

test('the theme named "Animal" is sold as the animals product', () => {
  // The one mapping that cannot be derived: the theme id, the display name and
  // the product suffix all differ.
  assert.deepEqual(themeProductRefs('skin_paw'), {
    productId: 'com.wordping.theme.animals',
    packageId: 'theme_animals',
    entitlementId: 'theme_animals',
  });
  // The other four whose ids do not resemble their products.
  assert.equal(themeProductRefs('shop_woods')?.productId, 'com.wordping.theme.beautifulwoods');
  assert.equal(themeProductRefs('skin_leaf_blur')?.productId, 'com.wordping.theme.nature');
  assert.equal(themeProductRefs('skin_snow')?.productId, 'com.wordping.theme.snowmountain');
  assert.equal(themeProductRefs('solid_sky')?.productId, 'com.wordping.theme.skyblue');
});

test('the registry covers all 23 paid themes, with no identifier reused', () => {
  const entries = Object.values(THEME_PRODUCTS);
  assert.equal(entries.length, 23);
  assert.equal(THEME_OFFERING_ID, 'theme_store');

  for (const key of ['productId', 'packageId', 'entitlementId'] as const) {
    const values = entries.map(refs => refs[key]);
    for (const value of values) assert.match(value, /\S/u);
    // Two themes sharing any identifier would let buying one unlock the other.
    assert.equal(new Set(values).size, values.length, `${key} is reused`);
  }
  assert.deepEqual(allThemePackageIds(), entries.map(refs => refs.packageId));

  // The free themes are deliberately absent — they are never sold.
  assert.equal(themeProductRefs('solid_blue'), undefined);
  assert.equal(themeProductRefs('solid_gray'), undefined);
});

test('every identifier matches the shape configured in the dashboard', () => {
  for (const [themeId, refs] of Object.entries(THEME_PRODUCTS)) {
    assert.match(refs.productId, /^com\.wordping\.theme\.[a-z]+$/u, themeId);
    assert.match(refs.packageId, /^theme_[a-z]+$/u, themeId);
    assert.match(refs.entitlementId, /^theme_[a-z]+$/u, themeId);
  }
});

test('ownership is answered by entitlement, never by theme or product id', () => {
  assert.equal(
    isThemeOwnedIndividually('skin_aurora', new Set(['skin_aurora'])),
    false,
    'a theme id is not an entitlement',
  );
  assert.equal(
    isThemeOwnedIndividually('skin_aurora', new Set(['com.wordping.theme.aurora'])),
    false,
    'a product id is not an entitlement',
  );
  assert.equal(isThemeOwnedIndividually('skin_aurora', new Set(['theme_aurora'])), true);
  // A plan entitlement can never mark a theme owned.
  assert.equal(isThemeOwnedIndividually('skin_aurora', new Set(['premium'])), false);
  assert.equal(isThemeOwnedIndividually('not_a_theme', NOBODY), false);
});
