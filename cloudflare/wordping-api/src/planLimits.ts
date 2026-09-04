import type { Feature, Tier } from './config';

/**
 * Plan limits — the authoritative copy.
 *
 * Enforced here, in the Worker, after the caller's tier has been verified
 * against RevenueCat. The app mirrors these in src/lib/planLimits.ts purely for
 * display; a test asserts the two agree.
 *
 * A client-supplied plan name or usage count is never read anywhere in this
 * Worker. The tier used below always comes from `resolveEntitlement`.
 */

/**
 * Features covered by the *monthly* High-Quality AI Voice allowance.
 *
 * Empty, and correctly so. Basic's allowance is a one-time grant that never
 * refills, which is a different thing with different rules and its own module
 * (lifetimeCredits.ts); Premium has never had a monthly product ceiling. So no
 * route is metered by the month today.
 *
 * The machinery is kept rather than deleted because it is the right shape for
 * any future feature that genuinely renews monthly, and because `monthKey` /
 * `monthResetsAt` must not be borrowed for the lifetime balance — a balance
 * that silently reset at a month boundary would hand out unlimited credits.
 * Listing a feature here re-arms it; nothing else needs to change.
 */
export const VOICE_QUOTA_FEATURES: readonly Feature[] = [];

export function isVoiceQuotaFeature(feature: Feature): boolean {
  return VOICE_QUOTA_FEATURES.includes(feature);
}

/**
 * High-Quality AI Voice generations allowed per UTC calendar month.
 *
 * `null` means no monthly product quota. Premium is sold as included, so it has
 * none — but "no monthly quota" is not "no limits": Premium is still subject to
 * entitlement verification, the per-minute and per-day abuse limits in
 * ratelimit.ts, the kill switches, and the OpenAI project budget.
 *
 * `0` here no longer means "does not have the feature". Basic sits at zero
 * because it has no *monthly* allowance — its access is the one-time credit
 * grant in VOICE_LIFETIME_CREDITS. Read the two together; the app mirrors both
 * and derives eligibility from the pair.
 */
export const VOICE_MONTHLY_LIMITS: Readonly<Record<Tier, number | null>> = {
  free: 0,
  basic: 0,
  premium: null,
};

/**
 * One-time High-Quality AI Voice credits, granted once per subscriber identity.
 *
 * `null` means the tier is unmetered (Premium). `0` means the tier does not
 * have the feature at all (Free). Basic's number is the grant, issued the first
 * time that subscriber generates and never reissued — see lifetimeCredits.ts,
 * which owns the balance and is the only place it is spent.
 */
export const VOICE_LIFETIME_CREDITS: Readonly<Record<Tier, number | null>> = {
  free: 0,
  basic: 200,
  premium: null,
};

/**
 * The UTC calendar month a timestamp falls in, as `YYYY-MM`.
 *
 * UTC rather than device-local: the counter is shared by every device on an
 * account, and a local-time boundary would let someone straddling a timezone
 * roll their quota over twice.
 */
export function monthKey(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

/** Start of the next UTC month — when the allowance resets. */
export function monthResetsAt(now: number): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)).toISOString();
}

/**
 * Seconds until the counter may be discarded. One extra month of slack so a
 * clock skew near the boundary cannot expire a live counter.
 */
export function monthlyCounterTtlSeconds(now: number): number {
  const resetsAt = Date.parse(monthResetsAt(now));
  const oneMonth = 60 * 60 * 24 * 31;
  return Math.max(60, Math.ceil((resetsAt - now) / 1000) + oneMonth);
}
