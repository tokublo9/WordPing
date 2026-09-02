import { planIsSubscribed, type PlanTier } from '../../lib/planLimits';

/**
 * Who may use Custom Voice for Words.
 *
 * Custom Voice is the user's own audio file attached to a word — picked on the
 * device, stored on the device, played from the device. It is not an AI
 * feature and never reaches the Worker, which is why it is decided here and not
 * in `aiEntitlement.ts`: the two voice features are sold to different plans and
 * must not be able to drift into each other's rule.
 *
 *   Custom Voice for Words  → Basic and Premium
 *   High-Quality AI Voice   → Premium only (see lib/planLimits.ts)
 *
 * Deciding it here rather than inline in the components means the word editor's
 * attach control, the card's voice button and the paywall's comparison table
 * are provably asking the same question.
 *
 * Pure — no react-native or expo import — so the rules are tested directly.
 */

/** The lowest plan that unlocks Custom Voice for Words. */
export const CUSTOM_VOICE_MIN_PLAN: PlanTier = 'basic';

export function planUnlocksCustomVoice(plan: PlanTier): boolean {
  return planIsSubscribed(plan);
}

export interface CustomVoiceAccessInput {
  /** `plan !== 'free'` from useSubscription — Basic or Premium. */
  isSubscribed: boolean;
  /**
   * False until RevenueCat has answered — at launch, during a restore, and
   * while an offline cached entitlement is being refreshed.
   */
  isSubscriptionLoaded: boolean;
}

export type CustomVoiceAccess = 'allowed' | 'locked';

/**
 * Resolves access, defaulting closed.
 *
 * An unresolved entitlement counts as locked, in the same direction as backup:
 * a brief lock during launch is a small annoyance, whereas playing a paid
 * feature on an unknown plan is a revenue bug. A word that already has audio
 * attached keeps it either way — locking hides the control and the playback,
 * never the data.
 */
export function resolveCustomVoiceAccess({
  isSubscribed,
  isSubscriptionLoaded,
}: CustomVoiceAccessInput): CustomVoiceAccess {
  return isSubscriptionLoaded && isSubscribed ? 'allowed' : 'locked';
}

export function canUseCustomVoice(input: CustomVoiceAccessInput): boolean {
  return resolveCustomVoiceAccess(input) === 'allowed';
}
