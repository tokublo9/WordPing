import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isThemeUnlocked,
  isThemeUnlockOverrideEnabled,
  resolveThemeAccess,
  type ThemeAccessInput,
} from '../../src/features/themes/themeAccess';

/** A paid theme, with the caller's plan state supplied per test. */
function access(overrides: Partial<ThemeAccessInput> = {}) {
  return resolveThemeAccess({
    price: 320,
    isSubscribed: false,
    isSubscriptionLoaded: true,
    ...overrides,
  });
}

test('a free theme is unlocked for everyone, on every plan state', () => {
  for (const plan of [
    { isSubscribed: false, isSubscriptionLoaded: true },
    { isSubscribed: true, isSubscriptionLoaded: true },
    // Even before RevenueCat answers: nothing is being unlocked that costs money.
    { isSubscribed: false, isSubscriptionLoaded: false },
  ]) {
    assert.deepEqual(access({ price: 0, ...plan }), { state: 'unlocked', reason: 'free' });
  }
});

test('a paid theme is locked for a free user', () => {
  assert.deepEqual(access({ isSubscribed: false }), { state: 'locked' });
  assert.equal(isThemeUnlocked({ price: 320, isSubscribed: false, isSubscriptionLoaded: true }), false);
});

test('a subscription unlocks a paid theme', () => {
  // Basic and Premium are both `isSubscribed` — the shop draws no distinction
  // between them, so one branch covers both plans.
  assert.deepEqual(access({ isSubscribed: true }), { state: 'unlocked', reason: 'subscription' });
});

test('a paid theme stays locked until RevenueCat has answered', () => {
  // Fail closed: an unresolved entitlement must never hand out a paid theme,
  // however briefly.
  assert.deepEqual(
    access({ isSubscribed: true, isSubscriptionLoaded: false }),
    { state: 'locked' },
  );
});

test('an expired subscription re-locks every paid theme', () => {
  // The only input that changes on expiry is isSubscribed, so the same theme
  // that was unlocked a moment ago is locked now — no ownership record survives
  // to keep it open, because none is ever recorded.
  assert.equal(access({ isSubscribed: true }).state, 'unlocked');
  assert.deepEqual(access({ isSubscribed: false }), { state: 'locked' });
});

test('there is no purchasable or unavailable state left', () => {
  // Individual theme purchasing is gone: every outcome is unlocked or locked,
  // so no caller can be asked to render a price, a Buy button or a store error.
  for (const price of [0, 320, 480]) {
    for (const isSubscribed of [true, false]) {
      for (const isSubscriptionLoaded of [true, false]) {
        const state = resolveThemeAccess({ price, isSubscribed, isSubscriptionLoaded }).state;
        assert.ok(state === 'unlocked' || state === 'locked', `unexpected state: ${state}`);
      }
    }
  }
});

test('nothing about access depends on a product identifier', () => {
  // The input carries no theme id and no owned-product set, so there is no way
  // to express "unlocked because it was bought on its own".
  const input: ThemeAccessInput = { price: 480, isSubscribed: true, isSubscriptionLoaded: true };
  assert.deepEqual(Object.keys(input).sort(), ['isSubscribed', 'isSubscriptionLoaded', 'price']);
  const result = resolveThemeAccess(input);
  assert.ok(result.state === 'unlocked' && result.reason === 'subscription');
});

// ── Individual purchase ──────────────────────────────────────────────────────

test('a theme bought outright is unlocked without any subscription', () => {
  assert.deepEqual(
    access({ price: 480, isSubscribed: false, isSubscriptionLoaded: true, ownedIndividually: true }),
    { state: 'unlocked', reason: 'purchased' },
  );
});

test('ownership does not wait for RevenueCat, and survives its failure', () => {
  // A purchase is permanent. Re-locking it while an entitlement lookup is in
  // flight — or after one fails — would take away something already paid for.
  assert.deepEqual(
    access({ price: 480, isSubscribed: false, isSubscriptionLoaded: false, ownedIndividually: true }),
    { state: 'unlocked', reason: 'purchased' },
  );
});

test('subscription behaviour is unchanged when nothing is owned', () => {
  // The whole point of the optional flag: every previous caller keeps its
  // previous answer, including the fail-closed one.
  assert.deepEqual(
    access({ price: 480, isSubscribed: true, isSubscriptionLoaded: true }),
    { state: 'unlocked', reason: 'subscription' },
  );
  assert.deepEqual(
    access({ price: 480, isSubscribed: true, isSubscriptionLoaded: false }),
    { state: 'locked' },
  );
  assert.deepEqual(
    access({ price: 480, isSubscribed: false, isSubscriptionLoaded: true }),
    { state: 'locked' },
  );
});

test('owning one theme never unlocks another', () => {
  // The flag is per theme, resolved from that theme's own product identifier.
  assert.deepEqual(
    access({ price: 480, isSubscribed: false, isSubscriptionLoaded: true, ownedIndividually: false }),
    { state: 'locked' },
  );
});

// ── The temporary Simulator recording override ───────────────────────────────

/**
 * TEMPORARY. What matters is that a release build cannot reach it, which is
 * provable here only because `isDev` is an argument rather than a read of
 * `__DEV__` — see src/dev/themeAccessOverride.ts.
 */

test('__DEV__ false never unlocks a theme, however the flag is set', () => {
  assert.equal(isThemeUnlockOverrideEnabled(false, true), false, 'a release build must ignore the flag');
  assert.equal(isThemeUnlockOverrideEnabled(false, false), false);

  // And the access rule with it resolved off is exactly the pre-existing rule.
  assert.deepEqual(
    resolveThemeAccess({
      price: 480, isSubscribed: false, isSubscriptionLoaded: true, devUnlockOverride: false,
    }),
    { state: 'locked' },
  );
});

test('both terms are required, and the default is off', () => {
  assert.equal(isThemeUnlockOverrideEnabled(true, false), false, 'off by default in development too');
  assert.equal(isThemeUnlockOverrideEnabled(true, true), true);
  // Absent behaves as false, so every pre-existing caller is unaffected.
  assert.deepEqual(
    resolveThemeAccess({ price: 480, isSubscribed: false, isSubscriptionLoaded: true }),
    { state: 'locked' },
  );
});

test('the override unlocks a paid theme under its own distinct reason', () => {
  assert.deepEqual(
    resolveThemeAccess({
      price: 480, isSubscribed: false, isSubscriptionLoaded: true, devUnlockOverride: true,
    }),
    { state: 'unlocked', reason: 'dev-override' },
    'never reported as a subscription the user does not hold',
  );
  // It works before RevenueCat has answered, which is the state a Simulator
  // launch often sits in.
  assert.deepEqual(
    resolveThemeAccess({
      price: 480, isSubscribed: false, isSubscriptionLoaded: false, devUnlockOverride: true,
    }),
    { state: 'unlocked', reason: 'dev-override' },
  );
});

test('the override never masks a real purchase or a real subscription', () => {
  // Ownership is permanent and outranks it, so the label a recording shows for
  // a genuinely bought theme is still the truthful one.
  assert.deepEqual(
    resolveThemeAccess({
      price: 480, isSubscribed: false, isSubscriptionLoaded: true,
      ownedIndividually: true, devUnlockOverride: true,
    }),
    { state: 'unlocked', reason: 'purchased' },
  );
  assert.deepEqual(
    resolveThemeAccess({
      price: 480, isSubscribed: true, isSubscriptionLoaded: true, devUnlockOverride: true,
    }),
    { state: 'unlocked', reason: 'subscription' },
  );
  // A free theme is still free, not overridden.
  assert.deepEqual(
    resolveThemeAccess({
      price: 0, isSubscribed: false, isSubscriptionLoaded: true, devUnlockOverride: true,
    }),
    { state: 'unlocked', reason: 'free' },
  );
});

// ── What the renderer asks, for each kind of theme ───────────────────────────

/**
 * `useThemeController` resolves the stored skin id into an actual wallpaper,
 * palette and colour, and it asks this rule to decide whether to. That is the
 * gate that made a selected theme "not apply": the shop unlocked every theme,
 * the plan stayed Free, and the controller resolved `activeSkin` to null.
 *
 * The hook itself imports react-native, so what is exercised here is the rule
 * it now delegates to, in the exact shape it passes — `price: 0` for a free
 * skin, `1` for a paid one, and `isSubscriptionLoaded: true` because the caller
 * has already resolved `isSubscribed`.
 */
function skinUnlocked(isFreeSkin: boolean, overrides: Partial<ThemeAccessInput> = {}) {
  return isThemeUnlocked({
    price: isFreeSkin ? 0 : 1,
    isSubscribed: false,
    isSubscriptionLoaded: true,
    ...overrides,
  });
}

test('the override applies a paid image or video theme, exactly as a subscription would', () => {
  // A wallpaper/video skin: paid, unowned, no subscription.
  assert.equal(skinUnlocked(false), false, 'without the override it stays refused');
  assert.equal(skinUnlocked(false, { devUnlockOverride: true }), true);
  // Identical answer to a genuinely entitled subscriber, which is the point:
  // the renderer takes the same branch either way.
  assert.equal(skinUnlocked(false, { isSubscribed: true }), true);
});

test('the override applies a paid solid-colour theme too', () => {
  // Solid skins carry their own themeColor, so unlocking one is what changes
  // the app's accent colour. Same rule, same answer.
  assert.equal(skinUnlocked(false, { devUnlockOverride: true }), true);
  // And the two genuinely free skins never needed it.
  assert.equal(skinUnlocked(true), true);
  assert.equal(skinUnlocked(true, { devUnlockOverride: false }), true);
});

test('with the override off, a paid skin is refused again and Free resumes', () => {
  assert.equal(skinUnlocked(false, { devUnlockOverride: false }), false);
  assert.equal(skinUnlocked(false), false);
  // A theme genuinely bought outright is unaffected in both directions.
  assert.equal(skinUnlocked(false, { ownedIndividually: true, devUnlockOverride: false }), true);
});

test('a release build renders no overridden theme, whatever is stored', () => {
  // The flag cannot resolve true there, so the renderer is never handed one.
  assert.equal(isThemeUnlockOverrideEnabled(false, true), false);
  assert.equal(skinUnlocked(false, { devUnlockOverride: isThemeUnlockOverrideEnabled(false, true) }), false);
});
