import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HIDE_WORD_PLAN,
  canUseHideWord,
  isWordTextHidden,
  planUnlocksHideWord,
  resolveHideWordAccess,
} from '../../src/features/cards/hideWordAccess';
import { planUnlocksCustomVoice } from '../../src/features/voice/customVoiceAccess';
import { planCanUseAI } from '../../src/lib/aiEntitlement';
import { planIsSubscribed, type PlanTier } from '../../src/lib/planLimits';

/**
 * Hide Word — Basic exclusively.
 *
 * The only rule in the app that is not a ladder, which is exactly why it has its
 * own module: it cannot be derived from "any paid plan" or from another feature
 * without silently reaching Premium.
 */

const PLANS: PlanTier[] = ['free', 'basic', 'premium'];

test('Basic unlocks it and nothing else does', () => {
  assert.equal(HIDE_WORD_PLAN, 'basic');
  assert.equal(planUnlocksHideWord('free'), false);
  assert.equal(planUnlocksHideWord('basic'), true);
  assert.equal(planUnlocksHideWord('premium'), false, 'Premium is deliberately excluded');
  assert.equal(
    canUseHideWord({ plan: 'basic', isSubscriptionLoaded: true }),
    true,
    'an active, loaded Basic entitlement must render the Hide Word control',
  );
});

test('it is not derivable from any other capability', () => {
  // If it were, moving one feature would move this one too. Each of these
  // disagrees with Hide Word on at least one plan, which is the whole point.
  const hide = PLANS.map(planUnlocksHideWord);
  assert.notDeepEqual(hide, PLANS.map(planIsSubscribed), 'not "any paid plan"');
  assert.notDeepEqual(hide, PLANS.map(planUnlocksCustomVoice), 'not Custom Voice');
  assert.notDeepEqual(hide, PLANS.map(planCanUseAI), 'not AI Voice');

  // Concretely: Premium has Custom Voice and AI Voice, and not this.
  assert.equal(planUnlocksCustomVoice('premium'), true);
  assert.equal(planCanUseAI('premium'), true);
  assert.equal(planUnlocksHideWord('premium'), false);
});

test('access defaults closed until RevenueCat has answered', () => {
  assert.equal(resolveHideWordAccess({ plan: 'basic', isSubscriptionLoaded: false }), 'locked');
  assert.equal(resolveHideWordAccess({ plan: 'basic', isSubscriptionLoaded: true }), 'allowed');
  for (const plan of ['free', 'premium'] as const) {
    assert.equal(resolveHideWordAccess({ plan, isSubscriptionLoaded: true }), 'locked', plan);
  }
});

test('canUseHideWord agrees with resolveHideWordAccess', () => {
  for (const plan of PLANS) {
    for (const isSubscriptionLoaded of [true, false]) {
      const input = { plan, isSubscriptionLoaded };
      assert.equal(canUseHideWord(input), resolveHideWordAccess(input) === 'allowed');
    }
  }
});

// ── What the card actually draws ─────────────────────────────────────────────

test('a word is hidden only when both the flag and the plan say so', () => {
  assert.equal(isWordTextHidden({ hideWord: true }, true), true);
  assert.equal(isWordTextHidden({ hideWord: true }, false), false, 'plan cannot use it');
  assert.equal(isWordTextHidden({ hideWord: false }, true), false);
  assert.equal(isWordTextHidden({}, true), false, 'off unless asked for');
});

test('losing access reveals the word rather than stranding it', () => {
  // A plan without Hide Word has no toggle, so a card that stayed hidden would
  // be one the user could never reveal. The stored flag is untouched: it is
  // still there for a return to Basic.
  const card = { hideWord: true };
  assert.equal(isWordTextHidden(card, false), false);
  assert.equal(card.hideWord, true, 'the setting itself is not cleared');
  assert.equal(isWordTextHidden(card, true), true, 'and it applies again on return');
});

test('a missing card is never treated as hidden', () => {
  // Flip has no centred card in an empty folder; Test Mode has none once done.
  assert.equal(isWordTextHidden(null, true), false);
  assert.equal(isWordTextHidden(undefined, true), false);
});
