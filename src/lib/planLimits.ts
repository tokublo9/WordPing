/**
 * Plan limits — the client's copy.
 *
 * The Cloudflare Worker holds the authoritative copy in
 * cloudflare/wordping-api/src/planLimits.ts and is what actually enforces these
 * numbers. This file exists so the paywall comparison table can show the same
 * figure without a network round trip.
 *
 * The two files are kept in step by a test (tests/unit/planLimits.test.ts) that
 * reads both and fails if they diverge. Change one, change the other.
 *
 * Nothing here is a permission check. The client never decides whether a
 * request is allowed — it asks, and the Worker answers.
 */

export type PlanTier = 'free' | 'basic' | 'premium';

/**
 * A paid plan — Basic or Premium.
 *
 * The tier-typed form of `useSubscription`'s `isSubscribed`, defined once so
 * the features sold to "any subscriber" (themes, skins, Custom Voice for Words)
 * do not each restate the tier list. It says nothing about AI: that is
 * `planCanUseAI`, and the two deliberately differ.
 */
export function planIsSubscribed(plan: PlanTier): boolean {
  return plan !== 'free';
}

/**
 * High-Quality AI Voice generations allowed per UTC calendar month.
 *
 * `null` means the plan has no monthly product quota. Premium is sold as
 * included, so it has none — which is not the same as unprotected: Premium is
 * still subject to entitlement verification and the Worker's short-term abuse
 * limits.
 *
 * `0` means the plan does not have the feature at all. Free and Basic both sit
 * there: AI Voice is a Premium feature. Basic's own voice feature is Custom
 * Voice for Words, which is the user's own audio file and never reaches this
 * Worker — see features/voice/customVoiceAccess.ts.
 *
 * Counted only for word-card generations that actually reach OpenAI. Audio
 * replayed from the device cache, voice-picker previews and device TTS never
 * touch the allowance.
 */
export const VOICE_MONTHLY_LIMITS: Readonly<Record<PlanTier, number | null>> = {
  free: 0,
  basic: 0,
  premium: null,
};

/**
 * Comparison-table value for the High-Quality AI Voice row.
 *
 * Returns null for a plan that includes the feature outright, so the table can
 * render its usual "included" symbol, and null for a plan that does not have it
 * at all, so the table renders its "not included" cross rather than the number
 * zero. A number is returned only for a plan that is genuinely metered — use
 * `planCanUseAI` to tell the two null cases apart.
 */
export function formatVoiceMonthlyLimit(tier: PlanTier, language: string): string | null {
  const limit = VOICE_MONTHLY_LIMITS[tier];
  if (limit === null || limit === 0) return null;

  const isJapanese = language.startsWith('ja');
  const formatted = limit.toLocaleString(isJapanese ? 'ja-JP' : 'en-US');
  return isJapanese ? `月${formatted}回` : `${formatted} / month`;
}
