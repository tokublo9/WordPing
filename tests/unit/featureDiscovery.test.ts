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
const BASIC_SET = [
  FEATURE_MARKERS.naturalAIVoice,
  FEATURE_MARKERS.aboutAIVoice,
  FEATURE_MARKERS.themeShop,
];

function visible(plan: PlanTier, seen: string[] = [], isSubscriptionLoaded = true): FeatureMarkerId[] {
  return ALL.filter(marker =>
    shouldShowFeatureMarker({ marker, plan, isSubscriptionLoaded, seen: new Set(seen) }));
}

test('20. a Free user sees none of the subscribed-feature markers', () => {
  assert.deepEqual(visible('free'), []);
});

test('21. nothing is marked while the subscription state is unknown', () => {
  assert.deepEqual(visible('basic', [], false), []);
  assert.deepEqual(visible('premium', [], false), []);
});

test('15. Basic receives exactly the three requested markers', () => {
  assert.deepEqual(visible('basic').sort(), [...BASIC_SET].sort());
  // Custom audio is Premium-only and must not be offered to Basic.
  assert.equal(visible('basic').includes(FEATURE_MARKERS.customAudio), false);
});

test('16. Premium receives those three plus the custom-audio control', () => {
  assert.deepEqual(visible('premium').sort(), [...ALL].sort());
});

test('the plan requirement comes from the entitlement rule, not a tier list', () => {
  for (const marker of BASIC_SET) {
    assert.equal(planUnlocksFeature(marker, 'free'), false);
    assert.equal(planUnlocksFeature(marker, 'basic'), true);
    assert.equal(planUnlocksFeature(marker, 'premium'), true);
  }
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.customAudio, 'basic'), false);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.customAudio, 'premium'), true);
});

test('18. each marker dismisses independently', () => {
  const afterThemeShop = visible('basic', [FEATURE_MARKERS.themeShop]);
  assert.deepEqual(
    afterThemeShop.sort(),
    [FEATURE_MARKERS.naturalAIVoice, FEATURE_MARKERS.aboutAIVoice].sort(),
    'opening one feature must not clear the others',
  );
  assert.deepEqual(visible('basic', [FEATURE_MARKERS.aboutAIVoice]).length, 2);
  assert.deepEqual(visible('basic', BASIC_SET), []);
});

test('19. custom audio is one marker, so Add and Edit share its dismissal', () => {
  // One id means finding the control in either sheet clears it in both; there
  // is no second id that could remain set.
  assert.equal(
    new Set(ALL).size,
    ALL.length,
    'ids are unique, and there is exactly one for the custom-audio control',
  );
  assert.deepEqual(visible('premium', [FEATURE_MARKERS.customAudio]).sort(), [...BASIC_SET].sort());
});

test('17. a Basic user upgrading to Premium keeps what they already found', () => {
  // They dismissed all three Basic markers while on Basic.
  const afterUpgrade = visible('premium', BASIC_SET);
  assert.deepEqual(afterUpgrade, [FEATURE_MARKERS.customAudio],
    'only the newly unlocked control is marked');
});

test('22. a downgrade hides inaccessible markers without erasing history', () => {
  const seen = [FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('free', seen), [], 'nothing is offered on Free');
  // The set itself is untouched — hiding is by entitlement, not by forgetting.
  assert.deepEqual([...markFeatureSeen(new Set(seen), FEATURE_MARKERS.themeShop)], seen);
});

test('23. resubscribing does not restore a dismissed marker', () => {
  const seen = [FEATURE_MARKERS.naturalAIVoice, FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('basic', seen), [FEATURE_MARKERS.aboutAIVoice]);
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
