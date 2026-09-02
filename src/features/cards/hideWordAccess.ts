import type { PlanTier } from '../../lib/planLimits';

/**
 * Who may use Hide Word.
 *
 * Basic, and only Basic. This is the one rule in the app that is not a ladder:
 * Premium does *not* inherit it, so `planUnlocksHideWord` cannot be expressed as
 * "any paid plan" or derived from another feature. It is deliberately its own
 * module for that reason — Hide Word and Custom Voice happen to be available to
 * the same users today only because Basic has both, and folding one into the
 * other would silently give Hide Word to Premium the moment anything moved.
 *
 *   Hide Word              → Basic only
 *   Custom Voice for Words → any paid plan   (features/voice/customVoiceAccess.ts)
 *   High-Quality AI Voice  → Premium only    (lib/aiEntitlement.ts)
 *
 * Because the rule names a tier, it lives here rather than in a component: a
 * `plan === 'basic'` written inline in a sheet or a card is exactly the check
 * that drifts. Components receive the resolved boolean.
 *
 * Pure — no react-native or expo import — so the rules are tested directly.
 */

/** The only plan that unlocks Hide Word. */
export const HIDE_WORD_PLAN: PlanTier = 'basic';

export function planUnlocksHideWord(plan: PlanTier): boolean {
  return plan === HIDE_WORD_PLAN;
}

export interface HideWordAccessInput {
  /** The verified tier from useSubscription. */
  plan: PlanTier;
  /**
   * False until RevenueCat has answered — at launch, during a restore, and
   * while an offline cached entitlement is being refreshed.
   */
  isSubscriptionLoaded: boolean;
}

export type HideWordAccess = 'allowed' | 'locked';

/**
 * Resolves access, defaulting closed.
 *
 * Locked while the plan is unknown, in the same direction as every other paid
 * feature. The cost of failing closed here is unusual and worth stating: a
 * hidden word briefly shows its text during launch rather than briefly hiding
 * it. That is the safe direction — revealing a word early is a study annoyance,
 * whereas hiding one on an unknown plan would leave a user staring at a card
 * they have no way to un-hide.
 */
export function resolveHideWordAccess({
  plan,
  isSubscriptionLoaded,
}: HideWordAccessInput): HideWordAccess {
  return isSubscriptionLoaded && planUnlocksHideWord(plan) ? 'allowed' : 'locked';
}

export function canUseHideWord(input: HideWordAccessInput): boolean {
  return resolveHideWordAccess(input) === 'allowed';
}

/**
 * Whether a card's word text is hidden right now.
 *
 * Two things have to be true: the user asked for it on this word, and the plan
 * may use the feature. Gating the *display* as well as the toggle is what keeps
 * a plan without Hide Word from inheriting a hidden card it cannot reveal —
 * losing access shows the word again rather than stranding it.
 *
 * The stored per-word flag is never touched by any of this. It survives a plan
 * change, an edit and a backup round trip, so returning to Basic restores every
 * word exactly as it was left.
 */
export function isWordTextHidden(
  card: { hideWord?: boolean } | null | undefined,
  canHideWord: boolean,
): boolean {
  return canHideWord && card?.hideWord === true;
}
