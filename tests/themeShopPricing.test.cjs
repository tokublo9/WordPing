const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

/**
 * The Theme Shop must never price a theme the plan already covers.
 *
 * The behaviour is proved in tests/unit/themeProducts.test.ts against the real
 * resolver. What is pinned here is the shape that makes the resolver the only
 * answer: one lookup feeding both surfaces, no component deciding for itself
 * whether to draw a price, and every status line coming from copy that already
 * exists in all twenty locales.
 */

const shop = read('src/components/KisekaeShopSheet.tsx');
const details = read('src/components/ThemeDetailsSheet.tsx');
const products = read('src/features/themes/themeProducts.ts');
const i18n = read('src/i18n.ts');

test('access and price are resolved together, from one call', () => {
  // The regression: `resolveThemeAccess` knew the plan and `resolveThemePrice`
  // did not, so the shop unlocked a theme and priced it in the same render.
  assert.match(shop, /resolveThemeStatus\(\{[\s\S]{0,320}isSubscribed,\s*isSubscriptionLoaded,/u);
  assert.match(shop, /const priceFor = useCallback\(\s*\(item: ShopItem\): ThemePriceDisplay => statusFor\(item\)\.price,/u);
  assert.match(shop, /const accessFor = useCallback\(\(item: ShopItem\) => statusFor\(item\)\.access, \[statusFor\]\);/u);

  // Neither half may be resolved independently any more.
  assert.doesNotMatch(shop, /resolveThemeAccess\(/u, 'the shop must not run its own access lookup');
  assert.doesNotMatch(shop, /resolveThemePrice\(/u, 'the shop must not run its own price lookup');

  // The memo is keyed on the plan, so an upgrade, downgrade, restore or refresh
  // rebuilds it rather than serving the plan the sheet opened with.
  assert.match(
    shop,
    /\}, \[isSubscribed, isSubscriptionLoaded, ownedEntitlementIds, products\]\);/u,
  );
});

test('the resolver refuses to price anything the subscription covers', () => {
  const rule = products.slice(
    products.indexOf('export function resolveThemePriceForProduct('),
    products.indexOf('/** Access and price for one theme'),
  );
  // Ownership first and plan-independent, then the plan, and only then a price.
  assert.match(rule, /if \(ownedIndividually\) return \{ state: 'owned' \};/u);
  assert.match(rule, /const access = resolveThemeAccess\(\{/u);
  assert.match(
    rule,
    /if \(access\.state === 'unlocked' && \(access\.reason === 'subscription' \|\| access\.reason === 'dev-override'\)\) \{\s*return \{ state: 'included' \};/u,
  );
  // The loading guard sits above the product lookup, so no price can be drawn
  // before the entitlement is known.
  const loadedAt = rule.indexOf("if (!isSubscriptionLoaded) return { state: 'unavailable' };");
  const productAt = rule.indexOf('products.get(refs.packageId)');
  assert.ok(loadedAt > -1 && loadedAt < productAt, 'the loading guard must precede the price lookup');

  // The subscription rule itself is not duplicated here; it is delegated.
  assert.match(products, /import \{ resolveThemeAccess, type ThemeAccessState \} from '\.\/themeAccess';/u);
  assert.doesNotMatch(rule, /isPremium|plan ===|'basic'|'premium'/u, 'no plan name may be written into the price rule');
});

test('subscription coverage is never recorded as a purchase', () => {
  // `included` and `owned` are separate states on purpose: one ends with the
  // subscription, the other does not. Ownership still comes from the receipt.
  assert.match(products, /\| \{ state: 'included' \}/u);
  assert.match(
    products,
    /export function isThemeOwnedIndividually\([\s\S]{0,220}ownedEntitlementIds\.has\(refs\.entitlementId\);/u,
  );
  // Nothing in the shop writes ownership anywhere.
  for (const [path, source] of [['KisekaeShopSheet.tsx', shop], ['ThemeDetailsSheet.tsx', details]]) {
    assert.doesNotMatch(source, /AsyncStorage|setItem\(/u, `${path} must not persist theme ownership`);
  }
});

test('both surfaces draw the same four outcomes, and neither invents a plan check', () => {
  // Card: owned says so, priced shows StoreKit's string, everything else — free,
  // included, unavailable — draws no line at all.
  assert.match(shop, /\{priceDisplay\.state === 'owned' \? \([\s\S]{0,200}t\('theme_owned'\)/u);
  assert.match(shop, /\) : priceDisplay\.state === 'priced' \? \([\s\S]{0,500}\{priceDisplay\.priceString\}/u);
  assert.match(shop, /\) : null\}/u);

  // Details: same ownership line, same price line, and the plan line for a
  // theme the subscription covers.
  assert.match(details, /\{priceDisplay\.state === 'owned' \? \([\s\S]{0,200}t\('theme_owned'\)/u);
  assert.match(details, /\) : priceDisplay\.state === 'priced' \? \(/u);
  // Two branches, not one condition: the locked upsell names Basic, and the
  // subscriber status must not, or a Premium subscriber is told they hold a
  // different plan. Asserted separately from the labels so a comment edit
  // between them cannot fail a test about the rendering rule.
  assert.match(details, /\{!isUnlocked && \(/u);
  assert.match(details, /\{isUnlocked && priceDisplay\.state === 'included' && \(/u);
  assert.equal(
    (details.match(/t\('theme_details_included_basic'\)/gu) ?? []).length,
    1,
    'the upsell line must have exactly one call site',
  );
  assert.equal(
    (details.match(/t\('theme_details_included_plan'\)/gu) ?? []).length,
    1,
    'the neutral status line must have exactly one call site',
  );

  // Buying stays tied to a real price, so a covered theme offers no purchase.
  assert.match(details, /\{priceDisplay\.state === 'priced' && onBuy && \(/u);

  // And neither component re-derives entitlement from a plan flag.
  for (const [path, source] of [['KisekaeShopSheet.tsx', shop], ['ThemeDetailsSheet.tsx', details]]) {
    assert.doesNotMatch(
      source,
      /priceDisplay[\s\S]{0,40}(isPremium|isSubscribed)|(isPremium|isSubscribed)[\s\S]{0,40}priceDisplay/u,
      `${path} must not gate a price label on a plan flag`,
    );
  }
});

test('every Theme Shop host feeds the same resolver', () => {
  // Two hosts reach these screens. Settings opens the shop, which owns the
  // details sheet; the Upgrade sheet opens details directly and passes no
  // price at all, so it cannot show one either.
  assert.match(read('src/components/SettingsModal.tsx'), /<KisekaeShopSheet/u);
  assert.match(shop, /<ThemeDetailsSheet[\s\S]{0,600}priceDisplay=\{detailsItem \? priceFor\(detailsItem\) : UNAVAILABLE_PRICE\}/u);

  const proSheet = read('src/components/ProSheet.tsx');
  const detailsInPro = proSheet.slice(proSheet.indexOf('<ThemeDetailsSheet'));
  assert.doesNotMatch(detailsInPro, /priceDisplay=/u, 'the Upgrade sheet must not price a theme');
  // `priceDisplay` defaults to unavailable, which draws nothing.
  assert.match(details, /const UNPRICED: ThemePriceDisplay = \{ state: 'unavailable' \};/u);
  assert.match(details, /priceDisplay = UNPRICED,/u);
});

test('the status copy already exists in all twenty locales', () => {
  const localeCount = (i18n.match(/^ {2}test_info_title:/gmu) ?? []).length;
  assert.equal(localeCount, 20);

  function values(key) {
    const pattern = new RegExp(`(?:^|[ ,])${key}: *(['"])((?:(?!\\1)[^\\\\]|\\\\.)*)\\1`, 'gmu');
    return [...i18n.matchAll(pattern)].map(match => match[2]);
  }

  // Both labels are pre-existing keys. No key was added for this fix, so there
  // is no locale left holding an English placeholder.
  for (const key of ['theme_owned', 'theme_details_included_basic', 'theme_details_included_plan']) {
    const entries = values(key);
    assert.equal(entries.length, localeCount, `${key} needs one entry per locale`);
    for (const entry of entries) assert.match(entry, /\S/u, `${key} must not be blank`);
  }
  assert.ok(values('theme_owned').includes('Owned'));
  assert.ok(values('theme_owned').includes('購入済み'));
  assert.ok(values('theme_details_included_basic').includes('Included in the Basic Plan'));
  // Japanese now names the tier in its own script — see planNameLocalization.
  assert.ok(values('theme_details_included_basic').includes('ベーシックプランに含まれています'));
  assert.ok(values('theme_details_included_plan').includes('Included with your plan'));
  assert.ok(values('theme_details_included_plan').includes('現在のプランに含まれています'));

  // Every locale writes its own, so none of the nineteen repeats the English.
  for (const key of ['theme_details_included_basic', 'theme_details_included_plan']) {
    const english = key === 'theme_details_included_basic'
      ? 'Included in the Basic Plan'
      : 'Included with your plan';
    assert.equal(
      values(key).filter(value => value === english).length,
      1,
      `no locale may fall back to the English ${key}`,
    );
  }
});

test('nothing about purchasing, restoring or the product registry moved', () => {
  // The identifiers a purchase depends on are untouched by a display fix.
  assert.match(products, /export const THEME_OFFERING_ID = 'theme_store';/u);
  assert.match(products, /skin_aurora: +\{ productId: 'com\.wordping\.theme\.aurora', packageId: 'theme_aurora', entitlementId: 'theme_aurora' \}/u);
  assert.match(shop, /const result = await purchaseTheme\(item\.id\);/u);
  // Access rules themselves are unchanged: free, purchased, subscription, locked.
  const access = read('src/features/themes/themeAccess.ts');
  assert.match(access, /if \(price <= 0\) return \{ state: 'unlocked', reason: 'free' \};/u);
  assert.match(access, /if \(ownedIndividually\) return \{ state: 'unlocked', reason: 'purchased' \};/u);
  assert.match(access, /if \(isSubscriptionLoaded && isSubscribed\) return \{ state: 'unlocked', reason: 'subscription' \};/u);
  assert.match(access, /return \{ state: 'locked' \};/u);
});

// ── The temporary Simulator recording override ───────────────────────────────

/**
 * A DEV-only, file-based theme unlock for recording the Theme Shop.
 *
 * Its behaviour — including that `__DEV__ === false` unlocks nothing — is proved
 * in tests/unit/themeAccess.test.ts and tests/unit/themeProducts.test.ts, which
 * can call the predicate with `isDev: false` because it takes that as an
 * argument. Pinned here is the structure around it: the committed value, the
 * single `__DEV__` read, and the promise that it grants nothing but themes.
 */

const override = read('src/dev/themeAccessOverride.ts');
/** The same file with comments removed, for assertions about code alone. */
const overrideCode = override.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/.*$/gmu, '');

test('the committed switch is false and reads __DEV__ exactly once, with AND', () => {
  assert.match(override, /^export const FORCE_UNLOCK_ALL_THEMES = false;$/mu);
  // Comments stripped: the module explains at length what it does not do, and
  // that prose must not be counted as code.
  assert.equal((overrideCode.match(/__DEV__/gu) ?? []).length, 1, '__DEV__ belongs in one place');
  assert.match(
    override,
    /return isThemeUnlockOverrideEnabled\(__DEV__, FORCE_UNLOCK_ALL_THEMES\);/u,
  );
  // The predicate itself is the pure, testable one — not re-implemented here.
  const access = read('src/features/themes/themeAccess.ts');
  assert.match(
    access,
    /export function isThemeUnlockOverrideEnabled\(isDev: boolean, forceUnlockAllThemes: boolean\): boolean \{\s*return isDev === true && forceUnlockAllThemes === true;/u,
  );
});

test('the override buys nothing, restores nothing and grants no plan', () => {
  // No store SDK, no network, no persistence: it is a display-and-selection
  // switch and the imports are what prove it.
  assert.doesNotMatch(overrideCode, /react-native-purchases|Purchases\.|purchase|restore|AsyncStorage|fetch\(/iu);
  assert.match(override, /^import \{ isThemeUnlockOverrideEnabled \} from '\.\.\/features\/themes\/themeAccess';$/mu);
  assert.equal((override.match(/^import /gmu) ?? []).length, 1, 'one import, and it is the pure predicate');

  // Nothing outside theme access consults it. In particular not the hook that
  // owns the plan, nor the AI-voice entitlement rule.
  for (const path of [
    'src/hooks/useSubscription.ts',
    'src/lib/aiEntitlement.ts',
    'src/lib/purchases.ts',
    'src/hooks/useThemePurchases.ts',
  ]) {
    assert.doesNotMatch(
      read(path),
      /themeUnlockOverrideActive|FORCE_UNLOCK_ALL_THEMES/u,
      `${path} must not see the theme override`,
    );
  }
});

test('every override call site feeds a shared rule rather than branching', () => {
  const callers = ['src/components/KisekaeShopSheet.tsx', 'App.tsx'];
  for (const path of callers) {
    assert.match(read(path), /themeUnlockOverrideActive\(\)/u, `${path} should consult the override`);
  }
  // The shop feeds it into the one shared resolver rather than branching on it.
  assert.match(shop, /devUnlockOverride: themeUnlockOverrideActive\(\),/u);
  assert.doesNotMatch(shop, /if \([^)]*themeUnlockOverrideActive/u, 'no ad-hoc branch on the override');

  // Three call sites in all: the shop's status resolver, the renderer, and the
  // one reset branch. The reset guard used to sit on the inner skin condition
  // and spare the theme-colour reset beside it — which is why a solid theme
  // applied its wallpaper but not its colour. It now guards the branch that
  // owns both, and the detail is asserted in its own test below.
  assert.equal((read('App.tsx').match(/themeUnlockOverrideActive\(\)/gu) ?? []).length, 2);
  assert.equal((shop.match(/themeUnlockOverrideActive\(\)/gu) ?? []).length, 1);
});

test('preflight blocks a build while the override is on', () => {
  const preflight = read('src/lib/releasePreflight.ts');
  assert.match(preflight, /export function checkDevOverrides\(themeAccessOverrideSource: string\): PreflightIssue\[\]/u);
  assert.match(preflight, /severity: 'error',[\s\S]{0,220}FORCE_UNLOCK_ALL_THEMES is true/u);
  // And the runner actually calls it, on the real file.
  const runner = read('scripts/releasePreflight.cjs');
  assert.match(
    runner,
    /\.\.\.checks\.checkDevOverrides\(\s*fs\.readFileSync\(path\.join\(root, 'src\/dev\/themeAccessOverride\.ts'\), 'utf8'\),\s*\),/u,
  );
});

test('the RevenueCat Test Store switch is left intact and separate', () => {
  // Kept, per the brief, and untouched by this: two different tools for two
  // different recordings. Neither module references the other.
  const revenueCatKey = read('src/features/purchases/revenueCatKey.ts');
  assert.match(revenueCatKey, /export function shouldUseRevenueCatTestStore\(/u);
  assert.doesNotMatch(revenueCatKey, /FORCE_UNLOCK_ALL_THEMES|themeUnlockOverrideActive/u);
  assert.doesNotMatch(overrideCode, /REVENUECAT|TEST_STORE_API_KEY/u);
});

// ── The override reaching the renderer ───────────────────────────────────────

/**
 * Selecting a theme has to end in a wallpaper on screen, not just a stored id.
 *
 * The path is: shop tap → `setSkinId` → persisted by `useAppPersistence` →
 * re-read at launch → `useThemeController` turns the id into a skin → overlays
 * and palette. The override was applied at the first step and nowhere else, so
 * the last step refused it and the theme appeared not to apply.
 */

const controller = read('src/features/themes/useThemeController.ts');
const app = read('App.tsx');

test('the renderer asks the shared access rule, not its own copy', () => {
  assert.match(controller, /import \{ isThemeUnlocked \} from '\.\/themeAccess';/u);
  assert.match(
    controller,
    /const activeSkin: ThemeSkin \| null = SKINS\.find\(s => s\.id === skinId && isThemeUnlocked\(\{[\s\S]{0,400}devUnlockOverride,\s*\}\)\) \?\? null;/u,
  );
  // The predicate it replaced is gone, so there is no second rule to drift.
  assert.doesNotMatch(controller, /isSubscribed\s*\|\|\s*FREE_SKIN_IDS\.has/u);
  // A skin's free/paid flag is its membership of FREE_SKIN_IDS, mapped to the
  // shared rule's `price`.
  assert.match(controller, /price: FREE_SKIN_IDS\.has\(s\.id\) \? 0 : 1,/u);
  // An unknown or deleted id still falls through to null and the default look.
  assert.match(controller, /\?\? null;/u);
  assert.match(controller, /const activeThemeColor = activeSkin \? activeSkin\.themeColor : themeColor;/u);
});

test('App hands the override to the renderer as well as to the shop', () => {
  assert.match(
    app,
    /useThemeController\(\{[\s\S]{0,500}devUnlockOverride: themeUnlockOverrideActive\(\),\s*\}\);/u,
  );
});

test('both Free-plan theme resets are suppressed, and nothing else is', () => {
  // One guard on the branch that owns both resets — the skin reset and the
  // legacy theme-colour reset. Previously only the first was suppressed, which
  // is why a solid theme's colour still snapped back.
  assert.match(app, /if \(!isSubscribed && !themeUnlockOverrideActive\(\)\) \{/u);
  const block = app.slice(
    app.indexOf('if (!isSubscribed && !themeUnlockOverrideActive()) {'),
    app.indexOf('const pickAppearance'),
  );
  assert.match(block, /setSkinId\('solid_blue'\);/u);
  assert.match(block, /setThemeColor\(FREE_THEME_COLOR\);/u);

  // The guards that are about correctness rather than entitlement stay put:
  // nothing is reset before settings, the subscription and ownership are known.
  assert.match(app, /if \(!settingsLoaded \|\| !isSubscriptionLoaded\) return;/u);
  assert.match(app, /if \(!themePurchases\.ownershipLoaded\) return;/u);
  const guarded = app.slice(app.indexOf('if (!settingsLoaded || !isSubscriptionLoaded) return;'));
  assert.doesNotMatch(
    guarded.slice(0, 400),
    /themeUnlockOverrideActive/u,
    'the load guards must not be skipped by the override',
  );

  // Exactly two call sites in App: the renderer and this one reset branch.
  assert.equal((app.match(/themeUnlockOverrideActive\(\)/gu) ?? []).length, 2);
});

test('the selected theme is persisted and re-read with no entitlement filter', () => {
  // What makes it survive a DEV reload: the id is written and read back plainly,
  // so with the resets suppressed there is nothing left to discard it.
  const persistence = read('src/app/useAppPersistence.ts');
  const settings = read('src/app/useAppSettings.ts');
  assert.match(persistence, /persist\(\{ cards, settings: \{ themeColor, appearance, skinId, language, aiVoice \} \}\);/u);
  assert.match(settings, /setSkinId\(s\.skinId \?\? null\);/u);
  for (const [path, source] of [['useAppPersistence.ts', persistence], ['useAppSettings.ts', settings]]) {
    assert.doesNotMatch(source, /isSubscribed|ownedEntitlement|themeUnlockOverrideActive/u, `${path} must not filter the stored skin`);
  }
});

test('the override still grants nothing but theme appearance', () => {
  // The plan, the credits, the voice entitlement, ownership and the store are
  // all resolved elsewhere and none of them can see this flag.
  for (const path of [
    'src/hooks/useSubscription.ts',
    'src/hooks/useThemePurchases.ts',
    'src/lib/aiEntitlement.ts',
    'src/lib/purchases.ts',
    'src/lib/planLimits.ts',
    'src/features/backup/backupAccess.ts',
  ]) {
    assert.doesNotMatch(
      read(path),
      /themeUnlockOverrideActive|FORCE_UNLOCK_ALL_THEMES|devUnlockOverride/u,
      `${path} must not see the theme override`,
    );
  }
  // And App still derives the plan-gated capabilities from the plan alone.
  assert.match(app, /canUseAIVoice/u);
  const capabilityLines = (app.match(/^.*canUseAIVoice.*$/gmu) ?? []).join('\n');
  assert.doesNotMatch(capabilityLines, /themeUnlockOverrideActive/u);
});
