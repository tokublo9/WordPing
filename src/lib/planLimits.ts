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
 * High-Quality AI Voice generations allowed per UTC calendar month.
 *
 * `null` means the plan has no monthly product quota. Premium is sold as
 * included, so it has none — which is not the same as unprotected: Premium is
 * still subject to entitlement verification and the Worker's short-term abuse
 * limits.
 *
 * Counted only for generations that actually reach OpenAI. Audio replayed from
 * the device cache, cached voice previews and free-plan device TTS never touch
 * the allowance because they never reach the Worker.
 */
export const VOICE_MONTHLY_LIMITS: Readonly<Record<PlanTier, number | null>> = {
  free: 0,
  basic: 100,
  premium: null,
};

/**
 * Comparison-table value for the High-Quality AI Voice row.
 *
 * Returns null for a plan that includes the feature outright, so the table can
 * render its usual "included" symbol rather than a number.
 */
export function formatVoiceMonthlyLimit(tier: PlanTier, language: string): string | null {
  const limit = VOICE_MONTHLY_LIMITS[tier];
  if (limit === null) return null;

  const isJapanese = language.startsWith('ja');
  if (limit === 0) return isJapanese ? '0回' : '0';
  const formatted = limit.toLocaleString(isJapanese ? 'ja-JP' : 'en-US');
  return isJapanese ? `月${formatted}回` : `${formatted} / month`;
}
