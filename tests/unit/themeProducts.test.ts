import assert from 'node:assert/strict';
import test from 'node:test';

import {
  THEME_OFFERING_ID,
  THEME_PRODUCTS,
  allThemePackageIds,
  isThemeOwnedIndividually,
  resolveThemePrice,
  resolveThemePriceForProduct,
  resolveThemeStatus,
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
/** No subscription, and RevenueCat has answered — the pre-existing baseline. */
const FREE_PLAN = { isSubscribed: false, isSubscriptionLoaded: true } as const;

/** Keyed by package id, which is what the shop resolves a theme through. */
function withPackage(priceString: string): ReadonlyMap<string, ThemeStoreProduct> {
  return new Map([[REFS.packageId, { identifier: REFS.packageId, priceString }]]);
}

test('a free theme never shows a price', () => {
  assert.deepEqual(
    resolveThemePriceForProduct({
      price: 0, refs: undefined, products: NO_PRODUCTS, ownedEntitlementIds: NOBODY, ...FREE_PLAN,
    }),
    { state: 'free' },
  );
});

test('the localized string is passed through exactly, in any currency', () => {
  for (const priceString of ['¥480', '$3.99', '3,99 €', 'R$ 19,90', '₩5,500']) {
    assert.deepEqual(
      resolveThemePriceForProduct({
        price: 480, refs: REFS, products: withPackage(priceString), ownedEntitlementIds: NOBODY,
        ...FREE_PLAN,
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
      ...FREE_PLAN,
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
      resolveThemePriceForProduct({ price: 480, refs, products, ownedEntitlementIds: NOBODY, ...FREE_PLAN }),
      { state: 'unavailable' },
      label,
    );
  }
});

test('the shop integer never reaches the screen', () => {
  // 480 is a paid/free flag with no currency attached. `unavailable` carries no
  // value at all, which is what guarantees it cannot be rendered as a price.
  const display = resolveThemePriceForProduct({
    price: 480, refs: REFS, products: NO_PRODUCTS, ownedEntitlementIds: NOBODY, ...FREE_PLAN,
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
      ...FREE_PLAN,
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

// ── Subscription coverage: the TestFlight price regression ───────────────────

/**
 * A Basic or Premium subscriber could use every theme and was still shown an
 * individual price under each one.
 *
 * The cause was two lookups rather than one. `resolveThemeAccess` was told
 * about the plan and unlocked the theme; `resolveThemePrice` was not, so it
 * went on resolving a StoreKit price for something that was no longer for sale.
 * `resolveThemeStatus` now answers both from a single set of facts, and these
 * cases pin the answers.
 */

const AURORA = 'skin_aurora';
const AURORA_ENTITLEMENT = 'theme_aurora';
const PRICED: ReadonlyMap<string, ThemeStoreProduct> =
  new Map([['theme_aurora', { identifier: 'theme_aurora', priceString: '¥480' }]]);

function status(plan: 'free' | 'basic' | 'premium', owned: boolean, loaded = true) {
  return resolveThemeStatus({
    themeId: AURORA,
    price: 480,
    products: PRICED,
    ownedEntitlementIds: owned ? new Set([AURORA_ENTITLEMENT]) : NOBODY,
    isSubscribed: plan !== 'free',
    isSubscriptionLoaded: loaded,
  });
}

test('Free and unowned: the localized price is shown, and the theme stays locked', () => {
  const { access, price } = status('free', false);
  assert.deepEqual(price, { state: 'priced', priceString: '¥480' });
  assert.deepEqual(access, { state: 'locked' });
});

test('Free and individually owned: no price, owned instead, and usable', () => {
  const { access, price } = status('free', true);
  assert.deepEqual(price, { state: 'owned' });
  assert.deepEqual(access, { state: 'unlocked', reason: 'purchased' });
});

for (const plan of ['basic', 'premium'] as const) {
  test(`${plan} and unowned: no individual price, included instead, and usable`, () => {
    const { access, price } = status(plan, false);
    assert.deepEqual(price, { state: 'included' }, 'a subscriber must never be shown a price');
    assert.deepEqual(access, { state: 'unlocked', reason: 'subscription' });
    // The theme is still selectable — hiding the price must never lock anything.
    assert.equal(access.state, 'unlocked');
    // And nothing here may read as a permanent purchase.
    assert.notEqual(price.state, 'owned');
    assert.equal(isThemeOwnedIndividually(AURORA, NOBODY), false);
  });

  test(`${plan} and individually owned: still owned, not merely included`, () => {
    // The permanent fact outranks the subscription, so the label survives the
    // subscription ending rather than changing with it.
    assert.deepEqual(status(plan, true).price, { state: 'owned' });
    assert.deepEqual(status(plan, true).access, { state: 'unlocked', reason: 'purchased' });
  });
}

test('the subscription expiring brings the price back, except where it was bought', () => {
  // The same account, one renewal later. Nothing was written when the plan
  // covered the theme, so there is nothing to un-write.
  assert.deepEqual(status('premium', false).price, { state: 'included' });
  assert.deepEqual(status('free', false).price, { state: 'priced', priceString: '¥480' });

  // A theme bought outright is unaffected by the plan in either direction.
  assert.deepEqual(status('premium', true).price, { state: 'owned' });
  assert.deepEqual(status('free', true).price, { state: 'owned' });
});

test('an unresolved entitlement shows no price rather than one about to vanish', () => {
  // Relaunch, restore, or a RevenueCat refresh in flight. A subscriber would
  // otherwise see a price flash and disappear; fail closed like access does.
  assert.deepEqual(status('premium', false, false).price, { state: 'unavailable' });
  assert.deepEqual(status('free', false, false).price, { state: 'unavailable' });
  assert.deepEqual(status('free', false, false).access, { state: 'locked' });

  // Ownership needs no entitlement lookup, so it is answered even then.
  assert.deepEqual(status('free', true, false).price, { state: 'owned' });
  assert.deepEqual(status('free', true, false).access, { state: 'unlocked', reason: 'purchased' });
});

test('a free theme is free on every plan, and never priced or included', () => {
  for (const plan of ['free', 'basic', 'premium'] as const) {
    assert.deepEqual(
      resolveThemeStatus({
        themeId: 'solid_blue',
        price: 0,
        products: NO_PRODUCTS,
        ownedEntitlementIds: NOBODY,
        isSubscribed: plan !== 'free',
        isSubscriptionLoaded: true,
      }),
      { access: { state: 'unlocked', reason: 'free' }, price: { state: 'free' } },
      plan,
    );
  }
});

test('access and price can never contradict each other, for any combination', () => {
  // The invariant the split lookups broke: if the plan unlocked it, no price.
  for (const plan of ['free', 'basic', 'premium'] as const) {
    for (const owned of [false, true]) {
      for (const loaded of [false, true]) {
        const { access, price } = status(plan, owned, loaded);
        if (access.state === 'unlocked' && access.reason !== 'free') {
          assert.notEqual(price.state, 'priced', `${plan}/${owned}/${loaded} priced an unlocked theme`);
        }
        if (price.state === 'priced') {
          assert.deepEqual(access, { state: 'locked' }, `${plan}/${owned}/${loaded}`);
        }
        // `included` is reachable only from a live subscription, never a purchase.
        if (price.state === 'included') {
          assert.deepEqual(access, { state: 'unlocked', reason: 'subscription' });
        }
      }
    }
  }
});

// ── The temporary Simulator recording override ───────────────────────────────

test('the override hides the price and shows the included state, without owning it', () => {
  const overridden = resolveThemeStatus({
    themeId: AURORA,
    price: 480,
    products: PRICED,
    ownedEntitlementIds: NOBODY,
    isSubscribed: false,
    isSubscriptionLoaded: true,
    devUnlockOverride: true,
  });

  // Selectable, priced at nothing, and offering no Buy button — `priced` is the
  // only state the details sheet renders a purchase for.
  assert.deepEqual(overridden.access, { state: 'unlocked', reason: 'dev-override' });
  assert.deepEqual(overridden.price, { state: 'included' });
  assert.notEqual(overridden.price.state, 'owned', 'the override must never look like a purchase');
  assert.notEqual(overridden.price.state, 'priced');

  // Nothing was written: ownership is still read from the receipt alone.
  assert.equal(isThemeOwnedIndividually(AURORA, NOBODY), false);
});

test('with the override off, everything is exactly as before', () => {
  const off = resolveThemeStatus({
    themeId: AURORA,
    price: 480,
    products: PRICED,
    ownedEntitlementIds: NOBODY,
    isSubscribed: false,
    isSubscriptionLoaded: true,
    devUnlockOverride: false,
  });
  assert.deepEqual(off.access, { state: 'locked' });
  assert.deepEqual(off.price, { state: 'priced', priceString: '¥480' });
  // Omitting it entirely is the same as off.
  assert.deepEqual(off, status('free', false));
});

test('a genuinely bought theme still says owned while the override is on', () => {
  const bought = resolveThemeStatus({
    themeId: AURORA,
    price: 480,
    products: PRICED,
    ownedEntitlementIds: new Set([AURORA_ENTITLEMENT]),
    isSubscribed: false,
    isSubscriptionLoaded: true,
    devUnlockOverride: true,
  });
  assert.deepEqual(bought.access, { state: 'unlocked', reason: 'purchased' });
  assert.deepEqual(bought.price, { state: 'owned' });
});

test('access and price still cannot contradict each other with the override on', () => {
  for (const owned of [false, true]) {
    for (const loaded of [false, true]) {
      const { access, price } = resolveThemeStatus({
        themeId: AURORA,
        price: 480,
        products: PRICED,
        ownedEntitlementIds: owned ? new Set([AURORA_ENTITLEMENT]) : NOBODY,
        isSubscribed: false,
        isSubscriptionLoaded: loaded,
        devUnlockOverride: true,
      });
      assert.equal(access.state, 'unlocked', 'the override must always make it usable');
      assert.notEqual(price.state, 'priced', 'an unlocked theme is never priced');
      assert.notEqual(price.state, 'unavailable', 'an unlocked theme must still show its status');
    }
  }
});
