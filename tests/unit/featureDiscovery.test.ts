import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEATURE_MARKERS,
  markFeatureSeen,
  parseSeenFeatures,
  planUnlocksFeature,
  serializeSeenFeatures,
  shouldShowFeatureMarker,
  type FeatureMarkerId,
} from '../../src/features/onboarding/featureDiscovery';
import type { PlanTier } from '../../src/lib/planLimits';

/**
 * The "!" markers on newly unlocked features.
 *
 * Each is independent and versioned, shown only to a plan that actually
 * unlocks the feature, and never brought back once dismissed.
 */

const ALL = Object.values(FEATURE_MARKERS);
/** What any paid plan unlocks in addition to Free's Custom Voice marker. */
const BASIC_SET = [
  FEATURE_MARKERS.themeShop,
  FEATURE_MARKERS.customAudio,
];
/** What only Premium unlocks: the two AI Voice surfaces. */
const PREMIUM_ONLY = [
  FEATURE_MARKERS.naturalAIVoice,
  FEATURE_MARKERS.aboutAIVoice,
];

function visible(plan: PlanTier, seen: string[] = [], isSubscriptionLoaded = true): FeatureMarkerId[] {
  return ALL.filter(marker =>
    shouldShowFeatureMarker({ marker, plan, isSubscriptionLoaded, seen: new Set(seen) }));
}

test('20. a Free user can discover the Custom Voice control', () => {
  assert.deepEqual(visible('free'), [FEATURE_MARKERS.customAudio]);
});

test('21. nothing is marked while the subscription state is unknown', () => {
  assert.deepEqual(visible('basic', [], false), []);
  assert.deepEqual(visible('premium', [], false), []);
});

test('15. Basic receives the Theme Shop and the custom-audio control', () => {
  assert.deepEqual(visible('basic').sort(), [...BASIC_SET].sort());
  // The two AI Voice surfaces are Premium and must not be offered to Basic.
  for (const marker of PREMIUM_ONLY) {
    assert.equal(visible('basic').includes(marker), false, `${marker} is Premium`);
  }
});

test('16. Premium receives those plus both AI Voice surfaces', () => {
  assert.deepEqual(visible('premium').sort(), [...ALL].sort());
});

test('the plan requirement comes from each feature rule, not a tier list', () => {
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.customAudio, 'free'), true);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.customAudio, 'basic'), true);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.customAudio, 'premium'), true);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'free'), false);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'basic'), true);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'premium'), true);
  for (const marker of PREMIUM_ONLY) {
    assert.equal(planUnlocksFeature(marker, 'free'), false);
    assert.equal(planUnlocksFeature(marker, 'basic'), false, `${marker} follows AI Voice`);
    assert.equal(planUnlocksFeature(marker, 'premium'), true);
  }
});

test('18. each marker dismisses independently', () => {
  const afterThemeShop = visible('premium', [FEATURE_MARKERS.themeShop]);
  assert.deepEqual(
    afterThemeShop.sort(),
    [...PREMIUM_ONLY, FEATURE_MARKERS.customAudio].sort(),
    'opening one feature must not clear the others',
  );
  assert.deepEqual(visible('premium', [FEATURE_MARKERS.aboutAIVoice]).length, 3);
  assert.deepEqual(visible('premium', ALL), []);
});

test('19. custom audio is one marker, so Add and Edit share its dismissal', () => {
  // One id means finding the control in either sheet clears it in both; there
  // is no second id that could remain set.
  assert.equal(
    new Set(ALL).size,
    ALL.length,
    'ids are unique, and there is exactly one for the custom-audio control',
  );
  assert.deepEqual(
    visible('basic', [FEATURE_MARKERS.customAudio]),
    [FEATURE_MARKERS.themeShop],
  );
});

test('17. a Basic user upgrading to Premium keeps what they already found', () => {
  // They dismissed both Basic markers while on Basic.
  const afterUpgrade = visible('premium', BASIC_SET);
  assert.deepEqual(afterUpgrade.sort(), [...PREMIUM_ONLY].sort(),
    'only the newly unlocked AI Voice surfaces are marked');
});

test('22. a downgrade hides inaccessible markers without erasing history', () => {
  const seen = [FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('free', seen), [FEATURE_MARKERS.customAudio]);
  // The set itself is untouched — hiding is by entitlement, not by forgetting.
  assert.deepEqual([...markFeatureSeen(new Set(seen), FEATURE_MARKERS.themeShop)], seen);
});

test('23. resubscribing does not restore a dismissed marker', () => {
  const seen = [FEATURE_MARKERS.customAudio, FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('basic', seen), []);
  assert.deepEqual(visible('premium', seen).sort(), [...PREMIUM_ONLY].sort());
});

test('the ids are versioned, so a future feature can be marked again', () => {
  for (const marker of ALL) assert.match(marker, /\.v\d+$/u);
});

test('the stored set survives a round trip and tolerates damage', () => {
  const seen = new Set([FEATURE_MARKERS.themeShop, FEATURE_MARKERS.aboutAIVoice]);
  assert.deepEqual(parseSeenFeatures(serializeSeenFeatures(seen)), seen);
  // Unreadable means "nothing dismissed" — one extra dot, never a hidden feature.
  for (const raw of [null, undefined, '', 'not json', '{"a":1}', '[1,2]', '[""]']) {
    assert.deepEqual([...parseSeenFeatures(raw)], []);
  }
  // An id from a newer build is kept, so rolling back cannot lose a dismissal.
  assert.deepEqual([...parseSeenFeatures('["future-feature.v9"]')], ['future-feature.v9']);
});

test('marking is idempotent, so a repeat tap writes nothing', () => {
  const seen = new Set([FEATURE_MARKERS.themeShop]);
  assert.equal(markFeatureSeen(seen, FEATURE_MARKERS.themeShop), seen, 'same set, no write');
  assert.notEqual(markFeatureSeen(seen, FEATURE_MARKERS.aboutAIVoice), seen);
});
