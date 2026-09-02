import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUSTOM_VOICE_MIN_PLAN,
  canUseCustomVoice,
  planUnlocksCustomVoice,
  resolveCustomVoiceAccess,
} from '../../src/features/voice/customVoiceAccess';
import { planCanUseAI } from '../../src/lib/aiEntitlement';
import { planIsSubscribed, type PlanTier } from '../../src/lib/planLimits';

/**
 * Custom Voice for Words — the user's own audio file attached to a word.
 *
 * Sold to any paid plan, and deliberately not to the same plan as High-Quality
 * AI Voice. The pair of rules is the point of these tests: one feature moving
 * must not drag the other with it.
 */

const PLANS: PlanTier[] = ['free', 'basic', 'premium'];

test('Custom Voice starts at Basic and is included in every paid plan', () => {
  assert.equal(CUSTOM_VOICE_MIN_PLAN, 'basic');
  assert.equal(planUnlocksCustomVoice('free'), false);
  assert.equal(planUnlocksCustomVoice('basic'), true);
  assert.equal(planUnlocksCustomVoice('premium'), true);
});

test('the two voice features are sold to different plans', () => {
  // Basic is exactly the plan where they disagree, which is what makes a single
  // `isSubscribed` flag the wrong thing to gate either of them on.
  assert.equal(planUnlocksCustomVoice('basic'), true);
  assert.equal(planCanUseAI('basic'), false);
  assert.equal(planUnlocksCustomVoice('premium'), planCanUseAI('premium'));
  assert.equal(planUnlocksCustomVoice('free'), planCanUseAI('free'));
});

test('the paid-plan rule is shared, not restated', () => {
  // Custom Voice is "any subscription", and that definition lives in one place,
  // so a new tier does not have to be added to two lists.
  for (const plan of PLANS) {
    assert.equal(planUnlocksCustomVoice(plan), planIsSubscribed(plan), plan);
  }
});

test('access defaults closed until RevenueCat has answered', () => {
  // The same direction as backup: a brief lock during launch or a restore beats
  // playing a paid feature on an unknown plan.
  assert.equal(
    resolveCustomVoiceAccess({ isSubscribed: true, isSubscriptionLoaded: false }),
    'locked',
  );
  assert.equal(
    resolveCustomVoiceAccess({ isSubscribed: false, isSubscriptionLoaded: false }),
    'locked',
  );
  assert.equal(
    resolveCustomVoiceAccess({ isSubscribed: false, isSubscriptionLoaded: true }),
    'locked',
  );
  assert.equal(
    resolveCustomVoiceAccess({ isSubscribed: true, isSubscriptionLoaded: true }),
    'allowed',
  );
});

test('canUseCustomVoice agrees with resolveCustomVoiceAccess', () => {
  for (const isSubscribed of [true, false]) {
    for (const isSubscriptionLoaded of [true, false]) {
      const input = { isSubscribed, isSubscriptionLoaded };
      assert.equal(canUseCustomVoice(input), resolveCustomVoiceAccess(input) === 'allowed');
    }
  }
});

test('a downgrade locks the feature again the moment the plan is known', () => {
  // Locking hides the control and the playback; it never touches the stored
  // audioUri, so upgrading again restores the word's voice untouched.
  assert.equal(canUseCustomVoice({ isSubscribed: true, isSubscriptionLoaded: true }), true);
  assert.equal(canUseCustomVoice({ isSubscribed: false, isSubscriptionLoaded: true }), false);
});
