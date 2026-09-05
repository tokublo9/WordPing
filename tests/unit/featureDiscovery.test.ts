import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEATURE_MARKERS,
  hasExitedFirstTest,
  markFeatureSeen,
  parseSeenFeatures,
  planUnlocksFeature,
  serializeSeenFeatures,
  shouldShowFeatureMarker,
  shouldShowNotificationMarker,
  shouldShowTestMarker,
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
/**
 * Everything no plan gates: the word editor's three controls, Bulk Import, the
 * two Word List header icons, Send Test, Upgrade Plan, and the first-test milestone.
 *
 * Every one of them works on Free, so a marker for any of them must appear on
 * Free too — a hint pointing at something the user can already do. Upgrade Plan
 * most of all: gating it would hide it from the people it exists for.
 *
 * `firstTestExited` is in here because it is stored in the same set and obeys
 * the same mechanics. Nothing renders it — see the sequencing tests below.
 */
const EVERY_PLAN_MARKERS = [
  FEATURE_MARKERS.customAudio,
  FEATURE_MARKERS.hideWord,
  FEATURE_MARKERS.notifyWord,
  FEATURE_MARKERS.bulkImport,
  FEATURE_MARKERS.upgradePlan,
  FEATURE_MARKERS.testIcon,
  FEATURE_MARKERS.notificationIcon,
  FEATURE_MARKERS.sendTest,
  FEATURE_MARKERS.firstTestExited,
];
/** What any paid plan unlocks in addition to the ungated markers. */
const BASIC_SET = [
  FEATURE_MARKERS.themeShop,
  ...EVERY_PLAN_MARKERS,
  FEATURE_MARKERS.naturalAIVoice,
  FEATURE_MARKERS.aboutAIVoice,
];
/**
 * The two AI Voice surfaces.
 *
 * Basic reaches them now, through its one-time credit grant, so they are no
 * longer Premium-only. The marker rule was never restated in terms of a plan
 * name — it reads `planCanUseAI` — so it followed the entitlement here without
 * being edited, which is the property this file exists to protect.
 */
const AI_VOICE_MARKERS = [
  FEATURE_MARKERS.naturalAIVoice,
  FEATURE_MARKERS.aboutAIVoice,
];

function visible(plan: PlanTier, seen: string[] = [], isSubscriptionLoaded = true): FeatureMarkerId[] {
  return ALL.filter(marker =>
    shouldShowFeatureMarker({ marker, plan, isSubscriptionLoaded, seen: new Set(seen) }));
}

test('20. a Free user can discover every ungated control', () => {
  assert.deepEqual(visible('free').sort(), [...EVERY_PLAN_MARKERS].sort());
});

test('21. nothing is marked while the subscription state is unknown', () => {
  assert.deepEqual(visible('basic', [], false), []);
  assert.deepEqual(visible('premium', [], false), []);
});

test('15. Basic receives the Theme Shop, the ungated controls and the AI Voice surfaces', () => {
  assert.deepEqual(visible('basic').sort(), [...BASIC_SET].sort());
  // Free still reaches neither AI Voice surface — that boundary did not move.
  for (const marker of AI_VOICE_MARKERS) {
    assert.equal(visible('free').includes(marker), false, `${marker} is not Free`);
  }
});

test('16. Premium receives those plus both AI Voice surfaces', () => {
  assert.deepEqual(visible('premium').sort(), [...ALL].sort());
});

test('the plan requirement comes from each feature rule, not a tier list', () => {
  for (const marker of EVERY_PLAN_MARKERS) {
    for (const plan of ['free', 'basic', 'premium'] as const) {
      assert.equal(planUnlocksFeature(marker, plan), true, `${marker}/${plan} is ungated`);
    }
  }
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'free'), false);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'basic'), true);
  assert.equal(planUnlocksFeature(FEATURE_MARKERS.themeShop, 'premium'), true);
  for (const marker of AI_VOICE_MARKERS) {
    assert.equal(planUnlocksFeature(marker, 'free'), false);
    assert.equal(planUnlocksFeature(marker, 'basic'), true, `${marker} follows AI Voice`);
    assert.equal(planUnlocksFeature(marker, 'premium'), true);
  }
});

test('18. each marker dismisses independently', () => {
  const afterThemeShop = visible('premium', [FEATURE_MARKERS.themeShop]);
  assert.deepEqual(
    afterThemeShop.sort(),
    [...AI_VOICE_MARKERS, ...EVERY_PLAN_MARKERS].sort(),
    'opening one feature must not clear the others',
  );
  assert.deepEqual(visible('premium', [FEATURE_MARKERS.aboutAIVoice]).length, ALL.length - 1);
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
  // Asserted as an invariant rather than a fixed list: dismissing the control
  // removes that one marker and disturbs no other, whatever else the plan
  // happens to unlock. A literal list here would go stale every time a plan's
  // entitlements move, which is exactly what it did when Basic gained AI Voice.
  for (const plan of ['free', 'basic', 'premium'] as const) {
    const before = visible(plan);
    const after = visible(plan, [FEATURE_MARKERS.customAudio]);
    assert.equal(after.includes(FEATURE_MARKERS.customAudio), false, plan);
    assert.deepEqual(
      after.sort(),
      before.filter(marker => marker !== FEATURE_MARKERS.customAudio).sort(),
      `${plan}: dismissing custom audio must clear that marker and nothing else`,
    );
  }
});

test('17. a Basic user upgrading to Premium keeps what they already found', () => {
  // Basic already reaches every marker, so an upgrade reveals nothing new —
  // and, more to the point, does not bring back anything already dismissed.
  assert.deepEqual(visible('premium', BASIC_SET), []);
  // A marker not yet found is still marked after the upgrade.
  assert.deepEqual(
    visible('premium', [FEATURE_MARKERS.themeShop, ...EVERY_PLAN_MARKERS]).sort(),
    [...AI_VOICE_MARKERS].sort(),
  );
});

test('22. a downgrade hides inaccessible markers without erasing history', () => {
  const seen = [FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('free', seen).sort(), [...EVERY_PLAN_MARKERS].sort());
  // The set itself is untouched — hiding is by entitlement, not by forgetting.
  assert.deepEqual([...markFeatureSeen(new Set(seen), FEATURE_MARKERS.themeShop)], seen);
});

test('23. resubscribing does not restore a dismissed marker', () => {
  // The property that matters: a dismissed marker never comes back, on any
  // plan and through any cancel/resubscribe path. Stated over every marker and
  // every plan so it cannot be satisfied by a coincidence of one plan's set.
  for (const plan of ['free', 'basic', 'premium'] as const) {
    assert.deepEqual(visible(plan, ALL), [], `${plan}: everything dismissed stays dismissed`);
    for (const marker of ALL) {
      assert.equal(visible(plan, [marker]).includes(marker), false, `${plan}/${marker}`);
    }
  }
  // And a marker never found is still offered after the plan changes, so the
  // rule hides by entitlement rather than by forgetting what was seen.
  const seen = [...EVERY_PLAN_MARKERS, FEATURE_MARKERS.themeShop];
  assert.deepEqual(visible('premium', seen).sort(), [...AI_VOICE_MARKERS].sort());
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

// ── The Test → Notification sequence ─────────────────────────────────────────

/** Every marker rule takes the same three inputs; only the ids differ. */
function context(seen: string[] = []) {
  return { plan: 'free' as const, isSubscriptionLoaded: true, seen: new Set(seen) };
}

test('the Test marker shows until the icon has been tapped, then never again', () => {
  assert.equal(shouldShowTestMarker(context()), true);
  assert.equal(shouldShowTestMarker(context([FEATURE_MARKERS.testIcon])), false);
  // Nothing else can spend it, and nothing brings it back.
  assert.equal(shouldShowTestMarker(context([FEATURE_MARKERS.notificationIcon])), true);
  assert.equal(
    shouldShowTestMarker(context([FEATURE_MARKERS.testIcon, FEATURE_MARKERS.firstTestExited])),
    false,
  );
});

test('the Notification marker is withheld until the first test has been left', () => {
  // Nothing yet: the sequence has not started.
  assert.equal(shouldShowNotificationMarker(context()), false);
  // Tapped Test, still inside it. This is the case the sequence exists to
  // prevent — the header is on screen behind the test, so a marker here would
  // be spent before the user could act on it.
  assert.equal(shouldShowNotificationMarker(context([FEATURE_MARKERS.testIcon])), false);
  // Left the first test.
  assert.equal(
    shouldShowNotificationMarker(context([FEATURE_MARKERS.testIcon, FEATURE_MARKERS.firstTestExited])),
    true,
  );
  // Tapped the Notification icon: gone, and it stays gone.
  assert.equal(
    shouldShowNotificationMarker(context([
      FEATURE_MARKERS.testIcon,
      FEATURE_MARKERS.firstTestExited,
      FEATURE_MARKERS.notificationIcon,
    ])),
    false,
  );
});

test('the two header markers are never on screen at the same time', () => {
  // Whatever the stored set, at most one of the two is shown: the Test marker
  // is spent by the tap that starts the sequence the other one waits on.
  for (const seen of [
    [],
    [FEATURE_MARKERS.testIcon],
    [FEATURE_MARKERS.testIcon, FEATURE_MARKERS.firstTestExited],
    [FEATURE_MARKERS.testIcon, FEATURE_MARKERS.firstTestExited, FEATURE_MARKERS.notificationIcon],
    [FEATURE_MARKERS.firstTestExited],
  ]) {
    const both = [shouldShowTestMarker(context(seen)), shouldShowNotificationMarker(context(seen))];
    assert.notDeepEqual(both, [true, true], `both shown for ${seen.join()}`);
  }
});

test('the milestone is due once the test has been opened and is not open now', () => {
  const tapped = new Set<string>([FEATURE_MARKERS.testIcon]);
  // Inside the first test: not yet.
  assert.equal(hasExitedFirstTest(tapped, true), false);
  // Left it — and equally, relaunched after a force-quit inside it, which is
  // the same observation: opened once, not open now.
  assert.equal(hasExitedFirstTest(tapped, false), true);
  // Never tapped Test: nothing to have exited, whatever the mode is doing.
  assert.equal(hasExitedFirstTest(new Set(), false), false);
  assert.equal(hasExitedFirstTest(new Set(), true), false);
});

test('the Upgrade Plan marker is independent of the header sequence', () => {
  // It is not waiting on anything, and nothing in the sequence disturbs it.
  assert.equal(shouldShowFeatureMarker({ ...context(), marker: FEATURE_MARKERS.upgradePlan }), true);
  for (const seen of [
    [FEATURE_MARKERS.testIcon],
    [FEATURE_MARKERS.testIcon, FEATURE_MARKERS.firstTestExited],
    [FEATURE_MARKERS.notificationIcon],
  ]) {
    assert.equal(
      shouldShowFeatureMarker({ ...context(seen), marker: FEATURE_MARKERS.upgradePlan }),
      true,
      `disturbed by ${seen.join()}`,
    );
  }
  // Only its own tap clears it, and the header markers survive that.
  const afterUpgrade = context([FEATURE_MARKERS.upgradePlan]);
  assert.equal(shouldShowFeatureMarker({ ...afterUpgrade, marker: FEATURE_MARKERS.upgradePlan }), false);
  assert.equal(shouldShowTestMarker(afterUpgrade), true);

  // Every plan sees it, including the subscribed ones — a Basic user upgrading
  // to Premium is the other half of what this row is for.
  for (const plan of ['free', 'basic', 'premium'] as const) {
    assert.equal(planUnlocksFeature(FEATURE_MARKERS.upgradePlan, plan), true, plan);
  }
});
