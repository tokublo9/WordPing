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
 * A paid plan — Basic or Premium. It says nothing about local features such as
 * Custom Voice or Hide Word, which are available on every plan.
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
 * `0` here does not mean "no access". Basic sits at zero because it has no
 * *monthly* allowance — its access is the one-time grant in
 * VOICE_LIFETIME_CREDITS. Read the two tables together; `planCanUseAI` does.
 * Custom Voice is the user's own local audio and never reaches the Worker, so
 * it has no entry in either table.
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
 * One-time High-Quality AI Voice credits, mirroring the Worker's table.
 *
 * `null` means unmetered (Premium). `0` means the plan does not have the
 * feature (Free). Basic's number is granted once per subscription and never
 * refills — not monthly, not on renewal, not on reinstall. The balance itself
 * lives on the server and is never mirrored here: the app displays the size of
 * the grant, never a count it could get wrong.
 */
export const VOICE_LIFETIME_CREDITS: Readonly<Record<PlanTier, number | null>> = {
  free: 0,
  basic: 200,
  premium: null,
};

/**
 * Comparison-table value for the High-Quality AI Voice row.
 *
 * Returns null for a plan that includes the feature outright, so the table can
 * render its usual "included" symbol, and null for a plan that does not have it
 * at all, so the table renders its "not included" cross rather than the number
 * zero. A string is returned only for a plan that is genuinely metered — use
 * `planCanUseAI` to tell the two null cases apart.
 *
 * A one-time grant is labelled as one. Calling Basic's 200 a monthly figure
 * would be the same mistake the Worker's comment used to make, except in front
 * of the customer at the moment they are deciding what to buy.
 */
export function formatVoiceMonthlyLimit(tier: PlanTier, language: string): string | null {
  const isJapanese = language.startsWith('ja');
  const format = (value: number): string =>
    value.toLocaleString(isJapanese ? 'ja-JP' : 'en-US');

  const monthly = VOICE_MONTHLY_LIMITS[tier];
  if (monthly !== null && monthly !== 0) {
    return isJapanese ? `月${format(monthly)}回` : `${format(monthly)} / month`;
  }

  const lifetime = VOICE_LIFETIME_CREDITS[tier];
  if (lifetime !== null && lifetime !== 0) {
    return isJapanese ? `${format(lifetime)}回（1回限り）` : `${format(lifetime)} one-time`;
  }

  return null;
}
