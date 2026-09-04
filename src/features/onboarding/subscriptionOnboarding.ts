import type { AIConsentState } from '../../lib/aiConsent';
import { planCanUseAI } from '../../lib/aiEntitlement';
import type { PlanTier } from '../../lib/planLimits';

/**
 * Asking for AI data-sharing permission once, after a subscription starts.
 *
 * A user who has just paid for AI Voice is the one moment where the permission
 * question is expected rather than intrusive. This offers it once at that
 * moment; every other route to it stays exactly as it was, at the point of use.
 *
 * "Paid for AI Voice" means Premium. A Basic purchase is not that moment;
 * upgrading Basic → Premium is, and the offer becomes available then.
 *
 * The offer is deliberately narrow. It follows a *verified* purchase, it waits
 * until the Upgrade sheet is gone, and it is recorded so it cannot repeat on
 * the next launch or the next time that sheet closes.
 *
 * Pure — no react-native import — so each condition is tested directly.
 */

/** Versioned: a later release may offer a different onboarding step. */
export const SUBSCRIPTION_CONSENT_PROMPT_KEY = 'wordping_subscription_consent_prompt_v1';

export function parseConsentPromptShown(raw: string | null | undefined): boolean {
  return raw === 'true';
}

export function serializeConsentPromptShown(shown: boolean): string {
  return shown ? 'true' : 'false';
}

export interface SubscriptionConsentPromptInput {
  plan: PlanTier;
  isSubscriptionLoaded: boolean;
  /**
   * How the current entitlement was resolved.
   *
   * `after-purchase-refresh` is the only value RevenueCat produces by
   * completing a purchase, which is what makes this a *verified* purchase
   * rather than a guess. A cancelled or failed purchase never reaches it, and
   * neither does a plain app launch — so nothing else can trigger the offer.
   */
  entitlementSource: string | null;
  /** Current stored decision. */
  consent: AIConsentState;
  /** Stored value of SUBSCRIPTION_CONSENT_PROMPT_KEY. */
  alreadyPrompted: boolean;
  /** The Upgrade sheet has finished closing. */
  isUpgradeSheetClosed: boolean;
  /** Onboarding, another modal or a transient mode owns the screen. */
  isScreenBusy: boolean;
}

/**
 * Whether to offer the permission dialog now.
 *
 * Every condition is a reason not to ask, listed in the order it rules the
 * offer out:
 *
 *  - the subscription state is still loading, or fell back to unknown;
 *  - the plan is not one that can use AI, so there is nothing to permit;
 *  - the entitlement did not come from a completed purchase — a cancelled
 *    purchase, a failed one, or a plain launch all stop here;
 *  - permission is already granted, including on a Basic → Premium upgrade;
 *  - the offer has already been made once;
 *  - the Upgrade sheet is still on screen, or something else is.
 *
 * A previously declined answer does *not* stop it: `alreadyPrompted` is cleared
 * on a verified downgrade, so the next real subscription asks again.
 */
export function shouldPromptConsentAfterSubscription(
  input: SubscriptionConsentPromptInput,
): boolean {
  if (!input.isSubscriptionLoaded) return false;
  // The AI rule, not a plan name. Basic is a paying plan with no AI feature, so
  // there is no data sharing to ask about. Asking anyway would be a permission
  // dialog for something that plan cannot do.
  if (!planCanUseAI(input.plan)) return false;
  if (input.entitlementSource !== 'after-purchase-refresh') return false;
  if (input.consent === 'granted') return false;
  if (input.alreadyPrompted) return false;
  return input.isUpgradeSheetClosed && !input.isScreenBusy;
}
