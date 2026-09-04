import { AIRequestError } from './api/errors';
import {
  VOICE_LIFETIME_CREDITS,
  VOICE_MONTHLY_LIMITS,
  type PlanTier,
} from './planLimits';

/**
 * Who may use the AI features, in one place.
 *
 * Eligibility is derived from the existing entitlement configuration rather
 * than restated: between them, `VOICE_MONTHLY_LIMITS` and
 * `VOICE_LIFETIME_CREDITS` already say that Premium is included outright, Basic
 * has a one-time grant, and Free has nothing. A plan added or repriced there
 * changes this rule automatically, and there is no second list of tier names to
 * fall out of step.
 *
 * Eligibility is not the same as a balance. This says Basic may make the
 * request; whether a credit remains is the server's answer, and an exhausted
 * balance comes back as `voice_credits_exhausted` rather than being predicted
 * here. The app never holds a credit count it could show wrongly.
 *
 * This is the AI rule alone. Custom Voice is a local feature available on every
 * plan and reaches no network, so it is intentionally unrelated to this gate.
 *
 * This is a client-side gate, not an authorisation: the Worker still verifies
 * every entitlement against RevenueCat. What it buys is that an ineligible
 * device sends nothing at all — no request, no identifiers, no consent prompt.
 *
 * Pure — no react-native or expo import — so the rules are tested directly.
 */

/** True when either of the plan's own configured AI allowances is non-zero. */
export function planCanUseAI(plan: PlanTier): boolean {
  return VOICE_MONTHLY_LIMITS[plan] !== 0 || VOICE_LIFETIME_CREDITS[plan] !== 0;
}

export interface AIEntitlementState {
  plan: PlanTier;
  /** False until RevenueCat has answered. Nothing is eligible before then. */
  isSubscriptionLoaded: boolean;
  /**
   * Non-null once a real RevenueCat snapshot has been applied.
   *
   * `useSubscription` leaves this null when RevenueCat could not be reached, so
   * it is what separates "verified as Free" from "we do not know yet".
   */
  entitlementSource: string | null;
}

/** The unresolved state every launch starts in: eligible for nothing. */
export const UNKNOWN_AI_ENTITLEMENT: AIEntitlementState = {
  plan: 'free',
  isSubscriptionLoaded: false,
  entitlementSource: null,
};

/**
 * Whether AI requests may be made at all.
 *
 * Requires the subscription state to have loaded, so a request cannot slip out
 * during the moment before RevenueCat answers.
 */
export function hasEligibleAIEntitlement(state: AIEntitlementState): boolean {
  return state.isSubscriptionLoaded && planCanUseAI(state.plan);
}

/**
 * A plan confirmed to have no AI access — not merely an unknown one.
 *
 * The distinction matters because this is what invalidates a stored consent. A
 * RevenueCat outage leaves the plan at its 'free' default with no source, and
 * treating that as a cancellation would revoke a subscriber's permission
 * because their network was down.
 *
 * Named for AI eligibility rather than for the Free plan because the two stopped
 * being the same thing when AI Voice became Premium: a verified Basic plan is
 * now also confirmed to have no AI access, and its stored consent belongs to a
 * period that has ended just as surely as a cancelled one does.
 */
export function isVerifiedAIIneligiblePlan(state: AIEntitlementState): boolean {
  return state.isSubscriptionLoaded
    && state.entitlementSource !== null
    && !planCanUseAI(state.plan);
}

// ── The live snapshot the network guard reads ────────────────────────────────

let current: AIEntitlementState = UNKNOWN_AI_ENTITLEMENT;

/** Published by App whenever the subscription state changes. */
export function setAIEntitlementSnapshot(state: AIEntitlementState): void {
  current = state;
}

export function getAIEntitlementSnapshot(): AIEntitlementState {
  return current;
}

/** Test seam — returns to the unresolved state. */
export function resetAIEntitlementForTests(): void {
  current = UNKNOWN_AI_ENTITLEMENT;
}

export function isAIEntitlementEligible(): boolean {
  return hasEligibleAIEntitlement(current);
}

/**
 * The guard. Throws unless the current plan may use AI.
 *
 * Paired with `requireAIConsent` at the single network boundary, so a request
 * needs both an eligible entitlement and an explicit permission — and neither
 * screen state nor a background task can supply one without the other.
 */
export function requireAIEntitlement(): void {
  if (isAIEntitlementEligible()) return;
  throw new AIRequestError('subscription_required', {
    serverCode: current.isSubscriptionLoaded ? 'plan_not_eligible' : 'entitlement_unresolved',
  });
}
