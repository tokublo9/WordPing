const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

/**
 * A Basic->Premium upgrade leaves both entitlements active at once, so the order
 * these are checked in decides what the upgrading customer sees. Getting it
 * backwards shows a paying Premium user the Basic plan, and nothing else in the
 * app would fail.
 *
 * `planFromCustomerInfo` imports react-native, so it cannot be exercised from
 * tests/unit. Asserted from source instead, the same way the other RN-coupled
 * invariants in this directory are.
 */

test('the client resolves Premium ahead of Basic when both entitlements are active', () => {
  const source = fs.readFileSync('src/lib/purchases.ts', 'utf8');
  const body = /export function planFromCustomerInfo\([\s\S]*?\n\}/u.exec(source)?.[0];
  assert.ok(body, 'planFromCustomerInfo not found');

  const premiumAt = body.indexOf('ENTITLEMENT_IDS.PREMIUM');
  const basicAt = body.indexOf('ENTITLEMENT_IDS.BASIC');
  assert.ok(premiumAt !== -1, 'premium entitlement is not checked');
  assert.ok(basicAt !== -1, 'basic entitlement is not checked');
  assert.ok(
    premiumAt < basicAt,
    'premium must be checked before basic, or an upgraded customer resolves to basic',
  );

  // Returning early is what makes the ordering binding: without it a later basic
  // branch could still overwrite the premium result.
  assert.match(body, /ENTITLEMENT_IDS\.PREMIUM\]\?\.isActive\) return 'premium';/u);
  assert.match(body, /ENTITLEMENT_IDS\.BASIC\]\?\.isActive\) return 'basic';/u);
  assert.match(body, /return 'free';/u);

  // A first-match scan over the active map would reintroduce exactly the bug
  // this guards, since object key order is the store's, not ours.
  assert.doesNotMatch(body, /Object\.keys|Object\.entries|\.find\(|for \(/u);
});

test('the entitlement identifiers stay the pair the Worker verifies against', () => {
  const client = fs.readFileSync('src/lib/purchases.ts', 'utf8');
  assert.match(client, /BASIC: 'basic'/u);
  assert.match(client, /PREMIUM: 'premium'/u);

  // The Worker is the authority on access; a rename on one side only would let
  // the two disagree about what a customer is entitled to.
  const worker = fs.readFileSync('cloudflare/wordping-api/src/entitlements.ts', 'utf8');
  const workerOrder = /entitlementPremium[\s\S]*?entitlementBasic/u.test(worker);
  assert.ok(workerOrder, 'the Worker must also resolve premium before basic');
});

test('the single plan source is not bypassed by a second entitlement read', () => {
  // Every plan decision must go through planFromCustomerInfo. A component reading
  // entitlements.active directly could apply its own, different, precedence.
  const readers = [];
  for (const file of ['src/hooks/useSubscription.ts', 'App.tsx']) {
    if (/entitlements\.active/u.test(fs.readFileSync(file, 'utf8'))) readers.push(file);
  }
  assert.deepEqual(readers, [], 'entitlements must only be read in src/lib/purchases.ts');
});
